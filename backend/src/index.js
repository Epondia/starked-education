const express = require('express');
const helmet = require('helmet');
const { createServer } = require('http');
const dotenv = require('dotenv');

const { connectRedis } = require('./utils/redis');
const { initWebsocketService } = require('./services/websocketService');
const { setSyncWebsocketEmitter } = require('./services/syncService');
const { initCollaborationService } = require('./services/initCollaboration');
const { Redis } = require('ioredis');
const SecureRealtimeCommunication = require('./services/secureRealtimeCommunication').default;

// Import circuit breaker registry
const { circuitBreakerRegistry } = require('./utils/circuitBreaker');

// Import timeout and circuit-breaker middleware (Issue #307)
const { routeTimeout } = require('./middleware/timeout');
const { circuitBreakerMiddleware, circuitBreakerStatusHandler } = require('./middleware/circuitBreakerMiddleware');

const { transactionQueue } = require('./services/transactionQueue');
const transactionProcessor = require('./workers/transactionProcessor');
const transactionEvents = require('./events/transactionEvents');
const emailWorker = require('./workers/emailWorker');

// Event Indexer – polls Soroban for on-chain events and syncs them to PostgreSQL
let eventIndexerInstance = null;
const EVENT_INDEXER_ENABLED = process.env.EVENT_INDEXER_ENABLED === 'true';

// Import security middleware
const {
  securityPerformanceTracker,
  checkBlacklist,
  ddosProtection,
  botDetection,
  advancedRestrictions,
  requestSanitizer
} = require('./middleware/security');
const { globalLimiter } = require('./middleware/rateLimiter');
const { authenticateToken, requireAdmin } = require('./middleware/auth');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  contentSecurityPolicy,
  cspViolationReporter
} = require('./middleware/contentSecurityPolicy');

// Import compression middleware
const { compressionMiddleware, getCompressionStats } = require('./middleware/compression');

// Import versioning middleware
const { versionExtractor, createVersionedRouter, SUPPORTED_VERSIONS, DEFAULT_VERSION } = require('./middleware/versioning');

// Import error handling middleware and response helpers
const { errorHandler } = require('./middleware/errorHandler');
const { createVersionedResponse } = require('./utils/schemas');
const { ValidationError } = require('./utils/errors');

// Load environment variables
dotenv.config();

// Import logger
const logger = require('./utils/logger');

// Connect to Redis
connectRedis();

// Register email queue handler for async email delivery
try {
  const { registerEmailQueueHandler } = require('./services/emailService');
  registerEmailQueueHandler();
  console.log('📧 Email queue handler registered');
} catch (err) {
  console.warn('Warning: Could not register email queue handler:', err.message);
}

// Helper for default-exported route modules
const resolveRoute = (routeModule) => routeModule.default || routeModule;

// Import routes
const quizRoutes = resolveRoute(require('./routes/quizRoutes'));
const eventLoggerRoutes = resolveRoute(require('./routes/eventLoggerRoutes'));
const syncRoutes = resolveRoute(require('./routes/syncRoutes'));
const rbacRoutes = resolveRoute(require('./routes/rbacRoutes'));
const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const courseRoutes = require('./routes/courses');
const searchRoutes = require('./routes/search');
const transactionRoutes = require('./routes/transactions');
const notificationRoutes = resolveRoute(require('./routes/notificationRoutes'));
const webhookRoutes = resolveRoute(require('./routes/webhookRoutes'));

// Your branch routes
const collaborationRoutes = resolveRoute(require('./routes/collaborationRoutes'));
const holographicRoutes = resolveRoute(require('./routes/holographicRoutes'));
let secureCommRoutes;
try {
  secureCommRoutes = resolveRoute(require('./routes/secureCommRoutes'));
} catch (err) {
  console.warn('Warning: Could not load secureCommRoutes:', err.message);
  const express = require('express');
  secureCommRoutes = express.Router();
}

// Upstream routes
const acoRoutes = require('./routes/aco');
const federatedLearningRoutes = require('./routes/federatedLearning');
const swarmLearningRoutes = require('./routes/swarmLearning');
const smartWalletRoutes = resolveRoute(require('./routes/smartWallet'));

// AGI Tutor routes
const agiTutorRoutes = resolveRoute(require('./routes/agiTutorRoutes'));

// Analytics routes
const analyticsRoutes = require('./routes/analytics');

// Swagger documentation
const { setupSwagger } = require('./docs/swagger');

// Initialize Express app
const app = express();
const server = createServer(app);
const websocketService = initWebsocketService(server);
const collaborationService = initCollaborationService(server);

// Initialize secure communication
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD
});
const secureCommService = new SecureRealtimeCommunication(websocketService.io, redis);

setSyncWebsocketEmitter((userId, event, data) => {
  websocketService.emitToUser(userId, event, data);
});

