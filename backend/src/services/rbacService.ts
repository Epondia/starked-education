import { UserRole, ROLE_PERMISSIONS, ROLE_HIERARCHY } from '../utils/roles';
import { clearCachedPermissions } from '../utils/redis';
import { auditLogService } from './auditLogService';
import logger from '../utils/logger';

/**
 * RBAC Service to manage roles and permissions
 */
class RBACService {
  /**
   * Assign a role to a user
   * @param adminId - ID of the admin performing the action
   * @param userId - ID of the user to assign the role to
   * @param newRole - The role to assign
   * @param oldRole - The user's previous role (for audit trail)
   * @param ipAddress - IP of the admin for audit trail
   * @returns - The update results
   */
  async assignRole(
    adminId: string,
    userId: string,
    newRole: string,
    adminRole: string = 'admin',
    oldRole?: string,
    ipAddress?: string
  ): Promise<any> {
    try {
      if (!Object.values(UserRole).includes(newRole as any)) {
        throw new Error(`Invalid role: ${newRole}`);
      }

      // 1. Update user in database (Mocked for now)
      logger.info(`RBAC: User ${adminId} assigned role ${newRole} to user ${userId}`);
      
      // 2. Clear permission cache to ensure immediate effect
      await clearCachedPermissions(userId);

      // 3. Create tamper-evident audit log entry with the admin's actual role
      await auditLogService.logRoleChange(
        adminId,
        adminRole,
        userId,
        {
          oldRole: oldRole || 'unknown',
          newRole,
        },
        ipAddress
      ).catch(err => {
        // Don't fail the role assignment if audit logging fails
        logger.error('Failed to create audit log entry for role change:', err);
      });

      return { userId, role: newRole, success: true };
    } catch (err) {
      logger.error(`Error assigning role: ${err}`);
      throw err;
    }
  }

  /**
   * Get all available roles
   */
  getAvailableRoles(): string[] {
    return Object.values(UserRole);
  }

  /**
   * Check if a user can assign a specific role (Level protection)
   */
  canAssignRole(adminRole: string, targetRole: string): boolean {
    const adminLevel = ROLE_HIERARCHY[adminRole] || 0;
    const targetLevel = ROLE_HIERARCHY[targetRole] || 0;
    
    // Only admins can assign other admin/moderator roles
    return adminLevel > targetLevel || adminRole === UserRole.ADMIN;
  }

  /**
   * Log permission changes for audit purposes.
   * Now delegates to the tamper-evident auditLogService.
   */
  async logPermissionChange(
    executorId: string,
    targetId: string,
    action: string,
    details: any,
    ipAddress?: string
  ): Promise<void> {
    await auditLogService.logPermissionChange(
      executorId,
      'admin',
      targetId,
      {
        action: action.includes('grant') ? 'grant' : 'revoke',
        permission: action,
        ...details,
      },
      ipAddress
    ).catch(err => {
      logger.error('[AUDIT] Failed to log permission change:', err);
    });
  }
}

export default new RBACService();
