import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { notificationService } from "../services/notificationService";
import { NotificationType } from "../models/Notification";
import logger from "../utils/logger";

export class NotificationController {
  public async getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      // Cast query params to plain strings to prevent NoSQL operator injection
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const isRead = req.query.isRead;
      const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;

      const result = await notificationService.getNotifications({
        userId,
        category: category as any,
        type: type as any,
        isRead:
          isRead === "true" ? true : isRead === "false" ? false : undefined,
        priority: priority as any,
        limit: isNaN(limit) ? 20 : limit,
        skip: isNaN(skip) ? 0 : skip,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("Error in getNotifications controller:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  public async markAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      const success = await notificationService.markAsRead(
        notificationId,
        userId,
      );
      res.status(200).json({ success });
    } catch (error) {
      logger.error("Error in markAsRead controller:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  public async markAllAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const count = await notificationService.markAllAsRead(userId);
      res.status(200).json({ success: true, count });
    } catch (error) {
      logger.error("Error in markAllAsRead controller:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  public async getPreferences(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const preferences = await notificationService.getUserPreferences(userId);
      res.status(200).json({ success: true, data: preferences });
    } catch (error) {
      logger.error("Error in getPreferences controller:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  public async updatePreferences(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      // Sanitize input to only whitelisted preference fields
      const allowedFields = new Set([
        'emailNotifications', 'pushNotifications', 'inAppNotifications',
        'digestFrequency', 'quietHoursStart', 'quietHoursEnd',
      ]);
      const preferences: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(req.body)) {
        if (allowedFields.has(key)) {
          preferences[key] = value;
        }
      }

      await notificationService.setNotificationPreferences(userId, preferences);
      res.status(200).json({ success: true, message: "Preferences updated" });
    } catch (error) {
      logger.error("Error in updatePreferences controller:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  public async deleteNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      const success = await notificationService.deleteNotification(
        notificationId,
        userId as string,
      );
      res.status(200).json({ success });
    } catch (error) {
      logger.error("Error in deleteNotification controller:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  /// Get unread notification count for a user
  public async getUnreadCount(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const unreadCount = await notificationService.getUnreadCount(userId);
      res.status(200).json({ success: true, data: { unreadCount } });
    } catch (error) {
      logger.error("Error in getUnreadCount controller:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  /// Push a real-time notification via WebSocket
  public async pushNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { userId, type, title, message, category, priority, actionUrl, metadata } = req.body;

      // Enforce string types to prevent type confusion (e.g., array/object injection)
      if (!userId || !type || !title || !message) {
        res.status(400).json({
          success: false,
          message: "Missing required fields: userId, type, title, and message are required",
        });
        return;
      }
      if (typeof userId !== 'string' || typeof type !== 'string' || typeof title !== 'string' || typeof message !== 'string') {
        res.status(400).json({
          success: false,
          message: "userId, type, title and message must be strings",
        });
        return;
      }

      // Validate and sanitize actionUrl and metadata before passing to service
      const safeActionUrl = typeof actionUrl === 'string' ? actionUrl : undefined;
      const safeMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : undefined;

      const notification = await notificationService.createAndPushNotification(
        userId,
        type as NotificationType,
        title,
        message,
        category || "system",
        {
          priority: priority || "medium",
          actionUrl: safeActionUrl,
          metadata: safeMetadata,
          deliveryMethods: ["websocket"],
        },
      );

      res.status(200).json({ success: true, data: notification });
    } catch (error) {
      logger.error("Error in pushNotification controller:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  /// Admin announcement: push to all connected users or targeted roles
  public async sendAnnouncement(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { title, message, targetRoles, priority, actionUrl } = req.body;

      if (!title || !message) {
        res.status(400).json({
          success: false,
          message: "Title and message are required for announcements",
        });
        return;
      }
      if (typeof title !== 'string' || typeof message !== 'string') {
        res.status(400).json({
          success: false,
          message: "title and message must be strings",
        });
        return;
      }

      // Validate that actionUrl is a string if provided
      const safeActionUrl = typeof actionUrl === 'string' ? actionUrl : undefined;

      const result = await notificationService.sendAnnouncement(
        title,
        message,
        targetRoles || [],
        {
          priority: priority || "high",
          actionUrl: safeActionUrl,
        },
      );

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      logger.error("Error in sendAnnouncement controller:", error);
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }

  /// Deliver missed notifications to a user on reconnect
  public async deliverMissedNotifications(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const userId = req.user.id;

      const delivered = await notificationService.deliverMissedNotifications(
        userId,
      );

      res.status(200).json({ success: true, data: { delivered } });
    } catch (error) {
      logger.error(
        "Error in deliverMissedNotifications controller:",
        error,
      );
      res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
}

export const notificationController = new NotificationController();
