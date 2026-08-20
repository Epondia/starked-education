const express = require('express');
const Joi = require('joi');
const {
  authenticateToken,
  requireAdmin,
  requirePermission,
} = require('../middleware/auth');
const { validateRequestSchema } = require('../middleware/validateRequestSchema');
const { PERMISSIONS, UserRole } = require('../utils/roles');
const { AnalyticsService } = require('../services/analyticsService');
const { adminTierLimiter } = require('../middleware/rateLimiter');
const { getPoolHealthReport } = require('../utils/database');
const abTestingFramework = require('../services/abTestingFramework');
const { auditLogService } = require('../services/auditLogService');
const router = express.Router();

const updateSettingsSchema = {
  body: Joi.object({
    category: Joi.string().valid('general', 'security', 'features', 'limits').required(),
    settings: Joi.object().min(1).required(),
  })
};

const backupSchema = {
  body: Joi.object({
    type: Joi.string().valid('full', 'incremental', 'differential').optional(),
    includeFiles: Joi.boolean().optional(),
  })
};

const announcementSchema = {
  body: Joi.object({
    title: Joi.string().trim().min(1).max(200).required(),
    message: Joi.string().trim().min(1).max(5000).required(),
    targetRoles: Joi.array().items(Joi.string()).optional(),
    priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
    expiresAt: Joi.date().iso().optional(),
  })
};

const featureFlagSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
    description: Joi.string().trim().max(500).optional(),
    enabled: Joi.boolean().optional(),
    rolloutPercentage: Joi.number().min(0).max(100).optional(),
    userOverrides: Joi.object().pattern(Joi.string().min(1), Joi.boolean()).optional(),
  })
};

const updateFeatureFlagSchema = {
  params: Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
  }),
  body: Joi.object({
    description: Joi.string().trim().max(500).optional(),
    enabled: Joi.boolean().optional(),
    rolloutPercentage: Joi.number().min(0).max(100).optional(),
    userOverrides: Joi.object().pattern(Joi.string().min(1), Joi.boolean()).optional(),
  }).min(1)
};

const createExperimentSchema = {
  body: Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
    description: Joi.string().trim().max(500).optional(),
    variants: Joi.array().items(
      Joi.object({
        id: Joi.string().trim().min(1).optional(),
        name: Joi.string().trim().min(1).required(),
        description: Joi.string().trim().max(500).optional(),
        config: Joi.object().optional(),
      })
    ).min(2).required(),
    trafficAllocation: Joi.array().items(Joi.number().min(0).max(100)).optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    targetCriteria: Joi.object().optional(),
    successMetrics: Joi.array().items(Joi.string().trim().min(1)).optional(),
  })
};

// Apply authentication and admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);
// Issue #17: 100 requests per minute for authenticated admins,
// 20 requests per minute for anonymous callers (defense in depth).
router.use(adminTierLimiter);

/**
 * GET /api/admin/dashboard
 * Returns real database statistics with 5-minute Redis caching
 */
router.get(
  '/dashboard',
  requirePermission(PERMISSIONS.ADMIN_PANEL),
  async (req, res) => {
    try {
      const stats = await AnalyticsService.getAdminDashboardStats();

      res.json({
        message: 'Dashboard statistics retrieved successfully',
        stats,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error retrieving dashboard statistics',
      });
    }
  }
);

/**
 * GET /api/admin/logs
 * Returns system logs from activity_logs with filtering and pagination
 */
router.get(
  '/logs',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  async (req, res) => {
    try {
      const { level, page, limit, startDate, endDate } = req.query;

      const parsedPage = Math.max(1, parseInt(page, 10) || 1);
      const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

      const result = await AnalyticsService.getSystemLogs({
        level: level || 'all',
        page: parsedPage,
        limit: parsedLimit,
        startDate,
        endDate,
      });

      res.json({
        logs: result.data,
        pagination: result.pagination,
        filters: { level, startDate, endDate },
      });
    } catch (error) {
      console.error('Logs retrieval error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error retrieving system logs',
      });
    }
  }
);

