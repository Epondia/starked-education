# Security Policy

The StarkEd team takes the security of the platform seriously. Because StarkEd handles
educational credentials and on-chain assets, we appreciate the work of security researchers
and the community in keeping our users safe.

## Supported Versions

StarkEd is currently in active alpha development. Security fixes are applied to the latest
release and the `main` branch.

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions,
or pull requests.**

Instead, report them privately through one of the following channels:

1. **Email:** `security@starked-education.org`
2. **GitHub Private Vulnerability Reporting:** Use the
   [Report a vulnerability](https://github.com/jobbykings/starked-education/security/advisories/new)
   button on the repository's Security tab.

### What to Include

To help us triage quickly, please include as much of the following as you can:

- A description of the vulnerability and its potential impact.
- The affected component (contracts, backend, frontend, or CI/CD) and version or commit.
- Step-by-step instructions to reproduce the issue.
- Proof-of-concept code or screenshots, if available.
- Any suggested remediation.

### Our Commitment

- We will acknowledge your report within **3 business days**.
- We will provide an initial assessment within **7 business days**.
- We will keep you informed of our progress toward a fix.
- We will credit you in the release notes once the issue is resolved, unless you prefer to
  remain anonymous.

## Disclosure Policy

We follow a **coordinated disclosure** process:

1. You report the vulnerability privately.
2. We confirm the issue and determine its severity.
3. We develop and test a fix.
4. We release the fix and publish a security advisory.
5. Public disclosure happens after a fix is available, typically within 90 days of the
   initial report.

Please give us a reasonable opportunity to address the issue before any public disclosure.

## Scope

The following are in scope for security reports:

- Smart contract logic in `contracts/`.
- Backend API and authentication in `backend/`.
- Frontend application and wallet integration in `frontend/`.
- CI/CD configuration and secrets handling in `.github/`.

The following are generally **out of scope**:

- Vulnerabilities in third-party dependencies that are already publicly disclosed (these
  are tracked via `npm audit` / `cargo audit`).
- Issues requiring physical access to a user's device.
- Social engineering of StarkEd staff or users.
- Denial-of-service attacks.

## Security Tooling

This repository runs automated security checks on every push and pull request:

- **CodeQL** static analysis (SAST) for JavaScript/TypeScript and Rust.
- **npm audit** and **cargo audit** dependency vulnerability scanning.
- **Gitleaks** secret scanning to prevent committed credentials.
- **Trivy** filesystem/dependency vulnerability scanning.
- **Dependency Review** on pull requests.

See [.github/workflows/security.yml](workflows/security.yml) and
[.github/workflows/ci.yml](workflows/ci.yml) for details.

## Best Practices for Contributors

- Never commit secrets, API keys, private keys, or `.env` files. Use `.env.example` for
  placeholders.
- Run `npm audit` (backend/frontend) and `cargo audit` (contracts) before opening a PR.
- Validate and sanitize all user input on the backend.
- Follow the principle of least privilege for credentials and access tokens.

Thank you for helping keep StarkEd and its users secure.
