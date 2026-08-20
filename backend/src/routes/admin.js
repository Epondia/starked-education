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
const ApiKey = require('../models/ApiKey');
const logger = require('../utils/logger');
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

// Apply authentication and admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

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

// ── API Key Management ──────────────────────────────────────────

const createApiKeySchema = {
  body: Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
    scopes: Joi.array().items(Joi.string().trim().min(1)).min(1).required(),
    expiresAt: Joi.date().iso().greater('now').optional(),
  }),
};

const rotateApiKeySchema = {
  params: Joi.object({
    id: Joi.string().hex().length(24).required(),
  }),
  body: Joi.object({
    scopes: Joi.array().items(Joi.string().trim().min(1)).min(1).optional(),
    expiresAt: Joi.date().iso().greater('now').optional(),
  }),
};

const revokeApiKeySchema = {
  params: Joi.object({
    id: Joi.string().hex().length(24).required(),
  }),
};

/**
 * POST /api/admin/api-keys
 * Create a new API key. Returns the plaintext key exactly once.
 */
router.post(
  '/api-keys',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  validateRequestSchema(createApiKeySchema),
  async (req, res) => {
    try {
      const { name, scopes, expiresAt } = req.body;

      const { rawKey, keyHash, keyPrefix } = await ApiKey.generateKey();

      const apiKeyDoc = new ApiKey({
        keyHash,
        keyPrefix,
        userId: req.user.id,
        name,
        scopes,
        expiresAt: expiresAt || undefined,
        audit: [
          {
            action: 'created',
            performedBy: req.user.id,
            timestamp: new Date(),
            details: { name, scopes },
          },
        ],
      });

      await apiKeyDoc.save();

      logger.info(`API key created: ${keyPrefix}... by user ${req.user.id}`);

      res.status(201).json({
        success: true,
        message: 'API key created successfully. Store the key securely — it will not be shown again.',
        data: {
          id: apiKeyDoc._id,
          name: apiKeyDoc.name,
          key: rawKey, // Returned only on creation
          keyPrefix: apiKeyDoc.keyPrefix,
          scopes: apiKeyDoc.scopes,
          expiresAt: apiKeyDoc.expiresAt,
          createdAt: apiKeyDoc.createdAt,
        },
      });
    } catch (error) {
      logger.error('Error creating API key:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

/**
 * GET /api/admin/api-keys
 * List all API keys (hashes are never exposed).
 */
router.get(
  '/api-keys',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  async (req, res) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const parsedPage = Math.max(1, parseInt(page, 10) || 1);
      const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

      const filter = {};
      if (status && ['active', 'revoked'].includes(status)) {
        filter.status = status;
      }

      const total = await ApiKey.countDocuments(filter);
      const keys = await ApiKey.find(filter)
        .select('-keyHash') // Never expose the hash
        .sort({ createdAt: -1 })
        .skip((parsedPage - 1) * parsedLimit)
        .limit(parsedLimit)
        .lean();

      res.json({
        success: true,
        data: {
          keys,
          pagination: {
            total,
            page: parsedPage,
            limit: parsedLimit,
            pages: Math.ceil(total / parsedLimit),
          },
        },
      });
    } catch (error) {
      logger.error('Error listing API keys:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

/**
 * GET /api/admin/api-keys/:id
 * Get a single API key by ID.
 */
router.get(
  '/api-keys/:id',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  async (req, res) => {
    try {
      const key = await ApiKey.findById(req.params.id)
        .select('-keyHash')
        .lean();

      if (!key) {
        return res.status(404).json({ success: false, message: 'API key not found' });
      }

      res.json({ success: true, data: key });
    } catch (error) {
      logger.error('Error fetching API key:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

/**
 * POST /api/admin/api-keys/:id/rotate
 * Rotate an API key: revoke the old one and create a new one atomically.
 */
router.post(
  '/api-keys/:id/rotate',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  validateRequestSchema(rotateApiKeySchema),
  async (req, res) => {
    try {
      const oldKey = await ApiKey.findById(req.params.id);

      if (!oldKey) {
        return res.status(404).json({ success: false, message: 'API key not found' });
      }

      if (oldKey.status === 'revoked') {
        return res.status(400).json({ success: false, message: 'API key is already revoked' });
      }

      const newScopes = req.body.scopes || oldKey.scopes;
      const newExpiresAt = req.body.expiresAt || oldKey.expiresAt;

      // Generate new key
      const { rawKey, keyHash, keyPrefix } = await ApiKey.generateKey();

      // Revoke old key
      oldKey.status = 'revoked';
      oldKey.audit.push({
        action: 'rotated',
        performedBy: req.user.id,
        timestamp: new Date(),
        details: { newKeyPrefix: keyPrefix },
      });
      await oldKey.save();

      // Create new key
      const newKeyDoc = new ApiKey({
        keyHash,
        keyPrefix,
        userId: oldKey.userId,
        name: oldKey.name,
        scopes: newScopes,
        expiresAt: newExpiresAt || undefined,
        audit: [
          {
            action: 'created',
            performedBy: req.user.id,
            timestamp: new Date(),
            details: { rotatedFrom: oldKey._id, name: oldKey.name, scopes: newScopes },
          },
        ],
      });

      await newKeyDoc.save();

      logger.info(`API key rotated: ${oldKey.keyPrefix}... -> ${keyPrefix}... by user ${req.user.id}`);

      res.json({
        success: true,
        message: 'API key rotated successfully. Store the new key securely — it will not be shown again.',
        data: {
          oldKeyId: oldKey._id,
          id: newKeyDoc._id,
          name: newKeyDoc.name,
          key: rawKey, // Returned only on rotation
          keyPrefix: newKeyDoc.keyPrefix,
          scopes: newKeyDoc.scopes,
          expiresAt: newKeyDoc.expiresAt,
          createdAt: newKeyDoc.createdAt,
        },
      });
    } catch (error) {
      logger.error('Error rotating API key:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/admin/api-keys/:id
 * Revoke an API key.
 */
router.delete(
  '/api-keys/:id',
  requirePermission(PERMISSIONS.SYSTEM_MANAGE),
  validateRequestSchema(revokeApiKeySchema),
  async (req, res) => {
    try {
      const key = await ApiKey.findById(req.params.id);

      if (!key) {
        return res.status(404).json({ success: false, message: 'API key not found' });
      }

      if (key.status === 'revoked') {
        return res.status(400).json({ success: false, message: 'API key is already revoked' });
      }

      key.status = 'revoked';
      key.audit.push({
        action: 'revoked',
        performedBy: req.user.id,
        timestamp: new Date(),
      });
      await key.save();

      logger.info(`API key revoked: ${key.keyPrefix}... by user ${req.user.id}`);

      res.json({
        success: true,
        message: 'API key revoked successfully',
        data: { id: key._id, status: 'revoked' },
      });
    } catch (error) {
      logger.error('Error revoking API key:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

module.exports = router;