/**
 * GET /api/admin/reports/user-activity
 * Uses real activity_logs data, not mocks
 */
router.get(
  '/reports/user-activity',
  requirePermission(PERMISSIONS.USER_READ),
  async (req, res) => {
    try {
      const { period = '30d', role } = req.query;

      const activityData = await AnalyticsService.getUserActivityReport(
        period,
        role
      );

      res.json({
        message: 'User activity report generated successfully',
        data: activityData,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Activity report error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error generating activity report',
      });
    }
  }
);

/**
 * GET /api/admin/reports/course-performance
 * Queries real course enrollment and completion data
 */
router.get(
  '/reports/course-performance',
  requirePermission(PERMISSIONS.COURSE_READ),
  async (req, res) => {
    try {
      const { period = '30d', courseId } = req.query;

      const performanceData = await AnalyticsService.getCoursePerformanceReport(
        period,
        courseId
      );

      res.json({
        message: 'Course performance report generated successfully',
        data: performanceData,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Course performance report error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error generating course performance report',
      });
    }
  }
);

/**
 * GET /api/admin/settings
 * Returns system settings (configuration-based, not mock)
 */
router.get(
  '/settings',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  (req, res) => {
    try {
      const settings = {
        general: {
          siteName: process.env.SITE_NAME || 'StarkEd Education Platform',
          siteDescription:
            process.env.SITE_DESCRIPTION ||
            'Decentralized education on Stellar',
          maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
          registrationEnabled: process.env.REGISTRATION_ENABLED !== 'false',
          emailVerificationRequired:
            process.env.EMAIL_VERIFICATION_REQUIRED !== 'false',
        },
        security: {
          passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
          sessionTimeout: parseInt(process.env.SESSION_TIMEOUT_HOURS || '24', 10),
          maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
          lockoutDuration: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),
        },
        features: {
          coursesEnabled: process.env.FEATURE_COURSES !== 'false',
          quizzesEnabled: process.env.FEATURE_QUIZZES !== 'false',
          certificatesEnabled: process.env.FEATURE_CERTIFICATES !== 'false',
          socialFeaturesEnabled: process.env.FEATURE_SOCIAL !== 'false',
        },
        limits: {
          maxCoursesPerUser: parseInt(process.env.MAX_COURSES_PER_USER || '10', 10),
          maxQuizzesPerCourse: parseInt(process.env.MAX_QUIZZES_PER_COURSE || '50', 10),
          maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
          maxUsersPerPlan: parseInt(process.env.MAX_USERS_PER_PLAN || '1000', 10),
        },
      };

      res.json({
        message: 'System settings retrieved successfully',
        settings,
      });
    } catch (error) {
      console.error('Settings retrieval error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error retrieving system settings',
      });
    }
  }
);

/**
 * PUT /api/admin/settings
 * Update system settings
 */
router.put(
  '/settings',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  validateRequestSchema(updateSettingsSchema),
  (req, res) => {
    try {
      const { category, settings } = req.body;

      // Settings update would go to a configuration store in production
      res.json({
        message: 'System settings updated successfully',
        category,
        settings,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Settings update error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error updating system settings',
      });
    }
  }
);

/**
 * POST /api/admin/backup
 * Initiate system backup (placeholder for real implementation)
 */
router.post(
  '/backup',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  validateRequestSchema(backupSchema),
  (req, res) => {
    try {
      const { type = 'full', includeFiles = true } = req.body;

      const backupId = `backup_${Date.now()}`;

      res.json({
        message: 'Backup initiated successfully',
        backup: {
          id: backupId,
          type,
          includeFiles,
          status: 'in_progress',
          estimatedCompletion: new Date(
            Date.now() + 300000
          ).toISOString(),
          downloadUrl: `/api/admin/backups/${backupId}/download`,
        },
      });
    } catch (error) {
      console.error('Backup error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error initiating backup',
      });
    }
  }
);

/**
 * GET /api/admin/backups
 * List backups
 */
router.get(
  '/backups',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  (req, res) => {
    try {
      res.json({
        message: 'Backups retrieved successfully',
        backups: [],
        total: 0,
      });
    } catch (error) {
      console.error('Backups retrieval error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error retrieving backups',
      });
    }
  }
);

