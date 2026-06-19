export const validateAssignment = (req: any, res: any, next: any) => next();
export const validateSubmission = (req: any, res: any, next: any) => next();
export const validateRequest = (req: any, res: any, next: any) => next();
// Alias for compatibility (Issue #28 follow-up): expose `validateRequestSchema`
// as a no-op factory with the same call shape as the middleware/validation.ts
// Joi factory. Any consumer that imports `validateRequestSchema` from this
// module receives a function whose return value is the no-op middleware
// `validateRequest`. Joi enforcement still lives in `../middleware/validation.ts`.
export const validateRequestSchema = (_schema: unknown) => validateRequest;
