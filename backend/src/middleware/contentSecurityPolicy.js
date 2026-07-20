// eslint-disable-next-line @typescript-eslint/no-var-requires
const crypto = require('crypto');

const DEFAULT_REPORT_URI = '/api/v1/security/csp-report';

const DIRECTIVES = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'connect-src': [
    "'self'",
    'https://*.stellar.org',
    'https://*.stellar.expert',
    'https://ipfs.io',
    'https://*.ipfs.io',
  ],
  'font-src': ["'self'", 'data:'],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'frame-src': ["'none'"],
  'img-src': ["'self'", 'data:', 'blob:', 'https://ipfs.io', 'https://*.ipfs.io'],
  'object-src': ["'none'"],
  'style-src': ["'self'"],
};

function buildPolicy(nonce, reportUri = DEFAULT_REPORT_URI) {
  const directives = {
    ...DIRECTIVES,
    'script-src': ["'self'", `'nonce-${nonce}'`],
    'report-uri': [reportUri],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

function contentSecurityPolicy(options = {}) {
  const reportOnly = options.reportOnly ?? process.env.CSP_REPORT_ONLY !== 'false';
  const reportUri = options.reportUri || DEFAULT_REPORT_URI;

  return (_req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;
    res.setHeader(
      reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
      buildPolicy(nonce, reportUri),
    );
    next();
  };
}

function sanitizeTelemetry(value) {
  if (typeof value !== 'string') return undefined;

  const withoutControls = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint > 31 && codePoint !== 127;
    })
    .join('');
  try {
    const url = new URL(withoutControls);
    if (!['http:', 'https:'].includes(url.protocol)) return url.protocol;

    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().slice(0, 512);
  } catch {
    return withoutControls.slice(0, 512);
  }
}

function sanitizeStatusCode(value) {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
}

function normalizeReports(payload) {
  const reports = Array.isArray(payload) ? payload : [payload];
  return reports
    .filter((report) => report && typeof report === 'object')
    .map((report) => report['csp-report'] || report.body || report);
}

function cspViolationReporter(req, res) {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  normalizeReports(payload).forEach((report) => {
    const safeReport = {
      blockedUri: sanitizeTelemetry(report['blocked-uri'] || report.blockedURL),
      documentUri: sanitizeTelemetry(report['document-uri'] || report.documentURL),
      effectiveDirective: sanitizeTelemetry(
        report['effective-directive'] || report.effectiveDirective,
      ),
      sourceFile: sanitizeTelemetry(report['source-file'] || report.sourceFile),
      statusCode: sanitizeStatusCode(report['status-code'] ?? report.statusCode),
    };

    console.warn('CSP violation', safeReport);
  });
  res.status(204).end();
}

module.exports = {
  DEFAULT_REPORT_URI,
  buildPolicy,
  contentSecurityPolicy,
  cspViolationReporter,
  normalizeReports,
  sanitizeStatusCode,
  sanitizeTelemetry,
};
