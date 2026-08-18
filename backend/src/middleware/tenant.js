const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const TenantUser = require('../models/TenantUser');

/**
 * Audit trail for cross-tenant access events.
 * In production this should be persisted to a database or log aggregator.
 */
const auditLog = [];

function addAuditEntry(entry) {
  const logEntry = {
    ...entry,
    timestamp: new Date(),
    id: auditLog.length + 1
  };
  auditLog.push(logEntry);
  console.warn('[TENANT-AUDIT]', JSON.stringify(logEntry));
  return logEntry;
}

function getAuditLog() {
  return auditLog;
}

/**
 * Multi-tenant middleware to identify and validate tenant from request.
 * Sets req.tenant and req.tenantId on every authenticated request.
 *
 * Rejection policy:
 *   - No resolvable tenant info  → 400
 *   - Tenant not found           → 404
 *   - Tenant inactive/suspended  → 403
 */
const tenantMiddleware = async (req, res, next) => {
  try {
    // Extract tenant information from request
    const tenantInfo = extractTenantInfo(req);

    if (!tenantInfo) {
      return res.status(400).json({
        success: false,
        code: 'TENANT_CONTEXT_MISSING',
        message: 'Tenant information required'
      });
    }

    // Build query — avoid injecting untrusted values directly into $or without
    // validation; subdomain/domain are extracted from trusted sources (hostname
    // or headers already normalised by extractTenantInfo).
    const orClauses = [];
    if (tenantInfo.subdomain) {
      orClauses.push({ subdomain: tenantInfo.subdomain });
    }
    if (tenantInfo.domain) {
      orClauses.push({ domain: tenantInfo.domain });
    }

    if (orClauses.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'TENANT_CONTEXT_MISSING',
        message: 'Tenant information required'
      });
    }

    const tenant = await Tenant.findOne({ $or: orClauses });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant not found'
      });
    }

    // Check if tenant is active (uses the isActive virtual that also checks
    // subscription expiry)
    if (!tenant.isActive) {
      return res.status(403).json({
        success: false,
        code: 'TENANT_INACTIVE',
        message: 'Tenant account is inactive or expired'
      });
    }

    // Attach tenant to request
    req.tenant = tenant;
    req.tenantId = tenant._id;

    // Add tenant context to response headers for debugging
    res.set('X-Tenant-ID', tenant._id.toString());
    res.set('X-Tenant-Name', tenant.name);
    res.set('X-Tenant-Subdomain', tenant.subdomain);

    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Extract tenant information from various sources
 */
function extractTenantInfo(req) {
  // Method 1: Subdomain from hostname
  if (req.hostname) {
    const parts = req.hostname.toLowerCase().split('.');
    if (parts.length > 2) {
      const subdomain = parts[0];
      if (subdomain !== 'www' && subdomain !== 'api') {
        return { subdomain };
      }
    }
  }
  
  // Method 2: Custom header
  const tenantHeader = req.headers['x-tenant-id'];
  if (tenantHeader) {
    return { subdomain: tenantHeader };
  }
  
  // Method 3: Query parameter (for API testing)
  const tenantQuery = req.query.tenant;
  if (tenantQuery) {
    return { subdomain: tenantQuery };
  }
  
  // Method 4: Full domain mapping
  const domain = req.hostname;
  if (domain && domain !== 'localhost' && !domain.includes('127.0.0.1')) {
    return { domain };
  }
  
  return null;
}

/**
 * Middleware to check tenant resource limits
 */
