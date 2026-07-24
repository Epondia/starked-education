import { Router } from "express";
import quizController from "../controllers/quizController";
import { requirePermission } from "../middleware/rbac";
import { PERMISSIONS } from "../utils/roles";
import { asyncHandler } from "../middleware/errorHandler";
import { validateRequestSchema } from "../middleware/validateRequestSchema";
import { createQuizSchema, updateQuizSchema, submitQuizSchema, toggleQuizPublishSchema, regradeSubmissionSchema } from "../middleware/validation";
import { rateLimitMiddleware } from "../middleware/rateLimit";

const router: Router = Router();

// Rate limiters for quiz endpoints
const quizWriteLimiter = rateLimitMiddleware({ windowMs: 60 * 1000, max: 20, message: 'Too many quiz write requests, please try again.' });
const quizSubmitLimiter = rateLimitMiddleware({ windowMs: 60 * 1000, max: 10, message: 'Too many quiz submissions, please try again.' });
const quizReadLimiter = rateLimitMiddleware({ windowMs: 60 * 1000, max: 100, message: 'Too many quiz read requests, please try again.' });

// Helper to wrap controller methods with async error handling
const wrap = (fn: any) => asyncHandler(fn.bind(quizController));

// Quiz CRUD endpoints
router.post(
  "/",
  quizWriteLimiter,
  requirePermission(PERMISSIONS.QUIZ_CREATE),
  validateRequestSchema(createQuizSchema),
  wrap(quizController.createQuiz),
);
router.get(
  "/",
  quizReadLimiter,
  requirePermission(PERMISSIONS.QUIZ_READ),
  wrap(quizController.getQuizzes),
);
router.get(
  "/:id",
  quizReadLimiter,
  requirePermission(PERMISSIONS.QUIZ_READ),
  wrap(quizController.getQuizById),
);
router.put(
  "/:id",
  quizWriteLimiter,
  requirePermission(PERMISSIONS.QUIZ_UPDATE),
  validateRequestSchema(updateQuizSchema),
  wrap(quizController.updateQuiz),
);
router.delete(
  "/:id",
  quizWriteLimiter,
  requirePermission(PERMISSIONS.QUIZ_DELETE),
  wrap(quizController.deleteQuiz),
);

// Quiz publishing
router.post(
  "/:id/publish",
  quizWriteLimiter,
  requirePermission(PERMISSIONS.QUIZ_UPDATE),
  validateRequestSchema(toggleQuizPublishSchema),
  wrap(quizController.toggleQuizPublish),
);

// Quiz submission and grading
router.post(
  "/:id/submit",
  quizSubmitLimiter,
  requirePermission(PERMISSIONS.PROGRESS_TRACK),
  validateRequestSchema(submitQuizSchema),
  wrap(quizController.submitQuiz),
);
router.get(
  "/:id/submission",
  quizReadLimiter,
  requirePermission(PERMISSIONS.PROGRESS_TRACK),
  wrap(quizController.getUserSubmission),
);
router.get(
  "/:id/results",
  quizReadLimiter,
  requirePermission(PERMISSIONS.PROGRESS_TRACK),
  wrap(quizController.getQuizResults),
);
router.get(
  "/:id/statistics",
  quizReadLimiter,
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  wrap(quizController.getQuizStatistics),
);
router.get(
  "/:id/grading-statistics",
  quizReadLimiter,
  requirePermission(PERMISSIONS.COURSE_GRADE),
  wrap(quizController.getGradingStatistics),
);

// Submission management
router.get(
  "/submissions/:submissionId",
  quizReadLimiter,
  requirePermission(PERMISSIONS.COURSE_GRADE),
  wrap(quizController.getSubmissionById),
);
router.post(
  "/submissions/:submissionId/regrade",
  quizWriteLimiter,
  requirePermission(PERMISSIONS.COURSE_GRADE),
  validateRequestSchema(regradeSubmissionSchema),
  wrap(quizController.regradeSubmission),
);

// Health check
router.get("/health", wrap(quizController.healthCheck));

export default router;
