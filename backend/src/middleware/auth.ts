/**
 * Authentication Middleware
 * Handles user authentication and authorization
 *
 * Consolidated from the former auth.js — the JS version was deleted because
 * Node's module resolution prefers `.js` over `.ts`, which caused two
 * parallel implementations to drift apart (see #380, #396). All auth
 * middleware now lives here.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../models/User';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { hasPermission, hasRoleLevel } = require('../utils/roles');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { auditLogService } = require('../services/auditLogService');

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
    username: string;
    address?: string;
  };
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined');
    }

    const decoded = jwt.verify(token, jwtSecret) as any;
    
    (req as AuthenticatedRequest).user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      username: decoded.username,
      address: decoded.address
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

export const requireRole = (roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

export const requireInstructor = requireRole([UserRole.INSTRUCTOR, UserRole.EDUCATOR, UserRole.ADMIN]);
export const requireEducatorOrAdmin = requireRole([UserRole.EDUCATOR, UserRole.ADMIN]);
export const requireAdmin = requireRole([UserRole.ADMIN]);
export const requireStudent = requireRole([UserRole.STUDENT, UserRole.INSTRUCTOR, UserRole.EDUCATOR, UserRole.ADMIN]);

// Compatibility aliases
export const authenticateToken = authMiddleware;
export const authenticate = authMiddleware;

// Backward-compatible aliases matching auth.js export names
export const requireStudentOrAbove = requireStudent;

/**
 * Permission-based access control middleware.
 * Checks the user's role against a named permission using the role-permission
 * map from `utils/roles`.
 */
export const requirePermission = (permission: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      recordAccessFailure(req, 'authz.permission', 'missing_user', 401);
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate to access this resource',
      });
    }

    if (!hasPermission(req.user.role, permission)) {
      recordAccessFailure(req, 'authz.permission', `missing:${permission}`, 403);
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `Access denied. Required permission: ${permission}`,
      });
    }

    next();
  };
};

/**
 * Minimum role level middleware.
 * Verifies the user's role meets or exceeds the given minimum.
 */
export const requireMinimumRole = (minimumRole: UserRole) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      recordAccessFailure(req, 'authz.minimum-role', 'missing_user', 401);
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate to access this resource',
      });
    }

    if (!hasRoleLevel(req.user.role, minimumRole)) {
      recordAccessFailure(req, 'authz.minimum-role', `missing:${minimumRole}`, 403);
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `Access denied. Minimum role required: ${minimumRole}`,
      });
    }

    next();
  };
};

/**
 * Self-or-admin middleware.
 * Allows users to access their own resources, or admins to access any.
 * @param userIdParam - Parameter name containing user ID (default: 'userId')
 */
export const requireSelfOrAdmin = (userIdParam = 'userId') => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      recordAccessFailure(req, 'authz.self', 'missing_user', 401);
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate to access this resource',
      });
    }

    const userRole = req.user.role;
    const targetUserId = req.params[userIdParam];
    const currentUserId = req.user.id || (req.user as any).sub;

    if (userRole !== UserRole.ADMIN && currentUserId !== targetUserId) {
      recordAccessFailure(req, 'authz.self', 'resource_mismatch', 403);
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only access your own resources',
      });
    }

    next();
  };
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Record an access-failure audit event. Runs fire-and-forget so it never
 * blocks the request path.
 */
function recordAccessFailure(
  req: Request,
  action: string,
  reason: string,
  statusCode: number,
) {
  if (process.env.NODE_ENV === 'test' && process.env.AUDIT_LOGGING_ENABLED !== 'true') {
    return;
  }
  auditLogService
    .record({
      action,
      outcome: 'failure',
      statusCode,
      requestId: (req as any).requestId || null,
      ipAddress: req.ip || (req.socket && req.socket.remoteAddress) || null,
      userAgent: req.get('user-agent') || null,
      actorId: (req as any).user?.id || (req as any).user?.userId || (req as any).user?.sub || null,
      actorRole: (req as any).user?.role || null,
      details: { reason, method: req.method, path: req.path },
    })
    .catch(() => undefined);
}

// ---------------------------------------------------------------------------
// CommonJS compatibility for JS routes that require() this module
// ---------------------------------------------------------------------------
module.exports = {
  authenticateToken,
  authMiddleware,
  authenticate,
  requireRole,
  requirePermission,
  requireMinimumRole,
  requireSelfOrAdmin,
  requireInstructor,
  requireEducatorOrAdmin,
  requireAdmin,
  requireStudent,
  requireStudentOrAbove,
};
