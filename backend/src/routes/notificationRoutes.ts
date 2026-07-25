import express, { Router } from "express";
import { notificationController } from "../controllers/notificationController";
import { authenticateToken } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rateLimit";
import { validateRequestSchema } from "../middleware/validateRequestSchema";
import { getNotificationsSchema, markAsReadSchema, markAllAsReadSchema, updatePreferencesSchema, deleteNotificationSchema } from "../middleware/validation";

const router: Router = express.Router();

// Apply authentication and rate limiting to all notification routes
router.use(authenticateToken);
router.use(rateLimitMiddleware({ max: 100, windowMs: 15 * 60 * 1000 })); // 100 requests per 15 minutes

// Get notification history
router.get("/", validateRequestSchema(getNotificationsSchema), notificationController.getNotifications);

// Get unread count
router.get("/unread-count", notificationController.getUnreadCount);

// Deliver missed notifications on reconnect
router.post("/deliver-missed", notificationController.deliverMissedNotifications);

// Mark as read
router.patch("/:notificationId/read", validateRequestSchema(markAsReadSchema), notificationController.markAsRead);

// Mark all as read
router.patch("/read-all", validateRequestSchema(markAllAsReadSchema), notificationController.markAllAsRead);

// Push real-time notification via WebSocket
router.post("/push", notificationController.pushNotification);

// Admin announcement (broadcast to all or targeted roles)
router.post("/announce", notificationController.sendAnnouncement);

// Preferences
router.get("/preferences", notificationController.getPreferences);
router.put("/preferences", validateRequestSchema(updatePreferencesSchema), notificationController.updatePreferences);

// Delete
router.delete("/:notificationId", validateRequestSchema(deleteNotificationSchema), notificationController.deleteNotification);

export default router;