/**
 * GET /api/admin/pool-stats
 * Returns live PostgreSQL pool metrics (issue #187) — useful for capacity
 * planning and confirming that env-driven pool sizing is actually applied.
 */
router.get(
  '/pool-stats',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  (_req, res) => {
    try {
      const report = getPoolHealthReport();
      res.json({
        message: 'Database pool metrics retrieved successfully',
        pool: report,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Pool stats error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error retrieving database pool metrics',
      });
    }
  }
);

/**
 * POST /api/admin/announcements
 * Create a system announcement
 */
router.post(
  '/announcements',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  validateRequestSchema(announcementSchema),
  (req, res) => {
    try {
      const {
        title,
        message,
        targetRoles = [],
        priority = 'normal',
        expiresAt,
      } = req.body;

      const announcement = {
        id: `announcement_${Date.now()}`,
        title,
        message,
        targetRoles,
        priority,
        expiresAt,
        createdBy: req.user.id,
        createdAt: new Date().toISOString(),
        active: true,
      };

      res.status(201).json({
        message: 'Announcement created successfully',
        announcement,
      });
    } catch (error) {
      console.error('Announcement creation error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error creating announcement',
      });
    }
  }
);

/**
 * GET /api/v1/admin/audit-logs
 * Search the append-only audit trail. The payload column is deliberately
 * excluded from this response; details are already redacted at write time.
 */
router.get(
  '/audit-logs',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  async (req, res) => {
    try {
      const result = await auditLogService.list({
        action: typeof req.query.action === 'string' ? req.query.action : undefined,
        actorId: typeof req.query.actorId === 'string' ? req.query.actorId : undefined,
        outcome: typeof req.query.outcome === 'string' ? req.query.outcome : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
        endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
        page: req.query.page,
        limit: req.query.limit,
      });

      res.json({
        auditLogs: result.data,
        pagination: result.pagination,
        filters: {
          action: req.query.action || null,
          actorId: req.query.actorId || null,
          outcome: req.query.outcome || null,
          search: req.query.search || null,
          startDate: req.query.startDate || null,
          endDate: req.query.endDate || null,
        },
      });
    } catch (error) {
      console.error('Audit log retrieval error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error retrieving audit logs',
      });
    }
  }
);

/**
 * GET /api/v1/admin/audit-logs/verify
 * Verify the hash chain from the genesis entry through the newest entries.
 */
router.get(
  '/audit-logs/verify',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  async (_req, res) => {
    try {
      const verification = await auditLogService.verifyChain();
      res.status(verification.valid ? 200 : 409).json(verification);
    } catch (error) {
      console.error('Audit chain verification error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error verifying audit log chain',
      });
    }
  }
);

// ─── Feature Flags & A/B Experiments ──────────────────────────────

/**
 * POST /api/v1/admin/flags
 * Create a feature flag
 */
