/**
 * Webhook Routes
 * Admin API endpoints for webhook registration, management, and delivery history
 */

import express, { Router, Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';
import { webhookService } from '../services/webhookService';
import { ALL_WEBHOOK_EVENT_TYPES, WebhookEventType } from '../models/Webhook';
import { rateLimit } from 'express-rate-limit';

const router: Router = express.Router();

// Rate limiting for webhook management endpoints
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: 'Too many webhook management requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route POST /api/webhooks
 * @desc Register a new webhook endpoint
 * @access Private (Admin only)
 */
router.post(
  '/',
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  webhookLimiter,
  async (req: Request, res: Response) => {
    try {
      const { url, events, secret, description } = req.body;

      if (!url || !events || !Array.isArray(events) || events.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Fields "url" and "events" (non-empty array) are required',
        });
      }

      const invalidEvents = events.filter(
        (e: string) => !ALL_WEBHOOK_EVENT_TYPES.includes(e),
      );
      if (invalidEvents.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid event types: ${invalidEvents.join(', ')}`,
          validEvents: ALL_WEBHOOK_EVENT_TYPES,
        });
      }

      // Use the authenticated user's ID as the tenant ID
      const tenantId = (req as any).user.id;

      const webhook = await webhookService.registerWebhook(tenantId, {
        url,
        events: events as WebhookEventType[],
        secret,
        description,
      });

      res.status(201).json({
        success: true,
        data: webhook,
      });
    } catch (error: any) {
      const status = error.message?.includes('Maximum') ? 409 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to register webhook',
      });
    }
  },
);

/**
 * @route GET /api/webhooks
 * @desc List all webhooks for the authenticated tenant
 * @access Private (Admin only)
 */
router.get(
  '/',
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user.id;
      const webhooks = webhookService.getWebhooksForTenant(tenantId);

      res.json({
        success: true,
        data: webhooks,
        count: webhooks.length,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to list webhooks',
      });
    }
  },
);

/**
 * @route GET /api/webhooks/events
 * @desc List all supported webhook event types
 * @access Private (Admin only)
 */
router.get(
  '/events',
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: ALL_WEBHOOK_EVENT_TYPES,
    });
  },
);

/**
 * @route GET /api/webhooks/:id
 * @desc Get a single webhook by ID
 * @access Private (Admin only)
 */
router.get(
  '/:id',
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tenantId = (req as any).user.id;
      const webhook = webhookService.getWebhookByIdAndTenant(id, tenantId);

      if (!webhook) {
        return res.status(404).json({
          success: false,
          message: 'Webhook not found',
        });
      }

      res.json({
        success: true,
        data: webhook,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get webhook',
      });
    }
  },
);

/**
 * @route PUT /api/webhooks/:id
 * @desc Update a webhook (url, events, description, isActive)
 * @access Private (Admin only)
 */
router.put(
  '/:id',
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tenantId = (req as any).user.id;
      const { url, events, description, isActive } = req.body;

      const webhook = await webhookService.updateWebhook(id, tenantId, {
        url,
        events,
        description,
        isActive,
      });

      res.json({
        success: true,
        data: webhook,
      });
    } catch (error: any) {
      const status = error.message?.includes('not found') ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to update webhook',
      });
    }
  },
);

/**
 * @route DELETE /api/webhooks/:id
 * @desc Delete a webhook and all its pending deliveries
 * @access Private (Admin only)
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tenantId = (req as any).user.id;

      await webhookService.deleteWebhook(id, tenantId);

      res.json({
        success: true,
        message: 'Webhook deleted successfully',
      });
    } catch (error: any) {
      const status = error.message?.includes('not found') ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to delete webhook',
      });
    }
  },
);

/**
 * @route POST /api/webhooks/:id/rotate-secret
 * @desc Rotate the signing secret for a webhook
 * @access Private (Admin only)
 */
router.post(
  '/:id/rotate-secret',
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tenantId = (req as any).user.id;

      const result = await webhookService.rotateSecret(id, tenantId);

      res.json({
        success: true,
        data: result,
        message: 'Webhook secret rotated successfully',
      });
    } catch (error: any) {
      const status = error.message?.includes('not found') ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to rotate secret',
      });
    }
  },
);

/**
 * @route GET /api/webhooks/:id/deliveries
 * @desc Get delivery history for a webhook
 * @access Private (Admin only)
 */
router.get(
  '/:id/deliveries',
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tenantId = (req as any).user.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const deliveries = webhookService.getDeliveryHistory(id, tenantId, {
        limit,
        offset,
      });

      res.json({
        success: true,
        data: deliveries,
        count: deliveries.length,
      });
    } catch (error: any) {
      const status = error.message?.includes('not found') ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to get delivery history',
      });
    }
  },
);

/**
 * @route POST /api/webhooks/:id/deliveries/:deliveryId/retry
 * @desc Manually retry a specific delivery
 * @access Private (Admin only)
 */
router.post(
  '/:id/deliveries/:deliveryId/retry',
  authenticateToken,
  requireRole([UserRole.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const { id, deliveryId } = req.params;
      const tenantId = (req as any).user.id;

      // Verify webhook belongs to tenant before retry
      const webhook = webhookService.getWebhookByIdAndTenant(id, tenantId);
      if (!webhook) {
        return res.status(404).json({
          success: false,
          message: 'Webhook not found',
        });
      }

      const delivery = await webhookService.retryDelivery(id, deliveryId);

      res.json({
        success: true,
        data: delivery,
      });
    } catch (error: any) {
      const status = error.message?.includes('not found') ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to retry delivery',
      });
    }
  },
);

export default router;
