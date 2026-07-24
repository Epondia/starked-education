const {
  buildPolicy,
  contentSecurityPolicy,
  cspViolationReporter,
} = require('../src/middleware/contentSecurityPolicy');

describe('contentSecurityPolicy', () => {
  test('builds a nonce-based policy with Stellar and IPFS allowlists', () => {
    const policy = buildPolicy('test-nonce');

    expect(policy).toContain("script-src 'self' 'nonce-test-nonce'");
    expect(policy).toContain('connect-src');
    expect(policy).toContain('https://*.stellar.org');
    expect(policy).toContain('https://ipfs.io');
    expect(policy).toContain('report-uri /api/v1/security/csp-report');
    expect(policy).toContain("object-src 'none'");
  });

  test('uses report-only mode by default and generates unique nonces', () => {
    const middleware = contentSecurityPolicy({ reportOnly: true });
    const responses = [createResponse(), createResponse()];

    middleware({}, responses[0], jest.fn());
    middleware({}, responses[1], jest.fn());

    expect(responses[0].setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy-Report-Only',
      expect.stringContaining(`'nonce-${responses[0].locals.cspNonce}'`),
    );
    expect(responses[0].removeHeader).toHaveBeenCalledWith('Content-Security-Policy');
    expect(responses[0].locals.cspNonce).not.toBe(responses[1].locals.cspNonce);
  });

  test('can switch to an enforced policy', () => {
    const response = createResponse();
    contentSecurityPolicy({ reportOnly: false })({}, response, jest.fn());

    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.any(String),
    );
    expect(response.removeHeader).not.toHaveBeenCalled();
  });

  test('reports only bounded violation metadata', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});

    cspViolationReporter({
      body: {
        'csp-report': {
          'blocked-uri': 'https://bad.example/script.js?token=secret#fragment',
          'effective-directive': 'script-src-elem',
          secret: 'must-not-be-logged',
        },
      },
    }, response);

    expect(warning).toHaveBeenCalledWith('CSP violation', {
      blockedUri: 'https://bad.example/script.js',
      documentUri: undefined,
      effectiveDirective: 'script-src-elem',
      sourceFile: undefined,
      statusCode: undefined,
    });
    expect(response.status).toHaveBeenCalledWith(204);
    expect(response.end).toHaveBeenCalled();
  });

  test('normalizes modern Reporting API arrays', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});

    cspViolationReporter({
      body: [{
        type: 'csp-violation',
        body: {
          blockedURL: 'https://bad.example/a.js',
          effectiveDirective: 'script-src-elem',
        },
      }],
    }, response);

    expect(warning).toHaveBeenCalledWith('CSP violation', expect.objectContaining({
      blockedUri: 'https://bad.example/a.js',
      effectiveDirective: 'script-src-elem',
    }));
  });

  test('removes credentials and opaque payloads from violation URLs', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});

    cspViolationReporter({
      body: [{
        body: {
          blockedURL: 'data:text/plain,secret',
          documentURL: 'https://user:password@example.test/path?token=secret#fragment',
          statusCode: { secret: 'must-not-be-logged' },
        },
      }],
    }, response);

    expect(warning).toHaveBeenCalledWith('CSP violation', expect.objectContaining({
      blockedUri: 'data:',
      documentUri: 'https://example.test/path',
      statusCode: undefined,
    }));
  });

  test('accepts only valid integer HTTP status codes', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});

    cspViolationReporter({ body: { 'csp-report': { 'status-code': 404 } } }, response);

    expect(warning).toHaveBeenCalledWith('CSP violation', expect.objectContaining({
      statusCode: 404,
    }));
  });
});

function createResponse() {
  return {
    locals: {},
    removeHeader: jest.fn(),
    setHeader: jest.fn(),
  };
}
