/**
 * Authentication Middleware
 * Handles user authentication and authorization
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../models/User';
import { auditLogService } from '../services/auditLogService';

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
      auditLogService.logFailedAuth(
        'anonymous',
        { reason: 'No token provided' },
        req.ip,
        req.headers['user-agent']
      ).catch(() => {});
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
    auditLogService.logFailedAuth(
      'anonymous',
      { reason: (error as any)?.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token' },
      req.ip,
      req.headers['user-agent']
    ).catch(() => {});
    return res.status(401).json({ error: 'Invalid token.' });
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
