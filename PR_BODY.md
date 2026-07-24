## [Backend] Implement comprehensive API documentation with OpenAPI/Swagger

**Closes #173**

### Summary

This PR implements comprehensive OpenAPI 3.0 specification and Swagger UI for all backend API endpoints, addressing issue #173.

### Changes Made

#### 1. OpenAPI Specification (`backend/src/config/swagger.js`)
- Created a comprehensive OpenAPI 3.0 specification file documenting **265 API paths**, **94 request/response schemas**, across **30 tagged endpoint groups**
- All major API modules documented with detailed schemas, parameters, and responses:
  - Authentication (register, login, profile, role management)
  - Health (liveness, readiness, comprehensive health check)
  - Users (profile, settings, achievements, stats)
  - Content (IPFS upload, retrieve, pin, cache management)
  - Courses (version control, comparison, export, statistics)
  - Quizzes (CRUD, submission, grading, statistics)
  - Enrollments (enroll, progress, waitlist, analytics, certificates)
  - Payments (intent, Stellar, refunds, webhooks, exchange rates)
  - Search (query, suggestions, voice, recommendations, trending)
  - Notifications (list, mark read, preferences)
  - Smart Wallet (create, execute, recovery, multisig, session keys)
  - Federated Learning (sessions, participants, rounds, models, privacy)
  - Swarm Learning (initialize, swarms, agents, tasks, analytics)
  - AGI Tutor (sessions, assessments, guidance, recommendations)
  - Time-Lock Credentials (issue, release, revoke, schedule, audit)
  - VRF (randomness, commit-reveal, beacon, stats)
  - Translation (text, batch, subtitles, correction, quality)
  - Cross-Protocol Bridge (send, proof, gas cost, stats)
  - Admin (dashboard, logs, reports, settings, backup, announcements)
  - ACO (learning paths, resources, replanning, swarm, analytics)
  - Assignments (CRUD, submissions, grading, bulk, progress)
  - RBAC, Gamification, Autonomous Agents, Holographic, Secure Communication

#### 2. Authentication Scheme
- JWT Bearer token authentication documented as `BearerAuth` security scheme
- API Key authentication documented as `ApiKeyAuth`
- Applied to all protected endpoints with appropriate security requirements

#### 3. Swagger UI Integration (`backend/src/index.js`)
- Swagger UI mounted at `/api-docs` with interactive documentation browser
- Raw OpenAPI spec served as JSON at `/api-docs.json`
- Features: authorization persistence, request duration display, endpoint filtering

#### 4. Frontend Type Generation (`frontend/package.json`)
- Added `generate-api-types` script to auto-generate TypeScript types from the OpenAPI spec
- Added `generate-api-types:local` script for offline/cached generation
- Installed `openapi-typescript` dev dependency

#### 5. Documentation Strategy
- Added comprehensive strategy comment explaining how to keep docs in sync with code
- Centralized spec mirrors actual route structure for maintainability

### Dependencies Added
- `swagger-jsdoc` (^6.3.0) - OpenAPI spec generation
- `swagger-ui-express` (^5.0.1) - Swagger UI serving
- `openapi-typescript` (^7.13.0, frontend devDep) - Type generation

### How to Test

1. Start the backend: `cd backend && npm run dev`
2. Visit http://localhost:3001/api-docs to see the interactive Swagger UI
3. Try out endpoints using the "Try it out" feature with JWT authentication
4. Generate frontend types: `cd frontend && npm run generate-api-types`

### Checklist
- [x] All API endpoints documented with request/response schemas
- [x] Authentication scheme (JWT Bearer) documented
- [x] Swagger UI available at `/api-docs`
- [x] Frontend type generation scripts added
- [x] Documentation strategy documented for code sync
