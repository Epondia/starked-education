/**
 * Configurable CORS middleware (issue #384).
 *
 * CORS used to be applied unconditionally via `app.use(cors())`, which let
 * any website issue cross-origin requests to the API — with credentials
 * flowing in browsers from malicious origins. This factory replaces that:
 *
 *   - CORS is completely disabled unless `ENABLE_CORS === 'true'`.
 *   - When enabled, only the comma-separated `CORS_ORIGINS` allowlist may
 *     call the API, and credentials are allowed for those exact origins.
 *   - An empty allowlist denies every cross-origin request (no
 *     Access-Control-Allow-Origin header is emitted).
 *
 * The `env` parameter is injected for testability and defaults to
 * `process.env`.
 */

const cors = require('cors');

/**
 * Build the CORS middleware for the current environment, or return `null`
 * when CORS is disabled so callers can skip mounting it entirely.
 */
function buildCorsMiddleware(env = process.env) {
  if (env.ENABLE_CORS !== 'true') {
    return null;
  }

  const allowedOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return cors({
    // `false` emits no Access-Control-Allow-Origin header, so cross-origin
    // requests are rejected by the browser even with CORS "enabled".
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  });
}

module.exports = { buildCorsMiddleware };