const checkResourceLimits = (resource) => {
  return async (req, res, next) => {
    try {
      if (!req.tenant) {
        return res.status(400).json({
          success: false,
          message: 'Tenant context required'
        });
      }
      
      const tenant = req.tenant;
      
      switch (resource) {
        case 'users':
          if (!tenant.canAddUser()) {
            return res.status(429).json({
              success: false,
              message: 'User limit exceeded for current plan',
              code: 'USER_LIMIT_EXCEEDED'
            });
          }
          break;
          
        case 'storage':
          const additionalStorage = parseInt(req.body.storageSize) || 0;
          if (!tenant.canAllocateStorage(additionalStorage)) {
            return res.status(429).json({
              success: false,
              message: 'Storage limit exceeded for current plan',
              code: 'STORAGE_LIMIT_EXCEEDED'
            });
          }
          break;
          
        case 'api':
          // This would typically be handled by rate limiting middleware
          // but we can add tenant-specific API call tracking here
          await tenant.incrementUsage('apiCalls');
          break;
      }
      
      next();
    } catch (error) {
      console.error('Resource limit check error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };
};

/**
 * Middleware to ensure the authenticated user belongs to the current tenant.
 *
 * Looks up the TenantUser record by (tenantId, userId) so that a JWT issued
 * for tenant A can never be used to act within tenant B.
 *
 * JWT payload shape (from tenantService.generateTokens):
 *   { userId, tenantId, roles, email }
 */
const ensureTenantUser = async (req, res, next) => {
  try {
    if (!req.user || !req.tenant) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_CONTEXT_MISSING',
        message: 'Authentication and tenant context required'
      });
    }

    // JWT payload uses `userId` — see tenantService.generateTokens()
    const userId = req.user.userId || req.user._id || req.user.sub;

    if (!userId) {
      return res.status(401).json({
        success: false,
        code: 'AUTH_CONTEXT_MISSING',
        message: 'User identity could not be determined from token'
      });
    }

    // Validate that userId is a well-formed ObjectId before querying.
    // This prevents crafted IDs from causing unexpected DB behaviour.
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      addAuditEntry({
        type: 'INVALID_USER_ID',
        severity: 'WARN',
        rawUserId: String(userId).slice(0, 64),
        tenantId: req.tenantId ? req.tenantId.toString() : null,
        path: req.originalUrl,
        method: req.method
      });
      return res.status(403).json({
        success: false,
        code: 'CROSS_TENANT_ACCESS_DENIED',
        message: 'User does not belong to this tenant'
      });
    }

    // Compound lookup: both _id AND tenantId must match.
    // This is the primary guard against cross-tenant access via user ID.
    const tenantUser = await TenantUser.findOne({
      _id: userId,
      tenantId: req.tenantId
    });

    if (!tenantUser) {
      addAuditEntry({
        type: 'CROSS_TENANT_USER_DENIED',
        severity: 'WARN',
        userId: userId.toString(),
        resolvedTenantId: req.tenantId.toString(),
        jwtTenantId: req.user.tenantId ? req.user.tenantId.toString() : null,
        path: req.originalUrl,
        method: req.method
      });
      return res.status(403).json({
        success: false,
        code: 'CROSS_TENANT_ACCESS_DENIED',
        message: 'User does not belong to this tenant'
      });
    }

    // Attach tenant user to request
    req.tenantUser = tenantUser;
    next();
  } catch (error) {
    console.error('Tenant user check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Middleware to check user permissions within tenant context
 */
const requireTenantPermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      if (!req.tenantUser) {
        return res.status(401).json({
          success: false,
          message: 'Tenant user context required'
        });
      }
      
      // Super admins have access to everything
      if (req.tenantUser.hasRole('super_admin')) {
        return next();
      }
      
      // Tenant admins have most permissions within their tenant
      if (req.tenantUser.hasRole('tenant_admin')) {
        return next();
      }
      
      // Check specific permission
      if (!req.tenantUser.hasPermission(resource, action)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          required: { resource, action }
        });
      }
      
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };
};

/**
 * Middleware to add tenant isolation to database queries.
 *
 * Attaches a pre-scoped query helper (req.scopedQuery) that always injects
 * the resolved tenantId.  Controllers should use this helper instead of
 * building raw queries so the tenant filter can never be accidentally omitted.
 *
 * Usage in a controller:
 *   const courses = await Course.find(req.scopedQuery());
 *   const course  = await Course.findOne(req.scopedQuery({ _id: courseId }));
 */
const tenantIsolation = (_Model) => {
  return (req, res, next) => {
    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        code: 'TENANT_CONTEXT_MISSING',
        message: 'Tenant context is required for this operation'
      });
    }

    /**
     * Returns a MongoDB query filter that always includes tenantId.
     * @param {object} [additionalFilter={}] - Extra filter conditions.
     * @returns {object} The merged, tenant-scoped filter.
     */
    req.scopedQuery = (additionalFilter = {}) =>
      withTenantScope(additionalFilter, req.tenantId);

    next();
  };
};

/**
 * Verifies the URL route parameter :tenantId matches the resolved req.tenantId.
 * Prevents cross-tenant access through URL manipulation.
 *
 * Also rejects requests where the route parameter is not a valid ObjectId so
 * crafted IDs are rejected before reaching any DB query.
 */
