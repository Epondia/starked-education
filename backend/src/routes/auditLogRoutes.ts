/**
 * AuditLog Routes
 * Admin-protected routes for the audit log viewer.
 *
 * All endpoints require authentication and admin-level access.
 */

import { Router } from 'express';
import { auditLogController } from '../controllers/auditLogController';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { validateRequestSchema } from '../middleware/validateRequestSchema';
import Joi from 'joi';
import { AuditEventType, AuditSeverity } from '../models/AuditLog';

const router: Router = Router();

// All routes require admin authentication
router.use(authenticateToken);
router.use(requireAdmin);

// -- Validation schemas --

const queryAuditLogsSchema = {
  body: Joi.object({
    eventType: Joi.alternatives().try(
      Joi.string().valid(...Object.values(AuditEventType)),
      Joi.array().items(Joi.string().valid(...Object.values(AuditEventType)))
    ).optional(),
    severity: Joi.string().valid(...Object.values(AuditSeverity)).optional(),
    actorId: Joi.string().trim().min(1).optional(),
    targetId: Joi.string().trim().min(1).optional(),
    targetType: Joi.string().trim().min(1).optional(),
    status: Joi.string().valid('success', 'failure').optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    offset: Joi.number().integer().min(0).optional(),
    sortBy: Joi.string().valid('createdAt', 'severity', 'eventType').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional(),
    search: Joi.string().trim().max(500).optional(),
  }),
};

const verifyRangeSchema = {
  body: Joi.object({
    startId: Joi.number().integer().min(1).required(),
    endId: Joi.number().integer().min(1).required(),
  }),
};

const getByIdSchema = {
  params: Joi.object({
    id: Joi.number().integer().min(1).required(),
  }),
};

// -- Routes --

/**
 * POST /api/v1/audit-log/query
 * Query audit logs with filtering and pagination.
 * Uses POST with a JSON body to support complex filter objects
 * that don't fit well in URL query parameters.
 */
router.post(
  '/query',
  validateRequestSchema(queryAuditLogsSchema),
  auditLogController.queryAuditLogs
);

/**
 * GET /api/v1/audit-log/verify
 * Verify integrity of the entire audit log hash chain.
 */
router.get(
  '/verify',
  auditLogController.verifyIntegrity
);

/**
 * POST /api/v1/audit-log/verify-range
 * Verify integrity of a specific range of audit log entries.
 */
router.post(
  '/verify-range',
  validateRequestSchema(verifyRangeSchema),
  auditLogController.verifyIntegrityRange
);

/**
 * GET /api/v1/audit-log/stats
 * Get audit log statistics for the admin dashboard.
 */
router.get(
  '/stats',
  auditLogController.getStatistics
);

/**
 * GET /api/v1/audit-log/event-types
 * List all valid event types.
 */
router.get(
  '/event-types',
  auditLogController.getEventTypes
);

/**
 * GET /api/v1/audit-log/user/:userId
 * Get all audit log entries related to a specific user.
 */
router.get(
  '/user/:userId',
  auditLogController.getUserAuditLog
);

/**
 * GET /api/v1/audit-log/:id
 * Get a single audit log entry by ID.
 * IMPORTANT: Must be defined LAST to avoid shadowing named routes.
 */
router.get(
  '/:id',
  auditLogController.getAuditLogById
);

export default router;
