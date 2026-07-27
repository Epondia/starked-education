import {
  Notification,
  INotification,
  NotificationType,
  NotificationPreference,
  INotificationPreference,
} from "../models/Notification";
import { getWebsocketService } from "./websocketService";
import logger from "../utils/logger";
import nodemailer from "nodemailer";
import admin from "firebase-admin";
import { Twilio } from "twilio";
import webpush from "web-push";

// HTML entity escaping to prevent XSS in email content
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Helper: validate URL to prevent open redirects and SSRF
function validateActionUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
    // Block private/internal IP ranges to prevent SSRF
    const hostname = parsed.hostname;
    const isPrivateIPv4 =
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      /^127\./.test(hostname) ||
      /^0\./.test(hostname) ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.startsWith('169.254.');
    const isPrivateIPv6 =
      hostname === '::1' ||
      hostname === '::' ||
      hostname.startsWith('fc00:') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe80:') ||
      hostname === '0:0:0:0:0:0:0:1' ||
      hostname === '0000:0000:0000:0000:0000:0000:0000:0001' ||
      hostname.startsWith('::ffff:127.') ||
      hostname.startsWith('::ffff:10.') ||
      hostname.startsWith('::ffff:192.168.') ||
      /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(hostname);
    // Block IP obfuscation bypasses: decimal (http://2130706433), hex (http://0x7f000001), octal
    if (/^[0-9]+$/.test(hostname) || /^0x[0-9a-fA-F]+$/.test(hostname) || /^0[0-7]+$/.test(hostname)) {
      return undefined;
    }

    if (isPrivateIPv4 || isPrivateIPv6) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

// Blocked metadata keys: MongoDB operators ($) and prototype pollution vectors
const BLOCKED_META_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Allowed preference fields for explicit whitelist-based updates to prevent injection
const ALLOWED_PREFERENCE_FIELDS = new Set([
  'emailNotifications', 'pushNotifications', 'inAppNotifications',
  'digestFrequency', 'quietHoursStart', 'quietHoursEnd',
]);

// Helper: sanitize log strings to prevent log injection (strip newlines/returns and control chars)
function sanitizeLog(data: unknown): string {
  // eslint-disable-next-line no-control-regex
  return String(data).replace(/[\x00-\x1f\x7f-\x9f]/g, '_');
}

// Helper: sanitize metadata to prevent MongoDB operator injection and prototype pollution
function sanitizeMetadata(meta: Record<string, any> | undefined): Record<string, any> | undefined {
  if (!meta) return undefined;
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(meta)) {
    // Reject keys starting with $ (MongoDB operators) and prototype pollution keys
    if (key.startsWith('$') || BLOCKED_META_KEYS.has(key)) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

// Initialize services with environment variables
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || "587"),
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const twilioClient = new Twilio(
  process.env.TWILIO_ACCOUNT_SID || "",
  process.env.TWILIO_AUTH_TOKEN || "",
);

if (process.env.FIREBASE_PROJECT_ID) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

if (process.env.VAPID_PUBLIC_KEY) {
  webpush.setVapidDetails(
    "mailto:" + process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY || "",
    process.env.VAPID_PRIVATE_KEY || "",
  );
}

interface NotificationFilter {
  userId?: string;
  type?: NotificationType;
  category?: "course" | "message" | "system" | "achievement";
  isRead?: boolean;
  priority?: "low" | "medium" | "high";
  limit?: number;
  skip?: number;
}

interface NotificationPreference {
  userId: string;
  enabledCategories: string[];
  deliveryMethods: ("email" | "push" | "websocket")[];
  quietHours?: {
    enabled: boolean;
    start: string; // HH:MM format
    end: string; // HH:MM format
  };
}

class NotificationService {
  constructor() {}