const verifyTenantAccess = (paramName = 'tenantId') => {
  return (req, res, next) => {
    const routeTenantId = req.params[paramName];

    if (!routeTenantId) {
      return next();
    }

    // Reject non-ObjectId tenant IDs immediately
    if (!mongoose.Types.ObjectId.isValid(routeTenantId)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_TENANT_ID',
        message: 'Invalid tenant identifier'
      });
    }

    if (!req.tenantId) {
      return res.status(400).json({
        success: false,
        code: 'TENANT_CONTEXT_MISSING',
        message: 'Tenant context not established'
      });
    }

    if (req.tenantId.toString() !== routeTenantId) {
      addAuditEntry({
        type: 'CROSS_TENANT_DENIED',
        severity: 'WARN',
        routeParamTenantId: routeTenantId,
        resolvedTenantId: req.tenantId.toString(),
        userId: req.user?.userId || req.user?._id || null,
        path: req.originalUrl,
        method: req.method
      });

      return res.status(403).json({
        success: false,
        code: 'CROSS_TENANT_ACCESS_DENIED',
        message: 'Cross-tenant access denied'
      });
    }

    next();
  };
};

/**
 * Admin scope override middleware.
 * Allows super_admin users to explicitly access a different tenant scope.
 * Requires an explicit X-Admin-Override header or adminTenantId query parameter.
 * Every override is written to the audit log — it is never silent.
 */
const adminScopeOverride = (req, res, next) => {
  // Only applies when a super_admin is performing the request
  if (!req.user || !req.tenantUser) {
    return next();
  }

  const isSuperAdmin = req.tenantUser.hasRole('super_admin');
  if (!isSuperAdmin) {
    return next();
  }

  const overrideTarget = req.headers['x-admin-override'] || req.query.adminTenantId;

  if (!overrideTarget) {
    return next();
  }

  // Validate the override target is a well-formed ObjectId before any DB call
  if (!mongoose.Types.ObjectId.isValid(overrideTarget)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_TENANT_ID',
      message: 'Invalid admin override tenant identifier'
    });
  }

  // Resolve the target tenant
  Tenant.findById(overrideTarget)
    .then(targetTenant => {
      if (!targetTenant) {
        return res.status(404).json({
          success: false,
          message: 'Admin override target tenant not found'
        });
      }

      // Record the override in audit log — always, no exceptions
      const originalTenantId = req.tenantId.toString();
      addAuditEntry({
        type: 'ADMIN_SCOPE_OVERRIDE',
        severity: 'INFO',
        adminUserId: req.user.userId || req.user._id,
        originalTenantId,
        targetTenantId: targetTenant._id.toString(),
        targetTenantName: targetTenant.name,
        path: req.originalUrl,
        method: req.method
      });

      // Switch tenant context to the target tenant
      req.tenant = targetTenant;
      req.tenantId = targetTenant._id;
      req.adminOverrideActive = true;
      req.adminOriginalTenantId = originalTenantId;

      res.set('X-Admin-Override', 'true');
      res.set('X-Original-Tenant-ID', originalTenantId);

      next();
    })
    .catch(err => {
      console.error('Admin scope override error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to process admin override'
      });
    });
};

/**
 * Wraps a MongoDB query filter object with a tenantId scope condition.
 * Ensures queries never accidentally omit the tenant filter.
 *
 * Throws if tenantId is falsy so callers are alerted immediately rather than
 * silently issuing an unscoped query.
 *
 * @param {object} queryFilter - The base query filter.
 * @param {*} tenantId - The resolved tenant ObjectId.
 * @returns {object} The merged, tenant-scoped filter.
 * @throws {Error} If tenantId is not provided.
 */
function withTenantScope(queryFilter, tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required — refusing to issue an unscoped query');
  }
  return { ...queryFilter, tenantId };
}

/**
 * Route-level middleware that enforces the presence of a valid tenantId on the
 * request before any business logic runs.  Use this on any route that reads or
 * writes tenant-owned resources.
 */
const requireTenantId = (req, res, next) => {
  if (!req.tenantId) {
    return res.status(400).json({
      success: false,
      code: 'TENANT_CONTEXT_MISSING',
      message: 'Tenant context is required for this operation'
    });
  }
  next();
};

module.exports = {
  tenantMiddleware,
  checkResourceLimits,
  ensureTenantUser,
  requireTenantPermission,
  requireTenantId,
  tenantIsolation,
  verifyTenantAccess,
  adminScopeOverride,
  withTenantScope,
  getAuditLog,
  addAuditEntry
};
