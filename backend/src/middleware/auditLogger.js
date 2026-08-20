const { auditLogService } = require('../services/auditLogService');
const logger = require('../utils/logger');

function getAction(req) {
  const parts = (req.path || req.originalUrl || '').split('?')[0].split('/').filter(Boolean);
  const versionIndex = parts.findIndex((part) => /^v\d+$/.test(part));
  const resource = parts[versionIndex + 1] || parts[0] || 'system';
  const operation = parts[versionIndex + 2] || 'collection';
  return `${resource}.${operation === ':id' ? 'item' : operation}`;
}

function auditLogger(req, res, next) {
  // Test suites can opt in to persistence explicitly; production remains enabled.
  if (process.env.NODE_ENV === 'test' && process.env.AUDIT_LOGGING_ENABLED !== 'true') {
    return next();
  }

  const isSensitiveMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!isSensitiveMethod || (req.path || '').includes('/admin/audit-logs')) {
    return next();
  }

  res.once('finish', () => {
    const user = req.user || {};
    auditLogService.record({
      actorId: req.auditActorId || user.id || user.userId || user.sub || null,
      actorRole: req.auditActorRole || user.role || null,
      action: getAction(req),
      resourceType: (req.path || '').split('/').filter(Boolean).pop() || 'system',
      resourceId: req.params?.id || req.params?.userId || req.params?.credentialId || null,
      outcome: res.statusCode < 400 ? 'success' : 'failure',
      statusCode: res.statusCode,
      requestId: req.requestId || null,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
      userAgent: req.get('user-agent') || null,
      details: {
        ...req.auditDetails,
        method: req.method,
        path: req.path,
      },
    }).catch((error) => logger.error('Audit logging middleware failed:', error));
  });

  next();
}

module.exports = auditLogger;
