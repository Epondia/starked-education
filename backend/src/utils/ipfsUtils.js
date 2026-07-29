const crypto = require('crypto');
const path = require('path');
const { ipfsConfig } = require('../config/ipfs');

/**
 * Generate a unique content hash for metadata
 * @param {Object} metadata - The metadata object
 * @returns {string} - The generated hash
 */
const generateContentHash = (metadata) => {
  const metadataString = JSON.stringify(metadata, Object.keys(metadata).sort());
  return crypto.createHash('sha256').update(metadataString).digest('hex');
};

/**
 * Get human-readable file size description for error messages
 * @param {number} bytes - File size in bytes
 * @returns {string} - Human readable size
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const units = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];
};

/**
 * Read the first bytes of a buffer to check magic bytes
 * @param {Buffer} buffer - The file buffer
 * @param {number} maxBytes - Maximum number of bytes to return as hex
 * @returns {string} - Hex string of magic bytes
 */
const getMagicBytes = (buffer, maxBytes = 4) => {
  if (!buffer || buffer.length === 0) return '';
  return buffer.slice(0, Math.min(maxBytes, buffer.length)).toString('hex').toUpperCase();
};

/**
 * Scan file for malware/virus signatures
 * Checks magic bytes, file extension, and hash blocklist
 * @param {Object} file - The file object with buffer, originalname, etc.
 * @returns {{ isClean: boolean, threats: string[] }}
 */
const scanForMalware = (file) => {
  const threats = [];
  const scanConfig = ipfsConfig.malwareScanning || {};
  
  if (!scanConfig.enabled) {
    return { isClean: true, threats: [] };
  }
  
  // Check magic bytes against blocklist
  if (file.buffer && file.buffer.length > 0) {
    const magicBytes = getMagicBytes(file.buffer);
    const blocklist = scanConfig.magicByteBlocklist || [];
    
    for (const blockedMagic of blocklist) {
      if (magicBytes.startsWith(blockedMagic.toUpperCase())) {
        threats.push(
          `File matched blocked magic bytes signature: ${blockedMagic}. ` +
          `This file type is not allowed for security reasons.`
        );
      }
    }
  }
  
  // Check file hash against known malicious hashes
  if (file.buffer && file.buffer.length > 0) {
    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const hashBlocklist = scanConfig.hashBlocklist || [];
    
    if (hashBlocklist.includes(fileHash)) {
      threats.push(
        `File hash matches a known malicious signature. Upload rejected for security.`
      );
    }
  }
  
  // Check file extension against blocked extensions
  if (file.originalname) {
    const ext = path.extname(file.originalname).toLowerCase();
    const blockedExtensions = scanConfig.blockedExtensions || [];
    
    if (blockedExtensions.includes(ext)) {
      threats.push(
        `File extension "${ext}" is blocked for security reasons. ` +
        `Blocked extensions: ${blockedExtensions.join(', ')}`
      );
    }
  }
  
  return {
    isClean: threats.length === 0,
    threats
  };
};

/**
 * Validate file type and size with descriptive error messages
 * @param {Object} file - The file object
 * @param {Object} options - Validation options
 * @param {boolean} options.bypassValidation - If true, skip all validation (admin bypass)
 * @returns {Object} - Validation result with descriptive errors
 */
