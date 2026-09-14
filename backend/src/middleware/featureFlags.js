/**
 * Feature Flags Middleware
 *
 * Evaluates server-side feature flags for the current request/user and
 * attaches the result to `req.featureFlags` so downstream route handlers
 * can branch on them without calling the framework directly.
 *
 * Fails open: if flag evaluation throws, the request continues with an
 * empty flag set rather than being blocked — flag infrastructure must never
 * take down the API.
 */

const abTestingFramework = require('../services/abTestingFramework');

/**
 * Resolve a stable user identifier from the request context. Prefers the
 * authenticated user (`req.user`) and falls back to an explicit
 * `X-User-Id` header for anonymous/unauthenticated callers.
 */
function resolveUserId(req) {
  const user = req.user || {};
  return (
    user.userId ||
    user.id ||
    user._id ||
    user.sub ||
    (req.headers && req.headers['x-user-id']) ||
    null
  );
}

/**
 * Express middleware. Attaches `req.featureFlags` ({ flagName: boolean }).
 */
async function featureFlagsMiddleware(req, res, next) {
  try {
    const userId = resolveUserId(req);
    req.featureFlags = await abTestingFramework.evaluateFlags(userId);
  } catch (error) {
    console.warn(
      'Feature flags middleware: evaluation failed, defaulting to empty set:',
      error.message
    );
    req.featureFlags = {};
  }

  next();
}

module.exports = {
  featureFlagsMiddleware,
  resolveUserId,
};