  public async createNotification(
    userId: string,
    title: string,
    message: string,
    category: "course" | "message" | "system" | "achievement",
    options?: {
      type?: NotificationType;
      priority?: "low" | "medium" | "high";
      deliveryMethods?: ("email" | "push" | "websocket")[];
      actionUrl?: string;
      metadata?: Record<string, any>;
      scheduledTime?: Date;
    },
  ): Promise<INotification> {
    try {
      if (typeof title !== 'string' || typeof message !== 'string') {
        throw new Error('title and message must be strings');
      }
      const notification = new Notification({
        userId,
        type: options?.type || "system_alert",
        title,
        message,
        category,
        priority: options?.priority || "medium",
        deliveryMethods: options?.deliveryMethods || ["websocket"],
        actionUrl: validateActionUrl(options?.actionUrl),
        metadata: sanitizeMetadata(options?.metadata),
        scheduledTime: options?.scheduledTime,
      });

      await notification.save();

      // Check if user has preferences that allow this notification
      const preferences = await this.getUserPreferences(userId);
      if (this.shouldSendNotification(userId, category, preferences)) {
        // Deliver based on user preferences
        await this.deliverNotification(notification, preferences);
      }

      logger.info(`Notification created for user ${sanitizeLog(userId)}: ${sanitizeLog(title)}`);
      return notification;
    } catch (error) {
      logger.error("Error creating notification:", error);
      throw error;
    }
  }

  private async deliverNotification(
    notification: INotification,
    preferences: INotificationPreference,
  ): Promise<void> {
    try {
      // Update notification status to indicate it's being delivered
      notification.isDelivered = true;
      notification.sentTime = new Date();
      await notification.save();

      // Validate actionUrl to prevent open redirects
      if (notification.actionUrl) {
        notification.actionUrl = validateActionUrl(notification.actionUrl);
      }

      const deliveryPromises: Promise<void>[] = [];
      if (preferences.deliveryMethods.includes("websocket")) {
        // Deliver via websocket if user is online
        const websocketService = getWebsocketService();
        websocketService.sendNotification(notification.userId, notification);
      }

      if (preferences.deliveryMethods.includes("email")) {
        // Queue email delivery with retry
        deliveryPromises.push(
          this.withRetry(() => this.queueEmailDelivery(notification), 3),
        );
      }

      if (preferences.deliveryMethods.includes("push")) {
        // Queue push notification delivery with retry
        deliveryPromises.push(
          this.withRetry(() => this.queuePushDelivery(notification), 3),
        );
      }

      // We use allSettled to ensure one method failing doesn't stop others,
      // but we wait for all to finish/retry
      await Promise.allSettled(deliveryPromises);
    } catch (error) {
      logger.error("Error delivering notification:", error);
      throw error;
    }
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    retries: number,
    delay = 1000,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (retries <= 1) throw error;
      logger.warn(
        `Delivery failed, retrying in ${delay}ms... (${retries - 1} retries left)`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.withRetry(fn, retries - 1, delay * 2);
    }
  }