const validateFile = (file, options = {}) => {
  const errors = [];
  
  // Admin bypass check
  if (options.bypassValidation === true) {
    return {
      isValid: true,
      errors: [],
      warnings: ['Validation bypassed by admin override. Exercise caution.'],
      details: {
        filename: file.originalname || 'unknown',
        size: file.size || 0,
        sizeFormatted: formatFileSize(file.size || 0),
        contentType: file.mimetype || 'unknown'
      }
    };
  }
  
  // Validate file object structure
  if (!file) {
    errors.push('No file provided. Please attach a file to the request.');
    return { isValid: false, errors, details: {} };
  }
  
  if (!file.buffer && !file.size) {
    errors.push('File appears to be empty or corrupted. File has no content or size.');
    return { isValid: false, errors, details: {} };
  }
  
  const filename = file.originalname || 'unknown';
  const fileSize = file.size || (file.buffer ? file.buffer.length : 0);
  const mimeType = file.mimetype || 'unknown';
  
  // Check content type against allowlist
  const allowedTypes = ipfsConfig.allowedContentTypes || [];
  if (!allowedTypes.includes(mimeType)) {
    errors.push(
      `Content type "${mimeType}" is not allowed for IPFS upload. ` +
      `Allowed types include: documents (PDF, DOCX, XLSX), images (JPG, PNG, GIF, WebP), ` +
      `video (MP4, WebM), audio (MP3, WAV), code files (JSON, XML), ` +
      `and archives (ZIP, TAR, GZ). ` +
      `See /docs/ACCEPTED_FILE_TYPES.md for the complete list.`
    );
  }
  
  // Determine size limit for this file type
  const typeLimits = ipfsConfig.typeSizeLimits || {};
  const globalLimit = ipfsConfig.maxFileSize || 100 * 1024 * 1024; // 100MB default
  const typeSpecificLimit = typeLimits[mimeType];
  const effectiveLimit = typeSpecificLimit || globalLimit;
  
  // Check file size
  if (fileSize > effectiveLimit) {
    const limitFormatted = formatFileSize(effectiveLimit);
    const actualFormatted = formatFileSize(fileSize);
    const limitSource = typeSpecificLimit 
      ? `specific limit for ${mimeType} files` 
      : 'global maximum file size limit';
    
    errors.push(
      `File size ${actualFormatted} exceeds the ${limitSource} of ${limitFormatted}. ` +
      `Please reduce the file size or use a smaller file. ` +
      `Tip: For large videos or archives, consider splitting them into smaller parts.`
    );
  }
  
  // Check for empty files
  if (fileSize === 0) {
    errors.push('File is empty (0 bytes). Please upload a file with content.');
  }
  
  // Run malware scan
  const scanResult = scanForMalware(file);
  if (!scanResult.isClean) {
    errors.push(...scanResult.threats);
  }
  
  // File extension validation
  if (filename) {
    const ext = path.extname(filename).toLowerCase();
    if (!ext) {
      errors.push(
        `File "${filename}" has no extension. ` +
        `Please provide a file with a valid extension (e.g., .pdf, .jpg, .mp4).`
      );
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    details: {
      filename,
      size: fileSize,
      sizeFormatted: formatFileSize(fileSize),
      contentType: mimeType,
      effectiveLimit: formatFileSize(effectiveLimit),
      limitType: typeSpecificLimit ? 'type-specific' : 'global',
      malwareScanPerformed: (ipfsConfig.malwareScanning || {}).enabled || false
    }
  };
};

/**
 * Create metadata for uploaded content
 * @param {Object} file - The file object
 * @param {Object} user - The user object (optional)
 * @param {Object} additionalMetadata - Additional metadata (optional)
 * @returns {Object} - The created metadata
 */
const createMetadata = (file, user = null, additionalMetadata = {}) => {
  const metadata = {
    name: file.originalname,
    size: file.size,
    contentType: file.mimetype,
    uploadedAt: new Date().toISOString(),
    contentHash: generateContentHash({
      name: file.originalname,
      size: file.size,
      contentType: file.mimetype
    })
  };
  
  // Add uploader information if enabled and user is provided
  if (ipfsConfig.metadata.includeUploader && user) {
    metadata.uploader = {
      id: user.id,
      username: user.username,
      address: user.address
    };
  }
  
  // Add additional metadata
  Object.assign(metadata, additionalMetadata);
  
  return metadata;
};

/**
 * Format IPFS hash for gateway access
 * @param {string} hash - The IPFS hash
 * @returns {string} - The formatted gateway URL
 */
const formatGatewayUrl = (hash) => {
  return `${ipfsConfig.gatewayUrl}${hash}`;
};

/**
 * Extract IPFS hash from gateway URL
 * @param {string} gatewayUrl - The gateway URL
 * @returns {string} - The IPFS hash
 */
const extractHashFromGatewayUrl = (gatewayUrl) => {
  const match = gatewayUrl.match(/\/ipfs\/(.+)$/);
  return match ? match[1] : null;
};

/**
 * Create a progress callback for upload/download operations
 * @param {Function} callback - The progress callback function
 * @returns {Function} - The formatted progress callback
 */
const createProgressCallback = (callback) => {
  return (bytesLoaded, bytesTotal) => {
    const progress = bytesTotal > 0 ? (bytesLoaded / bytesTotal) * 100 : 0;
    callback({
      progress: Math.round(progress),
      bytesLoaded,
      bytesTotal,
      isComplete: bytesLoaded >= bytesTotal
    });
  };
};

/**
 * Retry mechanism for IPFS operations
 * @param {Function} operation - The operation to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Delay between retries in milliseconds
 * @returns {Promise} - The operation result
 */
const retryOperation = async (operation, maxRetries = ipfsConfig.maxRetries, delay = ipfsConfig.retryDelay) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw new Error(`Operation failed after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
};

/**
 * Sanitize filename for IPFS
 * @param {string} filename - The original filename
 * @returns {string} - The sanitized filename
 */
const sanitizeFilename = (filename) => {
  // Remove or replace special characters that might cause issues
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 255); // Limit filename length
};

/**
 * Create a cache key for IPFS content
 * @param {string} hash - The IPFS hash
 * @param {string} type - The cache type (metadata, content, etc.)
 * @returns {string} - The cache key
 */
const createCacheKey = (hash, type = 'content') => {
  return `ipfs:${type}:${hash}`;
};

/**
 * Parse IPFS CID to extract information
 * @param {string} cid - The IPFS CID
 * @returns {Object} - Parsed CID information
 */
const parseCid = (cid) => {
  try {
    // Basic CID validation (can be enhanced with proper CID library)
    if (!cid || typeof cid !== 'string') {
      throw new Error('Invalid CID: must be a non-empty string');
    }
    
    // Remove any gateway URL prefix
    const hash = extractHashFromGatewayUrl(cid) || cid;
    
    // Basic format validation
    if (!/^[a-zA-Z0-9]{46,}$/.test(hash)) {
      throw new Error('Invalid CID format');
    }
    
    return {
      hash,
      isValid: true,
      version: hash.startsWith('Qm') ? 'v0' : 'v1',
      gatewayUrl: formatGatewayUrl(hash)
    };
  } catch (error) {
    return {
      hash: cid,
      isValid: false,
      error: error.message
    };
  }
};

/**
 * Create error object with IPFS-specific information
 * @param {string} message - The error message
 * @param {string} operation - The operation that failed
 * @param {Object} details - Additional error details
 * @returns {Error} - The formatted error
 */
const createIpfsError = (message, operation, details = {}) => {
  const error = new Error(message);
  error.operation = operation;
  error.details = details;
  error.isIpfsError = true;
  return error;
};

module.exports = {
  generateContentHash,
  formatFileSize,
  getMagicBytes,
  scanForMalware,
  validateFile,
  createMetadata,
  formatGatewayUrl,
  extractHashFromGatewayUrl,
  createProgressCallback,
  retryOperation,
  sanitizeFilename,
  createCacheKey,
  parseCid,
  createIpfsError
};
