/**
 * AuditLogController
 * REST API controller for the admin audit log viewer.
 * Provides secure endpoints for querying, searching, and verifying audit logs.
 */

import { Request, Response } from 'express';
import { auditLogService } from '../services/auditLogService';
import { AuditEventType, AuditSeverity } from '../models/AuditLog';
import logger from '../utils/logger';

class AuditLogController {
  /**
   * POST /api/v1/audit-log/query
   * Query audit logs with filtering, pagination, and search.
   * Admin-only endpoint powering the audit log viewer.
   */
  public async queryAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const {
        eventType,
        severity,
        actorId,
        targetId,
        targetType,
        status,
        startDate,
        endDate,
        limit,
        offset,
        sortBy,
        sortOrder,
        search,
      } = req.body;

      // Validate eventType if provided
      let parsedEventType: AuditEventType | AuditEventType[] | undefined;
      if (eventType) {
        if (Array.isArray(eventType)) {
          const invalidTypes = eventType.filter(
            (t: string) => !Object.values(AuditEventType).includes(t as AuditEventType)
          );
          if (invalidTypes.length > 0) {
            res.status(400).json({
              success: false,
              error: `Invalid event type(s): ${invalidTypes.join(', ')}`,
              validTypes: Object.values(AuditEventType),
            });
            return;
          }
          parsedEventType = eventType as AuditEventType[];
        } else if (typeof eventType === 'string') {
          if (!Object.values(AuditEventType).includes(eventType as AuditEventType)) {
            res.status(400).json({
              success: false,
              error: `Invalid event type: ${eventType}`,
              validTypes: Object.values(AuditEventType),
            });
            return;
          }
          parsedEventType = eventType as AuditEventType;
        }
      }

      // Validate severity
      let parsedSeverity: AuditSeverity | undefined;
      if (severity) {
        if (!Object.values(AuditSeverity).includes(severity as AuditSeverity)) {
          res.status(400).json({
            success: false,
            error: `Invalid severity: ${severity}`,
            validValues: Object.values(AuditSeverity),
          });
          return;
        }
        parsedSeverity = severity as AuditSeverity;
      }

      const filter = {
        eventType: parsedEventType,
        severity: parsedSeverity,
        actorId,
        targetId,
        targetType,
        status: status as 'success' | 'failure' | undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
        sortBy,
        sortOrder,
        search,
      };

      const result = await auditLogService.queryEntries(filter);

      res.status(200).json({
        success: true,
        data: {
          entries: result.entries,
          pagination: {
            total: result.totalCount,
            limit: filter.limit,
            offset: filter.offset,
            hasMore: filter.offset + filter.limit < result.totalCount,
          },
        },
      });
    } catch (error) {
      logger.error('Error querying audit logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to query audit logs',
      });
    }
  }

  /**
   * GET /api/v1/audit-log/:id
   * Get a single audit log entry by ID.
   */
  public async getAuditLogById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ success: false, error: 'Invalid audit log ID' });
        return;
      }

      const entry = await auditLogService.getEntryById(id);
      if (!entry) {
        res.status(404).json({ success: false, error: 'Audit log entry not found' });
        return;
      }

      res.status(200).json({ success: true, data: entry });
    } catch (error) {
      logger.error('Error fetching audit log entry:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch audit log entry' });
    }
  }

  /**
   * GET /api/v1/audit-log/verify
   * Verify the integrity of the entire audit log hash chain.
   */
  public async verifyIntegrity(req: Request, res: Response): Promise<void> {
    try {
      const result = await auditLogService.verifyIntegrity();
      res.status(200).json({
        success: true,
        data: result,
        message: result.valid
          ? 'Audit log chain is intact and has not been tampered with.'
          : `WARNING: ${result.mismatches.length} hash mismatches detected! The audit log may have been tampered with.`,
      });
    } catch (error) {
      logger.error('Error verifying audit log integrity:', error);
      res.status(500).json({ success: false, error: 'Failed to verify audit log integrity' });
    }
  }

  /**
   * POST /api/v1/audit-log/verify-range
   * Verify integrity of a specific range of audit log entries.
   */
  public async verifyIntegrityRange(req: Request, res: Response): Promise<void> {
    try {
      const { startId, endId } = req.body;
      if (!startId || !endId) {
        res.status(400).json({ success: false, error: 'Both startId and endId are required' });
        return;
      }

      const result = await auditLogService.verifyIntegrityRange(
        parseInt(startId, 10),
        parseInt(endId, 10)
      );

      res.status(200).json({
        success: true,
        data: result,
        message: result.valid
          ? 'Audit log range integrity verified.'
          : `WARNING: ${result.mismatches.length} hash mismatches in range.`,
      });
    } catch (error) {
      logger.error('Error verifying audit log range:', error);
      res.status(500).json({ success: false, error: 'Failed to verify audit log range integrity' });
    }
  }

  /**
   * GET /api/v1/audit-log/stats
   * Get audit log statistics for the admin dashboard.
   */
  public async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;
      const stats = await auditLogService.getStatistics({
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });

      res.status(200).json({ success: true, data: stats });
    } catch (error) {
      logger.error('Error fetching audit log statistics:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch audit log statistics' });
    }
  }

  /**
   * GET /api/v1/audit-log/event-types
   * List all valid event types for the filter dropdown.
   */
  public async getEventTypes(_req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      data: Object.values(AuditEventType),
    });
  }

  /**
   * GET /api/v1/audit-log/user/:userId
   * Get all audit log entries for a specific user (actor or target).
   */
  public async getUserAuditLog(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { limit, offset } = req.query;

      const result = await auditLogService.queryEntries({
        actorId: userId,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      // Also fetch entries where user is the target
      const targetResult = await auditLogService.queryEntries({
        targetId: userId,
        limit: 50,
        offset: 0,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      // Combine and deduplicate
      const combinedEntries = [...result.entries];
      const existingIds = new Set(result.entries.map(e => e.id));
      for (const entry of targetResult.entries) {
        if (!existingIds.has(entry.id)) {
          combinedEntries.push(entry);
        }
      }

      // Sort by createdAt desc
      combinedEntries.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      res.status(200).json({
        success: true,
        data: {
          entries: combinedEntries,
          totalCount: result.totalCount + targetResult.totalCount,
        },
      });
    } catch (error) {
      logger.error('Error fetching user audit log:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch user audit log' });
    }
  }
}

export const auditLogController = new AuditLogController();
