# Content Security Policy

The main backend emits a nonce-based Content Security Policy on every response. It
starts in report-only mode so violations can be observed before enforcement.

## Configuration

- `CSP_REPORT_ONLY` defaults to report-only mode. Set it to `false` after reviewing
  violation reports to emit the enforced `Content-Security-Policy` header.
- Violation reports are accepted at `POST /api/v1/security/csp-report` with a 16 KB
  request-body limit. Both legacy CSP reports and Reporting API arrays are accepted.
  The endpoint logs only bounded metadata after removing URL queries, fragments, and
  control characters; arbitrary report fields are discarded.

The default policy permits same-origin resources and the backend's required Stellar
and public IPFS network connections. Add a domain only to the most specific directive
that requires it. Do not add `unsafe-inline` or `unsafe-eval`; render server-generated
inline scripts with the per-request nonce exposed as `res.locals.cspNonce`.

Before switching to enforcement, review violation telemetry in each deployed
environment and confirm every required origin is represented by a narrow allowlist.
