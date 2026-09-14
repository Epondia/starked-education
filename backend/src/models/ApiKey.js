const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

const apiKeyAuditSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['created', 'rotated', 'revoked'],
    required: true,
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
  },
}, { _id: false });

const apiKeySchema = new mongoose.Schema({
  keyHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  keyPrefix: {
    type: String,
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  scopes: {
    type: [String],
    default: [],
    validate: {
      validator: (scopes) => scopes.every((s) => typeof s === 'string' && s.length > 0),
      message: 'Scopes must be non-empty strings',
    },
  },
  status: {
    type: String,
    enum: ['active', 'revoked'],
    default: 'active',
  },
  lastUsedAt: Date,
  expiresAt: Date,
  audit: [apiKeyAuditSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for efficient lookups
apiKeySchema.index({ userId: 1, status: 1 });
apiKeySchema.index({ status: 1, expiresAt: 1 });

/**
 * Generate a new raw API key and its hash.
 * Returns { rawKey, keyHash, keyPrefix }.
 */
apiKeySchema.statics.generateKey = async function () {
  const rawKey = 'sk_' + crypto.randomBytes(24).toString('hex');
  const keyHash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);
  const keyPrefix = rawKey.slice(0, 7); // e.g. "sk_a1b2c"
  return { rawKey, keyHash, keyPrefix };
};

/**
 * Verify a raw key against a stored hash.
 */
apiKeySchema.statics.verifyKey = async function (rawKey, keyHash) {
  return bcrypt.compare(rawKey, keyHash);
};

const ApiKey = mongoose.model('ApiKey', apiKeySchema);

module.exports = ApiKey;