  private async queueEmailDelivery(notification: INotification): Promise<void> {
    try {
      const userEmail = notification.metadata?.email;

      if (!userEmail || typeof userEmail !== 'string') {
        logger.warn(`No valid email found for user ${sanitizeLog(notification.userId)}`);
        return;
      }

      // For rich transactional emails, use the enhanced email service
      // For simple notification emails, fall back to basic nodemailer
      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: userEmail,
        subject: notification.title,
        text: notification.message,
        html: `<h3>${escapeHtml(notification.title)}</h3><p>${escapeHtml(notification.message)}</p>`,
      });
      // Log masked email to avoid PII exposure
      logger.info(
        `Email sent to ${userEmail.replace(/(.{3}).*(@.*)/, '$1***$2')} for notification ${sanitizeLog(String(notification._id))}`,
      );
    } catch (error) {
      // Only log error message and stack to avoid leaking request bodies/auth headers
      const err = error instanceof Error ? error.message : String(error);
      logger.error(
        `Error sending email for notification ${notification._id}: ${err}`,
      );
      throw error;
    }
  }

  private async queuePushDelivery(notification: INotification): Promise<void> {
    try {
      // Mobile Push (Firebase)
      if (notification.metadata?.fcmToken) {
        await admin.messaging().send({
          token: notification.metadata.fcmToken,
          notification: {
            title: notification.title,
            body: notification.message,
          },
          data: {
            notificationId: notification._id.toString(),
            actionUrl: notification.actionUrl || "",
          },
        });
        logger.info(`FCM Push sent to ${sanitizeLog(notification.userId)}`);
      }

      // Web Push
      if (notification.metadata?.webPushSubscription) {
        // Validate push subscription endpoint to prevent SSRF
        const sub = notification.metadata.webPushSubscription;
        if (sub && typeof sub.endpoint === 'string') {
          const endpointUrl = validateActionUrl(sub.endpoint);
          if (!endpointUrl) {
            logger.warn(`Rejected web push with unsafe endpoint for user ${sanitizeLog(notification.userId)}`);
            return;
          }
        }
        await webpush.sendNotification(
          notification.metadata.webPushSubscription,
          JSON.stringify({
            title: notification.title,
            body: notification.message,
            icon: "/icon.png",
            url: notification.actionUrl,
          }),
        );
        logger.info(`Web Push sent to ${sanitizeLog(notification.userId)}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      logger.error(
        `Error sending push for notification ${notification._id}: ${err}`,
      );
      throw error;
    }
  }

  private async sendSMS(notification: INotification): Promise<void> {
    try {
      const userPhone = notification.metadata?.phoneNumber;
      if (!userPhone) return;

      await twilioClient.messages.create({
        body: `${notification.title}: ${notification.message}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: userPhone,
      });
      // Log masked phone number to avoid PII exposure
      const maskedPhone = userPhone.slice(-4).padStart(userPhone.length, '*');
      logger.info(`SMS sent to ${maskedPhone} for user ${sanitizeLog(notification.userId)}`);
    } catch (error) {
      logger.error(`Error sending SMS for user ${sanitizeLog(notification.userId)}:`, error);
    }
  }

  public async getNotifications(
    filter: NotificationFilter,
  ): Promise<{ notifications: INotification[]; totalCount: number }> {
    try {
      const query: Record<string, unknown> = {};

      // Only assign primitive values to query to prevent NoSQL operator injection
      if (filter.userId && typeof filter.userId === 'string') query.userId = filter.userId;
      if (filter.type && typeof filter.type === 'string') query.type = filter.type;
      if (filter.category && typeof filter.category === 'string') query.category = filter.category;
      if (filter.isRead !== undefined && typeof filter.isRead === 'boolean') query.isRead = filter.isRead;
      if (filter.priority && typeof filter.priority === 'string') query.priority = filter.priority;

      const limit = typeof filter.limit === 'number' ? filter.limit : 20;
      const skip = typeof filter.skip === 'number' ? filter.skip : 0;

      const [notifications, totalCount] = await Promise.all([
        Notification.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        Notification.countDocuments(query),
      ]);

      return { notifications, totalCount };
    } catch (error) {
      logger.error("Error fetching notifications:", error);
      throw error;
    }
  }

  public async getNotificationById(id: string): Promise<INotification | null> {
    try {
      return await Notification.findById(id).exec();
    } catch (error) {
      logger.error("Error fetching notification by ID:", error);
      throw error;
    }
  }

  public async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const result = await Notification.updateOne(
        { _id: notificationId, userId },
        { isRead: true },
      );
      return result.modifiedCount > 0;
    } catch (error) {
      logger.error("Error marking notification as read:", error);
      throw error;
    }
  }

  public async markAllAsRead(userId: string): Promise<number> {
    try {
      const result = await Notification.updateMany(
        { userId, isRead: false },
        { isRead: true },
      );
      return result.modifiedCount;
    } catch (error) {
      logger.error("Error marking all notifications as read:", error);
      throw error;
    }
  }

  public async deleteNotification(
    notificationId: string,
    userId: string,
  ): Promise<boolean> {
    try {
      const result = await Notification.deleteOne({
        _id: notificationId,
        userId,
      });
      return result.deletedCount > 0;
    } catch (error) {
      logger.error("Error deleting notification:", error);
      throw error;
    }
  }

  public async clearAllNotifications(userId: string): Promise<number> {
    try {
      const result = await Notification.deleteMany({ userId });
      return result.deletedCount;
    } catch (error) {
      logger.error("Error clearing all notifications:", error);
      throw error;
    }
  }

  public async setNotificationPreferences(
    userId: string,
    preferences: Partial<INotificationPreference>,
  ): Promise<void> {
    try {
      // Build update fields via whitelist to prevent MongoDB operator injection
      const updateFields: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(preferences)) {
        if (ALLOWED_PREFERENCE_FIELDS.has(key)) {
          updateFields[key] = value;
        }
      }
      await NotificationPreference.findOneAndUpdate(
        { userId },
        { $set: updateFields },
        { upsert: true, new: true },
      );
      logger.info(`Updated notification preferences for user ${sanitizeLog(userId)}`);
    } catch (error) {
      logger.error("Error setting notification preferences:", error);
      throw error;
    }
  }

  public async getUserPreferences(
    userId: string,
  ): Promise<INotificationPreference> {
    try {
      let preferences = await NotificationPreference.findOne({ userId }).exec();

      if (!preferences) {
        preferences = new NotificationPreference({
          userId,
          enabledCategories: ["course", "message", "system", "achievement"],
          deliveryMethods: ["websocket"],
          quietHours: {
            enabled: false,
            start: "22:00",
            end: "08:00",
          },
        });
        await preferences.save();
      }

      return preferences;
    } catch (error) {
      logger.error(`Error fetching preferences for user ${sanitizeLog(userId)}:`, error);
      throw error;
    }
  }

  private shouldSendNotification(
    userId: string,
    category: string,
    preferences: INotificationPreference,
  ): boolean {
    // Check if category is enabled
    if (!preferences.enabledCategories.includes(category)) {
      return false;
    }

    // Check if currently in quiet hours
    if (preferences.quietHours?.enabled) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      const { start, end } = preferences.quietHours;

      // Simple check for quiet hours - assumes start/end don't cross midnight
      if (start <= end) {
        // Same day quiet hours (e.g., 22:00 to 08:00 is not same day)
        if (currentTime >= start && currentTime <= end) {
          return false;
        }
      } else {
        // Cross midnight quiet hours (e.g., 22:00 to 08:00)
        if (currentTime >= start || currentTime <= end) {
          return false;
        }
      }
    }

    return true;
  }

  public async sendBulkNotification(
    userIds: string[],
    title: string,
    message: string,
    category: "course" | "message" | "system" | "achievement",
    options?: {
      priority?: "low" | "medium" | "high";
      deliveryMethods?: ("email" | "push" | "websocket")[];
      actionUrl?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<{ success: number; failed: number }> {
    let successCount = 0;
    let failedCount = 0;

    for (const userId of userIds) {
      try {
        await this.createNotification(
          userId,
          title,
          message,
          category,
          options,
        );
        successCount++;
      } catch (error) {
        logger.error(`Failed to send notification to user ${sanitizeLog(userId)}:`, error);
        failedCount++;
      }
    }

    return { success: successCount, failed: failedCount };
  }

  // Stub methods for controller compatibility
  public async sendEnrollmentCancellationNotification(userId: string, _enrollment: any): Promise<void> {
    await this.createNotification(userId, 'Enrollment Cancelled', 'Your enrollment has been cancelled.', 'course');
  }

  public async sendCertificateIssuanceNotification(userId: string, _certificate: any): Promise<void> {
    await this.createNotification(userId, 'Certificate Issued', 'Your certificate has been issued.', 'achievement');
  }

  public async sendPaymentConfirmationNotification(userId: string, _transaction: any): Promise<void> {
    await this.createNotification(userId, 'Payment Confirmed', 'Your payment has been confirmed.', 'course');
  }

  public async sendRefundNotification(userId: string, _refund: any): Promise<void> {
    await this.createNotification(userId, 'Refund Processed', 'Your refund has been processed.', 'course');
  }

  public async notifyAssignmentCreated(userId: string, _assignment: any): Promise<void> {
    await this.createNotification(userId, 'Assignment Created', 'A new assignment has been created.', 'course');
  }

  public async notifyGradeCreated(userId: string, _grade: any): Promise<void> {
    await this.createNotification(userId, 'Grade Posted', 'Your grade has been posted.', 'course', { type: 'assignment_graded' });
  }

  /// Get unread notification count for a user
  public async getUnreadCount(userId: string): Promise<number> {
    try {
      return await Notification.countDocuments({ userId, isRead: false });
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting unread count for user ${sanitizeLog(userId)}: ${sanitizeLog(err)}`);
      throw error;
    }
  }

  /// Create a notification and push it immediately via WebSocket (no duplicate delivery)
  public async createAndPushNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    category: "course" | "message" | "system" | "achievement",
    options?: {
      priority?: "low" | "medium" | "high";
      actionUrl?: string;
      metadata?: Record<string, any>;
      deliveryMethods?: ("email" | "push" | "websocket")[];
    },
  ): Promise<INotification> {
    // Validate input types at the DB boundary to prevent NoSQL operator injection
    if (typeof title !== 'string' || typeof message !== 'string') {
      throw new Error('title and message must be strings');
    }
    // Create notification directly without auto-delivery to avoid duplicate push
    const notification = new Notification({
        userId,
        type,
        title,
        message,
        category,
        priority: options?.priority || "medium",
        deliveryMethods: options?.deliveryMethods || ["websocket"],
        actionUrl: validateActionUrl(options?.actionUrl),
        metadata: sanitizeMetadata(options?.metadata),
      });

    await notification.save();

    // Push via WebSocket immediately (only delivery method)
    try {
      const websocketService = getWebsocketService();
      websocketService.sendNotification(userId, notification);
      notification.isDelivered = true;
      notification.deliveredAt = new Date();
      await notification.save();
    } catch (wsError) {
      logger.warn(
        `WebSocket push failed for user ${sanitizeLog(userId)}, notification persisted for later delivery`,
      );
    }
      logger.info(`Notification pushed for user ${sanitizeLog(userId)}: ${sanitizeLog(title)}`);
    return notification;
  }

  /// Admin announcement: persist and push to all connected users or targeted roles
  public async sendAnnouncement(
    title: string,
    message: string,
    targetRoles: string[],
    options?: {
      priority?: "low" | "medium" | "high";
      actionUrl?: string;
    },
  ): Promise<{ persisted: number; pushed: number }> {
    try {
      const websocketService = getWebsocketService();
      const safeActionUrl = validateActionUrl(options?.actionUrl);

      // Validate input types to prevent NoSQL operator injection
      if (typeof title !== 'string' || typeof message !== 'string') {
        throw new Error('title and message must be strings');
      }

      // Persist announcement notification for offline users
      // If roles are targeted, only persist for users in connected rooms matching those roles
      let persistedCount = 0;
      if (targetRoles.length > 0) {
        // For role-targeted announcements, broadcast to matching rooms (persist is best-effort for connected users)
        // Note: We cannot easily determine which user has which role without user profile lookup,
        // so we persist only when broadcasting to all users. Role-targeted announcements are primarily
        // delivered via WebSocket in real-time.
      } else {
        // Persist for all connected users so offline users get it on reconnect
        const connectedUsers = websocketService.getConnectedUsers();
        for (const userId of connectedUsers) {
          try {
            const notification = new Notification({
              userId,
              type: "announcement",
              title,
              message,
              category: "system",
              priority: options?.priority || "high",
              actionUrl: safeActionUrl,
              isDelivered: false,
            });
            await notification.save();
            persistedCount++;
          } catch (err) {
            logger.warn(`Failed to persist announcement for user ${sanitizeLog(userId)}`);
          }
        }
      }

      let pushedCount = 0;
      // Push to connected users via WebSocket
      if (targetRoles.length > 0) {
        // Broadcast to connected users with matching roles
        for (const role of targetRoles) {
          // Validate role to prevent event/room injection
          if (typeof role !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(role)) continue;
          const roomName = `role:${role}`;
          websocketService.emitToRoom(roomName, "notification", {
            type: "announcement",
            title,
            message,
            priority: options?.priority || "high",
            actionUrl: validateActionUrl(options?.actionUrl),
            timestamp: new Date().toISOString(),
          });
        }
        pushedCount = websocketService.getConnectedCount();
      } else {
        // Broadcast to all connected users
        websocketService.broadcast("notification", {
          type: "announcement",
          title,
          message,
          priority: options?.priority || "high",
          actionUrl: validateActionUrl(options?.actionUrl),
          timestamp: new Date().toISOString(),
        });
        pushedCount = websocketService.getConnectedCount();
      }

      return { persisted: persistedCount, pushed: pushedCount };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      logger.error(`Error sending announcement: ${sanitizeLog(err)}`);
      throw error;
    }
  }

  /// Deliver missed notifications to a user who just reconnected
  public async deliverMissedNotifications(
    userId: string,
  ): Promise<number> {
    try {
      // Find all undelivered notifications for this user
      const missedNotifications = await Notification.find({
        userId,
        isDelivered: false,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .exec();

      if (missedNotifications.length === 0) {
        return 0;
      }

      const websocketService = getWebsocketService();
      let deliveredCount = 0;

      for (const notification of missedNotifications) {
        try {
          websocketService.sendNotification(userId, notification);
          notification.isDelivered = true;
          notification.deliveredAt = new Date();
          await notification.save();
          deliveredCount++;
        } catch (wsError) {
          logger.warn(
            `Failed to deliver missed notification ${notification._id} to user ${sanitizeLog(userId)}`,
          );
        }
      }

      return deliveredCount;
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      logger.error(`Error delivering missed notifications for user ${sanitizeLog(userId)}: ${sanitizeLog(err)}`);
      throw error;
    }
  }
}

export { NotificationService };
export const notificationService = new NotificationService();
