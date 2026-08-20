const ApiKey = require('../models/ApiKey');
const logger = require('../utils/logger');
const securityService = require('../services/securityService');

/**
 * API Key Authentication Middleware
 * Looks up the key by hashing and verifying against stored hashes.
 * Attaches keyDoc to req.apiKey and user info to req.user.
 */
const authenticateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return next(); // No API key — proceed to next middleware (e.g. JWT)
  }

  try {
    // Find all active, non-expired keys and verify the raw key against each hash.
    // We cannot query by hash directly since bcrypt is not invertible.
    // For efficiency we query active keys and verify in-memory.
    const candidates = await ApiKey.find({
      status: 'active',
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    }).limit(50);

    let matchedKey = null;
    for (const candidate of candidates) {
      const match = await ApiKey.verifyKey(apiKey, candidate.keyHash);
      if (match) {
        matchedKey = candidate;
        break;
      }
    }

    if (!matchedKey) {
      await securityService.logSecurityEvent(req.ip, 'invalid_api_key', {
        keyPrefix: apiKey.slice(0, 7),
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid or revoked API key',
      });
    }

    // Update last used (fire-and-forget for performance)
    matchedKey.lastUsedAt = new Date();
    matchedKey.save().catch((err) => logger.error('Failed to update lastUsedAt:', err));

    req.user = { id: matchedKey.userId, role: 'api_user' };
    req.apiKey = matchedKey;

    next();
  } catch (error) {
    logger.error('API Key authentication error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Scope enforcement middleware factory.
 * Must be used after authenticateApiKey.
 * @param {string|string[]} requiredScopes - Scope(s) required for the route
 * @returns {Function} Express middleware
 */
const requireScope = (requiredScopes) => {
  const scopes = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];

  return (req, res, next) => {
    // If no API key was used, skip scope check (JWT auth handles its own permissions)
    if (!req.apiKey) {
      return next();
    }

    const keyScopes = req.apiKey.scopes || [];

    // A key with the wildcard scope '*' has access to everything
    if (keyScopes.includes('*')) {
      return next();
    }

    // Check that the key has at least one of the required scopes
    const hasScope = scopes.some((s) => keyScopes.includes(s));

    if (!hasScope) {
      return res.status(403).json({
        success: false,
        message: `Insufficient API key scopes. Required: ${scopes.join(' or ')}`,
      });
    }

    next();
  };
};

module.exports = { authenticateApiKey, requireScope };
