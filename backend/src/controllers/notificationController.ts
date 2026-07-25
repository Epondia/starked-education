import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { notificationService } from "../services/notificationService";
import logger from "../utils/logger";

export class NotificationController {
  public async getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user.id;
      const { category, type, isRead, priority, limit, skip } = req.query;

      const result = await notificationService.getNotifications({
        userId,
        category: category as any,
        type: type as any,
        isRead:
          isRead === "true" ? true : isRead === "false" ? false : undefined,
        priority: priority as any,
        limit: limit ? parseInt(limit as string) : 20,
        skip: skip ? parseInt(skip as string) : 0,
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
      const preferences = req.body;

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
      const {
        userId,
        type,
        title,
        message,
        category,
        priority,
        actionUrl,
        metadata,
      } = req.body;

      if (!userId || !type || !title || !message) {
        res.status(400).json({
          success: false,
          message:
            "Missing required fields: userId, type, title, and message are required",
        });
        return;
      }

      const notification = await notificationService.createAndPushNotification(
        userId,
        type,
        title,
        message,
        category || "system",
        {
          priority: priority || "medium",
          actionUrl,
          metadata,
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

      const result = await notificationService.sendAnnouncement(
        title,
        message,
        targetRoles || [],
        {
          priority: priority || "high",
          actionUrl,
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