router.post(
  '/flags',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  validateRequestSchema(featureFlagSchema),
  async (req, res) => {
    try {
      const flag = await abTestingFramework.createFlag(req.body);
      res.status(201).json({
        message: 'Feature flag created successfully',
        flag,
      });
    } catch (error) {
      console.error('Feature flag creation error:', error);
      res.status(400).json({
        error: 'Bad request',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/v1/admin/flags
 * List all feature flags
 */
router.get(
  '/flags',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  async (req, res) => {
    try {
      const flags = await abTestingFramework.listFlags();
      res.json({
        message: 'Feature flags retrieved successfully',
        flags,
        total: flags.length,
      });
    } catch (error) {
      console.error('Feature flags retrieval error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error retrieving feature flags',
      });
    }
  }
);

/**
 * GET /api/v1/admin/flags/:name
 * Get a single feature flag
 */
router.get(
  '/flags/:name',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  async (req, res) => {
    try {
      const flag = await abTestingFramework.getFlag(req.params.name);
      if (!flag) {
        return res.status(404).json({
          error: 'Not found',
          message: `Feature flag not found: ${req.params.name}`,
        });
      }
      res.json({
        message: 'Feature flag retrieved successfully',
        flag,
      });
    } catch (error) {
      console.error('Feature flag retrieval error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error retrieving feature flag',
      });
    }
  }
);

/**
 * PUT /api/v1/admin/flags/:name
 * Update a flag (toggle, rollout %, or per-user overrides) without redeploy
 */
router.put(
  '/flags/:name',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  validateRequestSchema(updateFeatureFlagSchema),
  async (req, res) => {
    try {
      const flag = await abTestingFramework.updateFlag(req.params.name, req.body);
      res.json({
        message: 'Feature flag updated successfully',
        flag,
      });
    } catch (error) {
      if (error.message && error.message.startsWith('Feature flag not found')) {
        return res.status(404).json({
          error: 'Not found',
          message: error.message,
        });
      }
      console.error('Feature flag update error:', error);
      res.status(400).json({
        error: 'Bad request',
        message: error.message,
      });
    }
  }
);

/**
 * DELETE /api/v1/admin/flags/:name
 * Delete a feature flag
 */
router.delete(
  '/flags/:name',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  async (req, res) => {
    try {
      await abTestingFramework.deleteFlag(req.params.name);
      res.json({ message: 'Feature flag deleted successfully' });
    } catch (error) {
      console.error('Feature flag deletion error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error deleting feature flag',
      });
    }
  }
);

/**
 * POST /api/v1/admin/experiments
 * Create an A/B experiment
 */
router.post(
  '/experiments',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  validateRequestSchema(createExperimentSchema),
  async (req, res) => {
    try {
      const experiment = await abTestingFramework.createExperiment(req.body);
      res.status(201).json({
        message: 'Experiment created successfully',
        experiment,
      });
    } catch (error) {
      console.error('Experiment creation error:', error);
      res.status(400).json({
        error: 'Bad request',
        message: error.message,
      });
    }
  }
);

/**
 * GET /api/v1/admin/experiments
 * List all A/B experiments
 */
router.get(
  '/experiments',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  async (req, res) => {
    try {
      const experiments = await abTestingFramework.listExperiments();
      res.json({
        message: 'Experiments retrieved successfully',
        experiments,
        total: experiments.length,
      });
    } catch (error) {
      console.error('Experiments retrieval error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error retrieving experiments',
      });
    }
  }
);

/**
 * POST /api/v1/admin/experiments/:name/start
 * Activate an A/B experiment
 */
router.post(
  '/experiments/:name/start',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  async (req, res) => {
    try {
      const experiment = await abTestingFramework.startExperiment(req.params.name);
      res.json({
        message: 'Experiment started successfully',
        experiment,
      });
    } catch (error) {
      if (error.message && error.message.startsWith('Experiment not found')) {
        return res.status(404).json({
          error: 'Not found',
          message: error.message,
        });
      }
      console.error('Experiment start error:', error);
      res.status(400).json({
        error: 'Bad request',
        message: error.message,
      });
    }
  }
);

/**
 * POST /api/v1/admin/experiments/:name/stop
 * Complete an A/B experiment
 */
router.post(
  '/experiments/:name/stop',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  async (req, res) => {
    try {
      const experiment = await abTestingFramework.stopExperiment(req.params.name);
      res.json({
        message: 'Experiment stopped successfully',
        experiment,
      });
    } catch (error) {
      if (error.message && error.message.startsWith('Experiment not found')) {
        return res.status(404).json({
          error: 'Not found',
          message: error.message,
        });
      }
      console.error('Experiment stop error:', error);
      res.status(400).json({
        error: 'Bad request',
        message: error.message,
      });
    }
  }
);

/**
 * DELETE /api/v1/admin/experiments/:name
 * Delete an A/B experiment
 */
router.delete(
  '/experiments/:name',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  async (req, res) => {
    try {
      await abTestingFramework.deleteExperiment(req.params.name);
      res.json({ message: 'Experiment deleted successfully' });
    } catch (error) {
      console.error('Experiment deletion error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Error deleting experiment',
      });
    }
  }
);

module.exports = router;
