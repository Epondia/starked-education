import express, { Router } from "express";
import { notificationController } from "../controllers/notificationController";
import { validateRequestSchema } from "../middleware/validateRequestSchema";
import { getNotificationsSchema, markAsReadSchema, markAllAsReadSchema, updatePreferencesSchema, deleteNotificationSchema } from "../middleware/validation";

const router: Router = express.Router();

// Get notification history
router.get("/:userId", validateRequestSchema(getNotificationsSchema), notificationController.getNotifications);

// Get unread count
router.get("/:userId/unread-count", validateRequestSchema(getNotificationsSchema), notificationController.getUnreadCount);

// Deliver missed notifications on reconnect
router.post("/:userId/deliver-missed", notificationController.deliverMissedNotifications);

// Mark as read
router.patch("/:notificationId/read", validateRequestSchema(markAsReadSchema), notificationController.markAsRead);

// Mark all as read
router.patch("/read-all", validateRequestSchema(markAllAsReadSchema), notificationController.markAllAsRead);

// Push real-time notification via WebSocket
router.post("/push", notificationController.pushNotification);

// Admin announcement (broadcast to all or targeted roles)
router.post("/announce", notificationController.sendAnnouncement);

// Preferences
router.get("/:userId/preferences", validateRequestSchema(getNotificationsSchema), notificationController.getPreferences);
router.put("/:userId/preferences", validateRequestSchema(updatePreferencesSchema), notificationController.updatePreferences);

// Delete
router.delete("/:notificationId", validateRequestSchema(deleteNotificationSchema), notificationController.deleteNotification);

export default router;
