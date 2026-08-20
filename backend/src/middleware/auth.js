const jwt = require('jsonwebtoken');
const { hasPermission, hasRoleLevel, UserRole } = require('../utils/roles');
const { auditLogService } = require('../services/auditLogService');

function recordAccessFailure(req, action, reason, statusCode) {
  if (process.env.NODE_ENV === 'test' && process.env.AUDIT_LOGGING_ENABLED !== 'true') return;
  auditLogService.record({
    action,
    outcome: 'failure',
    statusCode,
    requestId: req.requestId || null,
    ipAddress: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
    actorId: req.user?.id || req.user?.userId || req.user?.sub || null,
    actorRole: req.user?.role || null,
    details: { reason, method: req.method, path: req.path },
  }).catch(() => undefined);
}

/**
 * JWT Authentication Middleware
 * Verifies JWT token and attaches user to request object
 */
const authenticateToken = (req, res, next) => {
  // If an API key already authenticated this request, skip JWT verification
  if (req.user) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    recordAccessFailure(req, 'auth.token', 'missing_token', 401);
    return res.status(401).json({ 
      error: 'Access token required',
      message: 'Please provide a valid JWT token'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      recordAccessFailure(req, 'auth.token', 'invalid_token', 403);
      return res.status(403).json({ 
        error: 'Invalid token',
        message: 'The provided token is invalid or expired'
      });
    }
    
    req.user = user;
    next();
  });
};

/**
 * Role-based access control middleware
 * @param {string[]} allowedRoles - Array of allowed roles
 * @returns {Function} Middleware function
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      recordAccessFailure(req, 'authz.role', 'missing_user', 401);
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please authenticate to access this resource'
      });
    }

    const userRole = req.user.role;
    
    if (!allowedRoles.includes(userRole)) {
      recordAccessFailure(req, 'authz.role', 'insufficient_role', 403);
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

/**
 * Permission-based access control middleware
 * @param {string} permission - Required permission
 * @returns {Function} Middleware function
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      recordAccessFailure(req, 'authz.permission', 'missing_user', 401);
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please authenticate to access this resource'
      });
    }

    const userRole = req.user.role;
    
    if (!hasPermission(userRole, permission)) {
      recordAccessFailure(req, 'authz.permission', `missing:${permission}`, 403);
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `Access denied. Required permission: ${permission}`
      });
    }

    next();
  };
};

/**
 * Minimum role level middleware
 * @param {string} minimumRole - Minimum required role
 * @returns {Function} Middleware function
 */
const requireMinimumRole = (minimumRole) => {
  return (req, res, next) => {
    if (!req.user) {
      recordAccessFailure(req, 'authz.minimum-role', 'missing_user', 401);
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please authenticate to access this resource'
      });
    }

    const userRole = req.user.role;
    
    if (!hasRoleLevel(userRole, minimumRole)) {
      recordAccessFailure(req, 'authz.minimum-role', `missing:${minimumRole}`, 403);
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `Access denied. Minimum role required: ${minimumRole}`
      });
    }

    next();
  };
};

/**
 * Self or admin middleware - allows users to access their own resources or admins to access any
 * @param {string} userIdParam - Parameter name containing user ID (default: 'userId')
 * @returns {Function} Middleware function
 */
const requireSelfOrAdmin = (userIdParam = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      recordAccessFailure(req, 'authz.self', 'missing_user', 401);
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please authenticate to access this resource'
      });
    }

    const userRole = req.user.role;
    const targetUserId = req.params[userIdParam];
    const currentUserId = req.user.id || req.user.sub;

    // Admins can access any resource, users can only access their own
    if (userRole !== UserRole.ADMIN && currentUserId !== targetUserId) {
      recordAccessFailure(req, 'authz.self', 'resource_mismatch', 403);
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'You can only access your own resources'
      });
    }

    next();
  };
};

/**
 * Educator or admin middleware
 */
const requireEducatorOrAdmin = requireRole([UserRole.EDUCATOR, UserRole.ADMIN]);

/**
 * Admin only middleware
 */
const requireAdmin = requireRole([UserRole.ADMIN]);

/**
 * Student or above middleware (all roles)
 */
const requireStudentOrAbove = requireRole([UserRole.STUDENT, UserRole.EDUCATOR, UserRole.ADMIN]);

module.exports = {
  authenticateToken,
  requireRole,
  requirePermission,
  requireMinimumRole,
  requireSelfOrAdmin,
  requireEducatorOrAdmin,
  requireAdmin,
  requireStudentOrAbove
};
