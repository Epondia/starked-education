/**
 * Courses Route
 * Handles course listing and version management endpoints
 */

const express = require('express');
const router = express.Router();
const { readLimiter, courseWriteLimiter } = require('../middleware/rateLimiter');

const Joi = require('joi');
const { validateRequestSchema } = require('../middleware/validateRequestSchema');

// ── Listing schema ──────────────────────────────────────────────────────────

const listCoursesSchema = {
  query: Joi.object({
    q: Joi.string().trim().max(200).optional().allow(''),
    categories: Joi.string().trim().optional().allow(''),
    levels: Joi.string().trim().optional().allow(''),
    sort: Joi.string()
      .valid('relevance', 'newest', 'popular', 'rating', 'duration', 'price-low', 'price-high')
      .default('relevance'),
    // Offset-based pagination
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(12),
    // Cursor-based pagination (preferred for infinite scroll — avoids duplicate
    // items when new content is inserted while the user is browsing)
    cursor: Joi.string().trim().optional().allow(''),
  }),
};

/**
 * GET /api/courses
 * List courses with cursor-based (or offset-based) pagination.
 *
 * Supports both pagination styles so existing offset consumers keep working:
 *   - Cursor: GET /api/courses?cursor=<opaque_cursor>&limit=12
 *   - Offset: GET /api/courses?page=2&limit=12
 *
 * Query params:
 *   q          - Full-text search query
 *   categories - Comma-separated category slugs
 *   levels     - Comma-separated level slugs (beginner, intermediate, advanced)
 *   sort       - relevance | newest | popular | rating | duration | price-low | price-high
 *   page       - Page number (offset mode, default 1)
 *   limit      - Items per page (default 12, max 100)
 *   cursor     - Opaque page cursor (cursor mode — takes precedence over page)
 *
 * Response:
 *   { items, total, page, limit, hasMore, nextCursor }
 */
router.get('/',
  readLimiter,
  validateRequestSchema(listCoursesSchema),
  async (req, res) => {
    try {
      const {
        q = '',
        categories = '',
        levels = '',
        sort = 'relevance',
        limit: rawLimit = 12,
        page: rawPage = 1,
        cursor,
      } = req.query;

      const limit = Math.min(Number(rawLimit), 100);

      // Resolve the offset from either the cursor or the page number.
      // The cursor is a base64-encoded JSON object: { offset: number }
      let offset = (Number(rawPage) - 1) * limit;
      if (cursor) {
        try {
          const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
          if (typeof decoded.offset === 'number') {
            offset = decoded.offset;
          }
        } catch {
          // Invalid cursor — fall back to offset-based calculation
        }
      }

      const categoryList = categories
        ? categories.split(',').map((c) => c.trim()).filter(Boolean)
        : [];
      const levelList = levels
        ? levels.split(',').map((l) => l.trim()).filter(Boolean)
        : [];

      // ── In a real implementation this would query the database ──────────
      // The mock below generates deterministic courses so the infinite-scroll
      // integration can be exercised end-to-end without a real database.

      const MOCK_TOTAL = 120;

      /** @type {Array<Record<string, unknown>>} */
      const mockItems = Array.from({ length: Math.min(limit, Math.max(0, MOCK_TOTAL - offset)) }, (_, i) => {
        const courseIndex = offset + i;
        return {
          id: `course_${courseIndex + 1}`,
          title: `Course ${courseIndex + 1}${q ? ` — "${q}"` : ''}`,
          shortDescription: `A hands-on course about topic ${courseIndex + 1}.`,
          description: `Comprehensive coverage of topic ${courseIndex + 1} with practical examples.`,
          category: categoryList[0] ?? (courseIndex % 4 === 0 ? 'blockchain' : courseIndex % 4 === 1 ? 'web3' : courseIndex % 4 === 2 ? 'defi' : 'smart-contracts'),
          level: levelList[0] ?? (courseIndex % 3 === 0 ? 'beginner' : courseIndex % 3 === 1 ? 'intermediate' : 'advanced'),
          language: 'en',
          durationHours: 2 + (courseIndex % 10),
          price: courseIndex % 5 === 0 ? 0 : 29 + (courseIndex % 7) * 10,
          rating: parseFloat((3.5 + (courseIndex % 15) * 0.1).toFixed(1)),
          reviewCount: 50 + courseIndex * 3,
          enrollmentCount: 200 + courseIndex * 10,
          provider: `Provider ${(courseIndex % 5) + 1}`,
          thumbnail: '',
          tags: ['blockchain', 'stellar', 'web3'].slice(0, (courseIndex % 3) + 1),
          skills: ['smart contracts', 'defi'].slice(0, (courseIndex % 2) + 1),
          preview: '',
          matchReasons: ['Trending', 'Highly rated'].slice(0, (courseIndex % 2) + 1),
          quickActions: [],
          relevanceScore: 1 - courseIndex * 0.001,
          semanticScore: 0.9,
          recommendationScore: 0.85,
          trendScore: 0.8,
          socialProof: {
            reviewSnippet: 'Great course!',
            enrollmentLabel: `${200 + courseIndex * 10} enrolled`,
            ratingLabel: `${(3.5 + (courseIndex % 15) * 0.1).toFixed(1)} stars`,
          },
        };
      });

      const hasMore = offset + limit < MOCK_TOTAL;

      // Build the next cursor so the client can request the following page
      // without needing to track page numbers.
      const nextCursor = hasMore
        ? Buffer.from(JSON.stringify({ offset: offset + limit })).toString('base64')
        : null;

      const currentPage = cursor
        ? Math.floor(offset / limit) + 1
        : Number(rawPage);

      res.status(200).json({
        success: true,
        message: 'Courses retrieved successfully',
        data: {
          items: mockItems,
          total: MOCK_TOTAL,
          page: currentPage,
          limit,
          hasMore,
          nextCursor,
        },
      });
    } catch (error) {
      console.error('Error listing courses:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve courses',
        error: error.message,
      });
    }
  },
);

