import express, { Router } from "express";
import { notificationController } from "../controllers/notificationController";
import { validateRequestSchema } from "../middleware/validateRequestSchema";
import { getNotificationsSchema, markAsReadSchema, markAllAsReadSchema, updatePreferencesSchema, deleteNotificationSchema } from "../middleware/validation";
import { rateLimitMiddleware } from "../middleware/rateLimit";

const router: Router = express.Router();

// Rate limiters for notification endpoints
const notificationReadLimiter = rateLimitMiddleware({ windowMs: 60 * 1000, max: 60, message: 'Too many notification requests, please try again.' });
const notificationWriteLimiter = rateLimitMiddleware({ windowMs: 60 * 1000, max: 30, message: 'Too many notification updates, please try again.' });

// Get notification history
router.get("/:userId", notificationReadLimiter, validateRequestSchema(getNotificationsSchema), notificationController.getNotifications);

// Mark as read
router.patch("/:notificationId/read", notificationWriteLimiter, validateRequestSchema(markAsReadSchema), notificationController.markAsRead);

// Mark all as read
router.patch("/read-all", notificationWriteLimiter, validateRequestSchema(markAllAsReadSchema), notificationController.markAllAsRead);

// Preferences
router.get("/:userId/preferences", notificationReadLimiter, validateRequestSchema(getNotificationsSchema), notificationController.getPreferences);
router.put("/:userId/preferences", notificationWriteLimiter, validateRequestSchema(updatePreferencesSchema), notificationController.updatePreferences);

// Delete
router.delete("/:notificationId", notificationWriteLimiter, validateRequestSchema(deleteNotificationSchema), notificationController.deleteNotification);

export default router;
