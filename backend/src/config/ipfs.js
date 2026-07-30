const dotenv = require('dotenv');

dotenv.config();

const ipfsConfig = {
  // IPFS node configuration
  host: process.env.IPFS_HOST || 'localhost',
  port: process.env.IPFS_PORT || 5001,
  protocol: process.env.IPFS_PROTOCOL || 'http',
  
  // IPFS API configuration
  apiPath: process.env.IPFS_API_PATH || '/api/v0',
  
  // Gateway configuration
  gatewayUrl: process.env.IPFS_GATEWAY_URL || 'https://ipfs.io/ipfs/',
  
  // Upload configuration
  maxFileSize: parseInt(process.env.IPFS_MAX_FILE_SIZE) || 100 * 1024 * 1024, // 100MB
  chunkSize: parseInt(process.env.IPFS_CHUNK_SIZE) || 1024 * 1024, // 1MB chunks
  
  // Pinning configuration
  autoPin: process.env.IPFS_AUTO_PIN === 'true',
  pinTimeout: parseInt(process.env.IPFS_PIN_TIMEOUT) || 30000, // 30 seconds
  
  // Caching configuration
  enableCache: process.env.IPFS_ENABLE_CACHE === 'true',
  cacheTimeout: parseInt(process.env.IPFS_CACHE_TIMEOUT) || 3600000, // 1 hour
  
  // Retry configuration
  maxRetries: parseInt(process.env.IPFS_MAX_RETRIES) || 3,
  retryDelay: parseInt(process.env.IPFS_RETRY_DELAY) || 1000, // 1 second
  
  // Authentication configuration (if using IPFS Cluster or private gateway)
  auth: {
    enabled: process.env.IPFS_AUTH_ENABLED === 'true',
    username: process.env.IPFS_AUTH_USERNAME,
    password: process.env.IPFS_AUTH_PASSWORD,
    token: process.env.IPFS_AUTH_TOKEN
  },
  
  // Content types that are allowed for upload
  // Documented accepted file types: see /docs/ACCEPTED_FILE_TYPES.md
  allowedContentTypes: [
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'text/markdown',
    'application/rtf',
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
    // Video
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/mp4',
    'audio/flac',
    // Code & Data
    'application/json',
    'application/xml',
    'text/xml',
    'text/javascript',
    'text/html',
    'text/css',
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip'
  ],
  
  // Per-type maximum file sizes (bytes)
  // If a type is not listed here, the global maxFileSize applies
  typeSizeLimits: {
    'image/jpeg': 50 * 1024 * 1024,    // 50MB
    'image/png': 50 * 1024 * 1024,     // 50MB
    'image/gif': 30 * 1024 * 1024,     // 30MB
    'image/webp': 50 * 1024 * 1024,    // 50MB
    'image/svg+xml': 10 * 1024 * 1024, // 10MB
    'image/bmp': 50 * 1024 * 1024,     // 50MB
    'image/tiff': 100 * 1024 * 1024,   // 100MB
    'video/mp4': 500 * 1024 * 1024,    // 500MB
    'video/webm': 500 * 1024 * 1024,   // 500MB
    'video/ogg': 500 * 1024 * 1024,    // 500MB
    'video/quicktime': 500 * 1024 * 1024, // 500MB
    'audio/mpeg': 100 * 1024 * 1024,   // 100MB
    'audio/wav': 100 * 1024 * 1024,    // 100MB
    'audio/ogg': 100 * 1024 * 1024,    // 100MB
    'audio/mp4': 100 * 1024 * 1024,    // 100MB
    'audio/flac': 200 * 1024 * 1024,   // 200MB
    'application/pdf': 100 * 1024 * 1024, // 100MB
    'application/json': 50 * 1024 * 1024, // 50MB
    'application/zip': 200 * 1024 * 1024, // 200MB
    'application/x-rar-compressed': 200 * 1024 * 1024,
    'application/x-7z-compressed': 200 * 1024 * 1024,
    'application/x-tar': 200 * 1024 * 1024,
    'application/gzip': 200 * 1024 * 1024
  },
  
  // Malware / virus scanning configuration
  malwareScanning: {
    enabled: process.env.IPFS_MALWARE_SCAN_ENABLED === 'true',
    // Block list of known malicious file hashes (SHA-256)
    hashBlocklist: [
      // Add known malicious hashes here
      // Example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    ],
    // Block list of known malicious magic bytes / file signatures
    magicByteBlocklist: [
      // Executable files that could be disguised
      '4D5A',       // MZ - Windows/DOS executable
      '7F454C46'    // ELF - Linux executable
    ],
    // Dangerous file extensions that should never be accepted
    blockedExtensions: [
      '.exe', '.dll', '.so', '.dylib', '.sh', '.bash',
      '.bat', '.cmd', '.ps1', '.vbs', '.scr', '.msi',
      '.com', '.pif', '.reg', '.app', '.jar', '.war'
    ]
  },
  
  // Admin bypass configuration
  adminBypassValidation: process.env.IPFS_ADMIN_BYPASS !== 'false', // Default: enabled
  
  // Metadata configuration
  metadata: {
    includeTimestamp: process.env.IPFS_INCLUDE_TIMESTAMP !== 'false',
    includeUploader: process.env.IPFS_INCLUDE_UPLOADER === 'true',
    includeContentType: process.env.IPFS_INCLUDE_CONTENT_TYPE !== 'false',
    includeFileSize: process.env.IPFS_INCLUDE_FILE_SIZE !== 'false'
  }
};

// Validate required configuration
const validateConfig = () => {
  const errors = [];
  
  if (ipfsConfig.auth.enabled && !ipfsConfig.auth.username && !ipfsConfig.auth.token) {
    errors.push('IPFS authentication is enabled but no credentials provided');
  }
  
  if (ipfsConfig.maxFileSize <= 0) {
    errors.push('IPFS max file size must be greater than 0');
  }
  
  if (ipfsConfig.chunkSize <= 0) {
    errors.push('IPFS chunk size must be greater than 0');
  }
  
  if (errors.length > 0) {
    throw new Error(`IPFS configuration validation failed: ${errors.join(', ')}`);
  }
  
  return true;
};

// Get IPFS client configuration
const getClientConfig = () => {
  const config = {
    host: ipfsConfig.host,
    port: ipfsConfig.port,
    protocol: ipfsConfig.protocol,
    apiPath: ipfsConfig.apiPath,
    timeout: ipfsConfig.pinTimeout
  };
  
  // Add authentication if enabled
  if (ipfsConfig.auth.enabled && ipfsConfig.auth.username) {
    config.headers = {
      'Authorization': `Basic ${Buffer.from(`${ipfsConfig.auth.username}:${ipfsConfig.auth.password}`).toString('base64')}`
    };
  } else if (ipfsConfig.auth.enabled && ipfsConfig.auth.token) {
    config.headers = {
      'Authorization': `Bearer ${ipfsConfig.auth.token}`
    };
  }
  
  return config;
};

module.exports = {
  ipfsConfig,
  validateConfig,
  getClientConfig
};