// ── Version management schemas (existing) ───────────────────────────────────

const contentIdParamSchema = {
  params: Joi.object({
    contentId: Joi.string().trim().min(1).required(),
  })
};

const createVersionSchema = {
  params: Joi.object({
    contentId: Joi.string().trim().min(1).required(),
  }),
  body: Joi.object({
    title: Joi.string().trim().min(3).max(200).required(),
    description: Joi.string().trim().min(10).max(1000).required(),
    content: Joi.object().required(),
    changes: Joi.array().items(Joi.string().min(5).max(500)).min(1).required(),
    createdBy: Joi.string().trim().min(1).required(),
  })
};

const restoreVersionSchema = {
  params: Joi.object({
    contentId: Joi.string().trim().min(1).required(),
  }),
  body: Joi.object({
    versionId: Joi.string().trim().min(1).required(),
    restoreReason: Joi.string().trim().min(5).max(500).optional(),
    restoredBy: Joi.string().trim().min(1).required(),
  })
};

const updateVersionSettingsSchema = {
  params: Joi.object({
    contentId: Joi.string().trim().min(1).required(),
  }),
  body: Joi.object({
    autoVersioning: Joi.boolean().optional(),
    maxVersions: Joi.number().integer().min(0).optional(),
  }).min(1)
};

const compareVersionsSchema = {
  params: Joi.object({
    version1Id: Joi.string().trim().min(1).required(),
    version2Id: Joi.string().trim().min(1).required(),
  })
};

const versionNumberParamSchema = {
  params: Joi.object({
    contentId: Joi.string().trim().min(1).required(),
    versionNumber: Joi.number().integer().min(1).required(),
  })
};

/**
 * POST /api/courses/:contentId/versions
 * Create a new version for course content
 * 
 * @param {string} contentId - Content ID
 * @body {ContentVersionCreateRequest} - Version creation data
 * @returns {ContentVersion} - Created version
 * 
 * @example
 * POST /api/courses/content_123/versions
 * {
 *   "title": "Updated Lesson Content",
 *   "description": "Updated description",
 *   "content": { "sections": [...] },
 *   "changes": ["Updated introduction", "Added new examples"],
 *   "createdBy": "user_456"
 * }
 */