// Middleware
app.use(helmet());
app.use(contentSecurityPolicy());

// CORS (issue #384): disabled unless ENABLE_CORS === 'true'; when enabled,
// restricted to the CORS_ORIGINS allowlist with credentials.
const { buildCorsMiddleware } = require('./middleware/cors');
const corsMiddleware = buildCorsMiddleware();
if (corsMiddleware) {
  app.use(corsMiddleware);
}
app.post(
  '/api/v1/security/csp-report',
  express.json({
    limit: '16kb',
    type: ['application/csp-report', 'application/reports+json', 'application/json']
  }),
  cspViolationReporter
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Structured request/response logging middleware
const requestLogger = require('./middleware/requestLogger');
const auditLogger = require('./middleware/auditLogger');
app.use(requestLogger);
app.use(auditLogger);

// Health check routes - mounted before auth middleware so load balancers can access without credentials
const healthModule = require('./routes/health');
const healthRoutes = healthModule.default || healthModule;
app.use('/health', healthRoutes);

// Prometheus metrics endpoint - internal-only (loopback or shared token), exposed
// at the conventional /metrics path. Handler lives in routes/health.ts.
app.use('/metrics', healthModule.metricsRouter);

// Issue #17: Apply the global rate limit baseline AFTER /health so probes
// bypass the limiter entirely (no Redis traffic from liveness/readiness checks).
// Endpoint-specific limiters (loginLimiter, registerLimiter, paymentLimiter,
// adminTierLimiter, etc.) take precedence over the global baseline.
//
// The app-level registration below covers every /api/v1 route (and /api/v2),
// so the router-level registration was removed to avoid double-counting each
// request against the same limiter (which halved the effective limit and
// doubled Redis traffic).
app.use(globalLimiter);

// Apply API version extraction middleware globally
app.use(versionExtractor);

// ── Per-route timeouts & circuit breakers (Issue #307) ──────────
// Timeout defaults (ms) – different endpoint classes get different limits.
const TIMEOUTS = {
  auth: parseInt(process.env.TIMEOUT_AUTH_MS) || 15000,       // auth should be fast
  read: parseInt(process.env.TIMEOUT_READ_MS) || 30000,       // standard read
  write: parseInt(process.env.TIMEOUT_WRITE_MS) || 30000,     // standard write
  upload: parseInt(process.env.TIMEOUT_UPLOAD_MS) || 120000,  // file uploads
  search: parseInt(process.env.TIMEOUT_SEARCH_MS) || 15000,   // search queries
  realtime: parseInt(process.env.TIMEOUT_REALTIME_MS) || 10000, // collaborative/realtime
  external: parseInt(process.env.TIMEOUT_EXTERNAL_MS) || 30000, // external service calls
};

// Create versioned routers
const v1Router = createVersionedRouter('v1');

// ── v1 API Routes ──────────────────────────────────────────────
// All existing routes are mounted under /api/v1/
v1Router.use('/quizzes', routeTimeout(TIMEOUTS.read, { label: 'quizzes' }), quizRoutes);
v1Router.use('/events', routeTimeout(TIMEOUTS.write, { label: 'events' }), eventLoggerRoutes);
v1Router.use('/sync', routeTimeout(TIMEOUTS.write, { label: 'sync' }), circuitBreakerMiddleware('redis', { failureThreshold: 3, timeoutWindow: 30000, halfOpenMaxRequests: 2 }), syncRoutes);
v1Router.use('/auth', routeTimeout(TIMEOUTS.auth, { label: 'auth' }), authRoutes);
v1Router.use('/content', routeTimeout(TIMEOUTS.write, { label: 'content' }), contentRoutes);
v1Router.use('/courses', routeTimeout(TIMEOUTS.read, { label: 'courses' }), courseRoutes);
v1Router.use('/search', routeTimeout(TIMEOUTS.search, { label: 'search' }), searchRoutes());
v1Router.use('/rbac', routeTimeout(TIMEOUTS.read, { label: 'rbac' }), rbacRoutes);
v1Router.use('/transactions', routeTimeout(TIMEOUTS.write, { label: 'transactions' }), circuitBreakerMiddleware('stellar', { failureThreshold: 3, timeoutWindow: 30000, halfOpenMaxRequests: 2 }), transactionRoutes);
v1Router.use('/notifications', routeTimeout(TIMEOUTS.read, { label: 'notifications' }), notificationRoutes);
v1Router.use('/webhooks', routeTimeout(TIMEOUTS.write, { label: 'webhooks' }), webhookRoutes);
v1Router.use('/collaboration', routeTimeout(TIMEOUTS.realtime, { label: 'collaboration' }), collaborationRoutes);
v1Router.use('/holographic', routeTimeout(TIMEOUTS.upload, { label: 'holographic' }), circuitBreakerMiddleware('ipfs', { failureThreshold: 3, timeoutWindow: 30000, halfOpenMaxRequests: 2 }), holographicRoutes);
v1Router.use('/aco', routeTimeout(TIMEOUTS.external, { label: 'aco' }), acoRoutes);
v1Router.use('/federated-learning', routeTimeout(TIMEOUTS.external, { label: 'federated-learning' }), federatedLearningRoutes);
v1Router.use('/swarm-learning', routeTimeout(TIMEOUTS.external, { label: 'swarm-learning' }), swarmLearningRoutes);
v1Router.use('/smart-wallet', routeTimeout(TIMEOUTS.write, { label: 'smart-wallet' }), circuitBreakerMiddleware('stellar', { failureThreshold: 3, timeoutWindow: 30000, halfOpenMaxRequests: 2 }), smartWalletRoutes);
v1Router.use('/secure-comm', routeTimeout(TIMEOUTS.realtime, { label: 'secure-comm' }), secureCommRoutes);
v1Router.use('/agi-tutor', routeTimeout(TIMEOUTS.read, { label: 'agi-tutor' }), agiTutorRoutes);
v1Router.use('/analytics', routeTimeout(TIMEOUTS.read, { label: 'analytics' }), analyticsRoutes);

// Autonomous Agents routes
const autonomousAgentsRoutes = require('./routes/autonomousAgents');
v1Router.use('/autonomous-agents', routeTimeout(TIMEOUTS.external, { label: 'autonomous-agents' }), autonomousAgentsRoutes);

// Gamification routes
const gamificationRoutes = require('./routes/gamification');
v1Router.use('/gamification', routeTimeout(TIMEOUTS.read, { label: 'gamification' }), gamificationRoutes);

// Bridge routes — module not yet implemented, use empty router
console.warn('Warning: Bridge routes module not found, using empty router');
const bridgeRoutes = express.Router();
v1Router.use('/bridge', bridgeRoutes);

// Time-Locked Credential routes
const timeLockCredentialsRoutes = resolveRoute(require('./routes/timeLockCredentials'));
v1Router.use('/time-lock', routeTimeout(TIMEOUTS.write, { label: 'time-lock' }), timeLockCredentialsRoutes);

// VRF (Verifiable Random Function) routes
const vrfRoutes = resolveRoute(require('./routes/vrf'));
v1Router.use('/vrf', routeTimeout(TIMEOUTS.write, { label: 'vrf' }), vrfRoutes);

// Real-time Translation routes
const translationRoutes = resolveRoute(require('./routes/translation'));
v1Router.use('/translate', routeTimeout(TIMEOUTS.read, { label: 'translate' }), translationRoutes);

// Cross-Protocol Bridge routes
const crossProtocolBridgeRoutes = resolveRoute(require('./routes/crossProtocolBridge'));
v1Router.use('/cross-protocol-bridge', routeTimeout(TIMEOUTS.external, { label: 'cross-protocol-bridge' }), crossProtocolBridgeRoutes);

// Admin dashboard routes
const adminRoutes = require('./routes/admin');
v1Router.use('/admin', routeTimeout(TIMEOUTS.write, { label: 'admin' }), adminRoutes);

// Event Indexer admin routes (start / stop / status)
// Circuit breaker status endpoint (admin-only, registered before indexer routes)
v1Router.get('/circuit-breakers', require('./middleware/auth').requireAdmin, circuitBreakerStatusHandler);

const indexerAdminRouter = require('express').Router();

indexerAdminRouter.get('/status', (req, res) => {
  try {
    const { getIndexerStatus } = require('./services/eventIndexer');
    res.json({ eventIndexer: getIndexerStatus() });
  } catch (err) {
    res.json({ eventIndexer: { status: 'stopped', error: err.message } });
  }
});

indexerAdminRouter.post('/start', async (req, res) => {
  try {
    if (!eventIndexerInstance) {
      return res.status(400).json({ error: 'Indexer not initialized' });
    }
    await eventIndexerInstance.start();
    const { getIndexerStatus } = require('./services/eventIndexer');
    res.json({ message: 'Indexer started', status: getIndexerStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

indexerAdminRouter.post('/stop', async (req, res) => {
  try {
    if (!eventIndexerInstance) {
      return res.status(400).json({ error: 'Indexer not initialized' });
    }
    await eventIndexerInstance.stop();
    const { getIndexerStatus } = require('./services/eventIndexer');
    res.json({ message: 'Indexer stopped', status: getIndexerStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

v1Router.use('/indexer', require('./middleware/auth').requireAdmin, indexerAdminRouter);

// Mount v1 router at /api/v1
app.use('/api/v1', v1Router);

// Mount v2 router (empty — ready for future endpoints)
const v2Router = createVersionedRouter('v2');
app.use('/api/v2', v2Router);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'StarkEd Education Backend API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// Swagger API documentation
setupSwagger(app, DEFAULT_VERSION);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const version = req.apiVersion || DEFAULT_VERSION;
  res.json(createVersionedResponse({
    status: 'healthy',
    uptime: process.uptime(),
    supportedVersions: SUPPORTED_VERSIONS,
    compression: getCompressionStats(),
  }, version));
});

// Unsupported version handler (only rejects truly unsupported versions)
app.use('/api/v:version*', (req, res, next) => {
  const version = `v${req.params.version}`;
  if (!SUPPORTED_VERSIONS.includes(version)) {
    return next(new ValidationError(`Unsupported API version: ${version}`, { supportedVersions: SUPPORTED_VERSIONS }));
  } else {
    next();
  }
});

// Global error handler - must be last
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Initialize circuit breakers for external services
    console.log('🔌 Initializing circuit breakers...');
    circuitBreakerRegistry.getOrCreate('ipfs', {
      failureThreshold: parseInt(process.env.CB_IPFS_FAILURE_THRESHOLD) || 5,
      timeoutWindow: parseInt(process.env.CB_IPFS_TIMEOUT) || 30000,
      halfOpenMaxRequests: parseInt(process.env.CB_IPFS_HALF_OPEN_MAX) || 3,
    });
    circuitBreakerRegistry.getOrCreate('stellar', {
      failureThreshold: parseInt(process.env.CB_STELLAR_FAILURE_THRESHOLD) || 5,
      timeoutWindow: parseInt(process.env.CB_STELLAR_TIMEOUT) || 30000,
      halfOpenMaxRequests: parseInt(process.env.CB_STELLAR_HALF_OPEN_MAX) || 3,
    });
    circuitBreakerRegistry.getOrCreate('redis', {
      failureThreshold: parseInt(process.env.CB_REDIS_FAILURE_THRESHOLD) || 5,
      timeoutWindow: parseInt(process.env.CB_REDIS_TIMEOUT) || 30000,
      halfOpenMaxRequests: parseInt(process.env.CB_REDIS_HALF_OPEN_MAX) || 3,
    });
    console.log('✅ Circuit breakers initialized');

    await transactionQueue.startProcessing();
    await transactionProcessor.start();
    await transactionEvents.startListening();
    emailWorker.getEmailWorker().start();

    // Start the event indexer if enabled
    if (EVENT_INDEXER_ENABLED) {
      try {
        const { Pool } = require('pg');
        const { getEventIndexer } = require('./services/eventIndexer');
        const indexerPool = new Pool({
          connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/starked',
          max: 5, // dedicated small pool for the indexer
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
        eventIndexerInstance = getEventIndexer(indexerPool);
        await eventIndexerInstance.start();
        console.log('🔗 Event Indexer started – polling Soroban for on-chain events');
      } catch (indexerErr) {
        console.error('⚠️  Event Indexer failed to start (non-fatal):', indexerErr.message);
      }
    } else {
      console.log('ℹ️  Event Indexer disabled. Set EVENT_INDEXER_ENABLED=true to enable.');
    }

    server.listen(PORT, () => {
      console.log(`🚀 StarkEd Education Backend running on port ${PORT}`);
      console.log(`📚 Quiz Management API available at /api/v1/quizzes`);
      console.log(`📊 Event Logger API available at /api/v1/events`);
      console.log(`🔄 Sync API available at /api/v1/sync`);
      console.log(`📁 Content Management API available at /api/v1/content`);
      console.log(`💰 Transaction Queue API available at /api/v1/transactions`);
      console.log(`🤝 Collaboration API available at /api/v1/collaboration`);
      console.log(`🔮 Holographic Storage API available at /api/v1/holographic`);
      console.log(`🧠 ACO API available at /api/v1/aco`);
      console.log(`🌐 Federated Learning API available at /api/v1/federated-learning`);
      console.log(`🧠 AGI Tutor API available at /api/v1/agi-tutor`);
      console.log(`🔗 Webhook API available at /api/v1/webhooks`);
      console.log(`🔐 Quantum-Resistant Secure Communication API available at /api/v1/secure-comm`);
      console.log(`🔗 Event Indexer API    available at /api/v1/indexer (admin-only)`);
      console.log(`🏥 Health check available at /api/health`);
      console.log(`✅ Transaction Queue System initialized successfully`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  if (eventIndexerInstance) {
    try {
      await eventIndexerInstance.stop();
      console.log('Event Indexer stopped cleanly.');
    } catch (err) {
      console.error('Error stopping event indexer:', err.message);
    }
  }
  await transactionQueue.stopProcessing();
  await transactionProcessor.stop();
  await transactionEvents.stopListening();
  process.exit(0);
});

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.server = server;