router.post('/:contentId/versions', 
  courseWriteLimiter,
  validateRequestSchema(createVersionSchema),
  async (req, res) => {
    try {
      const { contentId } = req.params;
      const versionData = { ...req.body, contentId };
      
      // In a real implementation, this would:
      // 1. Fetch the content from database
      // 2. Create version using VersionControlService
      // 3. Save version to database
      // 4. Update content with new version
      
      const mockVersion = {
        id: `ver_${Date.now()}`,
        contentId,
        version: 1,
        title: versionData.title,
        description: versionData.description,
        content: versionData.content,
        changes: versionData.changes,
        createdBy: versionData.createdBy,
        createdAt: new Date(),
        isCurrent: true
      };
      
      res.status(201).json({
        success: true,
        message: 'Version created successfully',
        data: mockVersion
      });
    } catch (error) {
      console.error('Error creating version:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create version',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/courses/:contentId/versions
 * Get version history for course content
 * 
 * @param {string} contentId - Content ID
 * @query {VersionFilter} - Filter options
 * @returns {VersionHistoryResult} - Paginated version history
 * 
 * @example
 * GET /api/courses/content_123/versions?page=1&limit=10&sortBy=version&sortOrder=desc
 */
router.get('/:contentId/versions',
  readLimiter,
  validateRequestSchema(contentIdParamSchema),
  async (req, res) => {
    try {
      const { contentId } = req.params;
      const filters = req.query;
      
      // In a real implementation, this would:
      // 1. Fetch versions from database using filters
      // 2. Apply pagination and sorting
      // 3. Return paginated results
      
      const mockHistory = {
        versions: [
          {
            id: 'ver_1',
            contentId,
            version: 1,
            title: 'Initial Version',
            description: 'First version of the content',
            content: { sections: [] },
            changes: ['Initial creation'],
            createdBy: 'user_123',
            createdAt: new Date('2024-01-01'),
            isCurrent: false
          },
          {
            id: 'ver_2',
            contentId,
            version: 2,
            title: 'Updated Version',
            description: 'Updated content',
            content: { sections: ['updated'] },
            changes: ['Updated content'],
            createdBy: 'user_456',
            createdAt: new Date('2024-01-15'),
            isCurrent: true
          }
        ],
        total: 2,
        page: parseInt(filters.page) || 1,
        limit: parseInt(filters.limit) || 10,
        hasMore: false
      };
      
      res.status(200).json({
        success: true,
        message: 'Version history retrieved successfully',
        data: mockHistory
      });
    } catch (error) {
      console.error('Error getting version history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve version history',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/courses/:contentId/versions/current
 * Get current version of course content
 * 
 * @param {string} contentId - Content ID
 * @returns {ContentVersion} - Current version
 * 
 * @example
 * GET /api/courses/content_123/versions/current
 */
router.get('/:contentId/versions/current',
  readLimiter,
  validateRequestSchema(contentIdParamSchema),
  async (req, res) => {
    try {
      const { contentId } = req.params;
      
      // In a real implementation, this would:
      // 1. Fetch current version from database
      // 2. Return the version marked as isCurrent: true
      
      const mockCurrentVersion = {
        id: 'ver_2',
        contentId,
        version: 2,
        title: 'Current Version',
        description: 'Current version of the content',
        content: { sections: ['current'] },
        changes: ['Latest updates'],
        createdBy: 'user_456',
        createdAt: new Date('2024-01-15'),
        isCurrent: true
      };
      
      res.status(200).json({
        success: true,
        message: 'Current version retrieved successfully',
        data: mockCurrentVersion
      });
    } catch (error) {
      console.error('Error getting current version:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve current version',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/courses/:contentId/versions/:versionNumber
 * Get specific version by version number
 * 
 * @param {string} contentId - Content ID
 * @param {number} versionNumber - Version number
 * @returns {ContentVersion} - Specific version
 * 
 * @example
 * GET /api/courses/content_123/versions/1
 */
router.get('/:contentId/versions/:versionNumber',
  readLimiter,
  validateRequestSchema(versionNumberParamSchema),
  async (req, res) => {
    try {
      const { contentId, versionNumber } = req.params;
      
      // In a real implementation, this would:
      // 1. Fetch specific version from database
      // 2. Return the version with matching number
      
      const mockVersion = {
        id: `ver_${versionNumber}`,
        contentId,
        version: parseInt(versionNumber),
        title: `Version ${versionNumber}`,
        description: `Version ${versionNumber} of the content`,
        content: { sections: [`version_${versionNumber}`] },
        changes: [`Changes for version ${versionNumber}`],
        createdBy: 'user_123',
        createdAt: new Date(`2024-01-${versionNumber}`),
        isCurrent: versionNumber === '2'
      };
      
      res.status(200).json({
        success: true,
        message: 'Version retrieved successfully',
        data: mockVersion
      });
    } catch (error) {
      console.error('Error getting version:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve version',
        error: error.message
      });
    }
  }
);

/**
 * POST /api/courses/versions/compare/:version1Id/:version2Id
 * Compare two versions
 * 
 * @param {string} version1Id - First version ID
 * @param {string} version2Id - Second version ID
 * @returns {VersionComparison} - Comparison result
 * 
 * @example
 * POST /api/courses/versions/compare/ver_1/ver_2
 */
router.post('/versions/compare/:version1Id/:version2Id',
  courseWriteLimiter,
  validateRequestSchema(compareVersionsSchema),
  async (req, res) => {
    try {
      const { version1Id, version2Id } = req.params;
      
      // In a real implementation, this would:
      // 1. Fetch both versions from database
      // 2. Compare them using VersionControlService
      // 3. Return detailed comparison
      
      const mockComparison = {
        version1: {
          id: version1Id,
          title: 'Version 1',
          description: 'First version',
          content: { sections: ['old'] }
        },
        version2: {
          id: version2Id,
          title: 'Version 2',
          description: 'Updated version',
          content: { sections: ['new', 'updated'] }
        },
        differences: [
          {
            field: 'title',
            oldValue: 'Version 1',
            newValue: 'Version 2',
            changeType: 'modified'
          },
          {
            field: 'content',
            oldValue: { sections: ['old'] },
            newValue: { sections: ['new', 'updated'] },
            changeType: 'modified'
          }
        ],
        summary: {
          totalChanges: 2,
          additions: 1,
          modifications: 1,
          removals: 0
        }
      };
      
      res.status(200).json({
        success: true,
        message: 'Versions compared successfully',
        data: mockComparison
      });
    } catch (error) {
      console.error('Error comparing versions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to compare versions',
        error: error.message
      });
    }
  }
);

/**
 * POST /api/courses/:contentId/versions/restore
 * Restore content to a specific version
 * 
 * @param {string} contentId - Content ID
 * @body {VersionRestoreRequest} - Restore request data
 * @returns {Content} - Updated content with restored version
 * 
 * @example
 * POST /api/courses/content_123/versions/restore
 * {
 *   "versionId": "ver_1",
 *   "restoreReason": "Reverting to previous stable version",
 *   "restoredBy": "user_456"
 * }
 */
router.post('/:contentId/versions/restore',
  courseWriteLimiter,
  validateRequestSchema(restoreVersionSchema),
  async (req, res) => {
    try {
      const { contentId } = req.params;
      const { versionId, restoreReason, restoredBy } = req.body;
      
      // In a real implementation, this would:
      // 1. Fetch content and version from database
      // 2. Restore content using VersionControlService
      // 3. Create a new version for the restoration
      // 4. Update content in database
      
      const mockRestoredContent = {
        id: contentId,
        title: 'Restored Content Title',
        description: 'Content restored from previous version',
        content: { sections: ['restored'] },
        version: {
          current: 3,
          lastVersionUpdate: new Date(),
          autoVersioning: true,
          maxVersions: 10
        },
        updatedAt: new Date()
      };
      
      res.status(200).json({
        success: true,
        message: 'Content restored successfully',
        data: mockRestoredContent
      });
    } catch (error) {
      console.error('Error restoring version:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restore version',
        error: error.message
      });
    }
  }
);

/**
 * PUT /api/courses/:contentId/versions/settings
 * Update version control settings for content
 * 
 * @param {string} contentId - Content ID
 * @body {object} - Version control settings
 * @returns {object} - Updated settings
 * 
 * @example
 * PUT /api/courses/content_123/versions/settings
 * {
 *   "autoVersioning": true,
 *   "maxVersions": 20
 * }
 */
router.put('/:contentId/versions/settings',
  courseWriteLimiter,
  validateRequestSchema(updateVersionSettingsSchema),
  async (req, res) => {
    try {
      const { contentId } = req.params;
      const settings = req.body;
      
      // In a real implementation, this would:
      // 1. Update version control settings in database
      // 2. Apply cleanup if maxVersions changed
      // 3. Return updated settings
      
      const mockSettings = {
        contentId,
        autoVersioning: settings.autoVersioning ?? true,
        maxVersions: settings.maxVersions ?? 10,
        updatedAt: new Date()
      };
      
      res.status(200).json({
        success: true,
        message: 'Version control settings updated successfully',
        data: mockSettings
      });
    } catch (error) {
      console.error('Error updating version settings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update version control settings',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/courses/:contentId/versions/export
 * Export version history
 * 
 * @param {string} contentId - Content ID
 * @query {string} format - Export format (json or csv)
 * @returns {file} - Exported version history
 * 
 * @example
 * GET /api/courses/content_123/versions/export?format=json
 */
router.get('/:contentId/versions/export',
  readLimiter,
  validateRequestSchema(contentIdParamSchema),
  async (req, res) => {
    try {
      const { contentId } = req.params;
      const { format = 'json' } = req.query;
      
      // In a real implementation, this would:
      // 1. Fetch version history from database
      // 2. Export in requested format using VersionControlService
      // 3. Return appropriate response headers and content
      
      const mockExportData = {
        versions: [
          {
            id: 'ver_1',
            version: 1,
            title: 'Version 1',
            description: 'First version',
            createdBy: 'user_123',
            createdAt: '2024-01-01T00:00:00Z',
            isCurrent: false,
            changes: ['Initial creation']
          }
        ]
      };
      
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="versions_${contentId}.json"`);
        res.send(JSON.stringify(mockExportData, null, 2));
      } else if (format === 'csv') {
        const csv = 'Version,Title,Description,Created By,Created At,Is Current,Changes\n' +
                   '1,Version 1,First version,user_123,2024-01-01T00:00:00Z,false,"Initial creation"';
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="versions_${contentId}.csv"`);
        res.send(csv);
      }
    } catch (error) {
      console.error('Error exporting versions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export versions',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/courses/:contentId/versions/statistics
 * Get version statistics for content
 * 
 * @param {string} contentId - Content ID
 * @returns {object} - Version statistics
 * 
 * @example
 * GET /api/courses/content_123/versions/statistics
 */
router.get('/:contentId/versions/statistics',
  readLimiter,
  validateRequestSchema(contentIdParamSchema),
  async (req, res) => {
    try {
      const { contentId } = req.params;
      
      // In a real implementation, this would:
      // 1. Calculate statistics using VersionControlService
      // 2. Return comprehensive version analytics
      
      const mockStatistics = {
        totalVersions: 5,
        currentVersion: 5,
        lastUpdate: new Date('2024-01-20'),
        versionsByCreator: {
          'user_123': 3,
          'user_456': 2
        },
        averageVersionsPerMonth: 2.5,
        recentActivity: [
          {
            version: 5,
            createdAt: new Date('2024-01-20'),
            changes: ['Bug fixes', 'Performance improvements']
          },
          {
            version: 4,
            createdAt: new Date('2024-01-15'),
            changes: ['New content added']
          }
        ]
      };
      
      res.status(200).json({
        success: true,
        message: 'Version statistics retrieved successfully',
        data: mockStatistics
      });
    } catch (error) {
      console.error('Error getting version statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve version statistics',
        error: error.message
      });
    }
  }
);

module.exports = router;
