# StarkEd API Reference

## Table of Contents

- [Overview](#overview)
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Error Codes](#error-codes)
- [Health](#health)
- [Auth](#auth)
- [Content (IPFS)](#content-ipfs)
- [Courses & Versions](#courses--versions)
- [Enrollments](#enrollments)
- [Payments](#payments)
- [Quizzes](#quizzes)
- [Assignments](#assignments)
- [Analytics](#analytics)
- [Search](#search)
- [Gamification](#gamification)
- [Notifications](#notifications)
- [Time-Lock Credentials](#time-lock-credentials)
- [VRF (Verifiable Random Function)](#vrf-verifiable-random-function)
- [Holographic Storage](#holographic-storage)

---

## Overview

StarkEd is a decentralized education platform powered by the Stellar blockchain. This document covers every REST endpoint exposed by the backend API.

All endpoints are versioned. The current stable version is **v1**.

---

## Base URL

```
https://<your-domain>/api/v1
```

For local development the default port is `3001`:

```
http://localhost:3001/api/v1
```

The root path returns basic service information without authentication:

```
GET /
```

**Response `200`**
```json
{
  "message": "StarkEd Education Backend API",
  "version": "1.0.0",
  "status": "running",
  "timestamp": "2026-07-18T08:00:00.000Z"
}
```

---

## Authentication

Protected endpoints require a JSON Web Token (JWT) passed in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are issued by the `/api/v1/auth/login` and `/api/v1/auth/register` endpoints and expire after **24 hours**.

### Roles

| Role | Description |
|------|-------------|
| `student` | Default role — can enroll in courses and take quizzes |
| `educator` | Can create courses, manage enrollments, and issue certificates |
| `admin` | Full access including user management, system settings, and emergency operations |

### JWT Payload

```json
{
  "id": "user_id",
  "username": "john_doe",
  "email": "john@example.com",
  "role": "student",
  "address": "GSTELLARADDRESS..."
}
```

---

## Rate Limiting

Rate limits are applied per IP address. Exceeding the limit returns `429 Too Many Requests`.

| Tier | Limit | Window | Used on |
|------|-------|--------|---------|
| Strict (auth) | 5 req | 1 min | Login, register |
| Moderate (write) | 30 req | 1 min | Create/update operations |
| Liberal (read) | 100 req | 1 min | Read/list operations |
| Payment | 20 req | 15 min | Payment operations |
| Refund | 5 req | 1 hour | Refund operations |
| Enrollment | 10 req | 15 min | Enrollment creation |

**Rate Limit Headers**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1721296800
```

**Error Response `429`**
```json
{
  "error": "Too many requests from this IP, please try again later.",
  "retryAfter": 60
}
```

---

## Error Codes

All error responses follow a consistent structure:

```json
{
  "success": false,
  "error": "Short error code",
  "message": "Human-readable description"
}
```

| HTTP Status | Meaning |
|-------------|---------|
| `400` | Bad Request — validation failed or invalid parameters |
| `401` | Unauthorized — missing or invalid token |
| `403` | Forbidden — authenticated but insufficient permissions |
| `404` | Not Found — resource does not exist |
| `409` | Conflict — resource already exists (e.g., duplicate user) |
| `429` | Too Many Requests — rate limit exceeded |
| `500` | Internal Server Error — unexpected server failure |
| `503` | Service Unavailable — dependency (DB, IPFS, Stellar) is down |

---

## Health

Health endpoints are mounted at `/health` (no `/api/v1` prefix) so load balancers can reach them without credentials.

### GET /health/live

**Authentication:** None  
**Rate limit:** None

Liveness probe — confirms the process is alive. Always returns `200`.

**cURL**
```bash
curl https://api.starked.edu/health/live
```

**Response `200`**
```json
{
  "status": "ok",
  "uptime": 3600.5,
  "timestamp": "2026-07-18T08:00:00.000Z"
}
```

---

### GET /health/ready

**Authentication:** None  
**Rate limit:** None

Readiness probe — checks all critical dependencies. Returns `503` if any dependency is unhealthy.

**cURL**
```bash
curl https://api.starked.edu/health/ready
```

**Response `200`**
```json
{
  "status": "ready"
}
```

**Response `503`**
```json
{
  "status": "not_ready",
  "dependencies": {
    "postgres": { "status": "unhealthy" },
    "redis": { "status": "healthy" },
    "stellar": { "status": "healthy" },
    "ipfs": { "status": "healthy" },
    "elasticsearch": { "status": "healthy" }
  }
}
```

---

### GET /health

**Authentication:** None  
**Rate limit:** None

Full health report for monitoring dashboards. Always returns `200`. Use `status` field to determine overall health.

**cURL**
```bash
curl https://api.starked.edu/health
```

**Response `200`**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 3600.5,
  "timestamp": "2026-07-18T08:00:00.000Z",
  "memory": {
    "heapUsed": 52428800,
    "heapTotal": 67108864,
    "rss": 83886080
  },
  "dependencies": {
    "postgres": { "status": "healthy", "latencyMs": 4 },
    "redis": { "status": "healthy", "latencyMs": 1 },
    "stellar": { "status": "healthy", "latencyMs": 120 },
    "ipfs": { "status": "healthy", "latencyMs": 15 },
    "elasticsearch": { "status": "healthy", "latencyMs": 8 }
  }
}
```

---

## Auth

Base path: `/api/v1/auth`

### POST /auth/register

Register a new user account.

**Authentication:** None  
**Rate limit:** Strict (5/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | Yes | 3–50 characters |
| `email` | string | Yes | Valid email address |
| `password` | string | Yes | 8–128 characters |
| `role` | string | No | `student` (default), `educator`, or `admin` |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "alice",
    "email": "alice@example.com",
    "password": "securePassword123"
  }'
```

**JavaScript**
```javascript
const response = await fetch('/api/v1/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'alice',
    email: 'alice@example.com',
    password: 'securePassword123'
  })
});
const data = await response.json();
```

**Response `201`**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "1721296800000",
    "username": "alice",
    "email": "alice@example.com",
    "role": "student",
    "createdAt": "2026-07-18T08:00:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error `409`** — Username or email already taken
```json
{
  "success": false,
  "error": "User already exists",
  "message": "A user with this username or email already exists"
}
```

---

### POST /auth/login

Authenticate with username/email and password.

**Authentication:** None  
**Rate limit:** Strict (5/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | Yes | Username or email address |
| `password` | string | Yes | Account password |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "securePassword123"}'
```

**JavaScript**
```javascript
const response = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'alice', password: 'securePassword123' })
});
const { token, user } = await response.json();
```

**Response `200`**
```json
{
  "message": "Login successful",
  "user": {
    "id": "1721296800000",
    "username": "alice",
    "email": "alice@example.com",
    "role": "student"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error `401`**
```json
{
  "error": "Invalid credentials",
  "message": "Invalid username or password"
}
```

---

### GET /auth/profile

Get the authenticated user's profile.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/auth/profile \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "user": {
    "id": "1721296800000",
    "username": "alice",
    "email": "alice@example.com",
    "role": "student",
    "createdAt": "2026-07-18T08:00:00.000Z",
    "updatedAt": "2026-07-18T08:00:00.000Z"
  }
}
```

---

### PUT /auth/profile

Update the authenticated user's profile or password.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body** (at least one field required)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | No | New username (3–50 chars) |
| `email` | string | No | New email address |
| `currentPassword` | string | Conditional | Required when changing password |
| `newPassword` | string | No | New password (8–128 chars) |

**cURL**
```bash
curl -X PUT https://api.starked.edu/api/v1/auth/profile \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"username": "alice_updated"}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/auth/profile', {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'alice_updated' })
});
const { user } = await res.json();
```

**Response `200`**
```json
{
  "message": "Profile updated successfully",
  "user": {
    "id": "1721296800000",
    "username": "alice_updated",
    "email": "alice@example.com",
    "role": "student",
    "updatedAt": "2026-07-18T09:00:00.000Z"
  }
}
```

---

### PUT /auth/assign-role/:userId

Assign a role to a user. Admin only.

**Authentication:** Required (admin)  
**Rate limit:** Moderate (30/min)

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | ID of the target user |

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `role` | string | Yes | `student`, `educator`, or `admin` |

**cURL**
```bash
curl -X PUT https://api.starked.edu/api/v1/auth/assign-role/1721296800000 \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"role": "educator"}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/auth/assign-role/${userId}`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ role: 'educator' })
});
const { user } = await res.json();
```

**Response `200`**
```json
{
  "message": "Role assigned successfully",
  "user": {
    "id": "1721296800000",
    "username": "alice",
    "email": "alice@example.com",
    "oldRole": "student",
    "newRole": "educator",
    "updatedAt": "2026-07-18T09:00:00.000Z"
  }
}
```

---

### GET /auth/users

List all users with optional role filtering and pagination. Admin only.

**Authentication:** Required (admin)  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number |
| `limit` | integer | `10` | Results per page |
| `role` | string | — | Filter by role |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/auth/users?page=1&limit=20&role=educator" \
  -H "Authorization: Bearer <admin-token>"
```

**Response `200`**
```json
{
  "users": [
    {
      "id": "1721296800000",
      "username": "alice",
      "email": "alice@example.com",
      "role": "educator",
      "createdAt": "2026-07-18T08:00:00.000Z",
      "updatedAt": "2026-07-18T09:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "pages": 1
  }
}
```

---

### DELETE /auth/users/:userId

Delete a user account. Admin only. Admins cannot delete their own account.

**Authentication:** Required (admin)  
**Rate limit:** Moderate (30/min)

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | ID of the user to delete |

**cURL**
```bash
curl -X DELETE https://api.starked.edu/api/v1/auth/users/1721296800000 \
  -H "Authorization: Bearer <admin-token>"
```

**Response `200`**
```json
{
  "message": "User deleted successfully",
  "deletedUser": {
    "id": "1721296800000",
    "username": "alice",
    "email": "alice@example.com",
    "role": "educator"
  }
}
```

---

## Content (IPFS)

Base path: `/api/v1/content`

Manages file uploads, retrieval, and pinning on the IPFS network.

### POST /content/upload

Upload a single file to IPFS.

**Authentication:** Required (permission: `CONTENT_CREATE`)  
**Rate limit:** Moderate (30/min)  
**Content-Type:** `multipart/form-data`

**Form Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | File to upload (max 100 MB) |
| `metadata` | JSON string | No | Custom metadata object |
| `includeMetadata` | `"true"` / `"false"` | No | Include metadata CID in response (default `true`) |
| `wrapWithDirectory` | `"true"` / `"false"` | No | Wrap file in IPFS directory |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/content/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/lecture.pdf" \
  -F 'metadata={"course":"math101","title":"Lecture 1"}'
```

**JavaScript**
```javascript
const form = new FormData();
form.append('file', fileBlob, 'lecture.pdf');
form.append('metadata', JSON.stringify({ course: 'math101' }));

const response = await fetch('/api/v1/content/upload', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: form
});
const { data } = await response.json();
console.log(data.cid); // QmXyz...
```

**Response `201`**
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "cid": "QmXyz1234abcd...",
    "metadataCid": "QmMeta5678efgh...",
    "metadata": { "course": "math101", "title": "Lecture 1" },
    "size": 204800,
    "gatewayUrl": "https://ipfs.io/ipfs/QmXyz1234abcd..."
  }
}
```

---

### POST /content/upload/batch

Upload up to 10 files at once to IPFS.

**Authentication:** Required (permission: `CONTENT_CREATE`)  
**Rate limit:** Moderate (30/min)  
**Content-Type:** `multipart/form-data`

**Form Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `files` | file[] | Yes | Files to upload (max 10 files, 100 MB each) |
| `metadata` | JSON string | No | Shared metadata for all files |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/content/upload/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@/path/to/file1.pdf" \
  -F "files=@/path/to/file2.mp4"
```


**JavaScript**
```javascript
const form = new FormData();
files.forEach(f => form.append('files', f));
const res = await fetch('/api/v1/content/upload/batch', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: form
});
const { data } = await res.json();
```

**Response `201`**
```json
{
  "success": true,
  "message": "Uploaded 2 of 2 files successfully",
  "data": {
    "results": [
      { "success": true, "cid": "QmFile1...", "size": 102400 },
      { "success": true, "cid": "QmFile2...", "size": 512000 }
    ],
    "summary": { "total": 2, "successful": 2, "failed": 0 }
  }
}
```

---

### GET /content/:cid

Retrieve content from IPFS by CID.

**Authentication:** Required (permission: `CONTENT_READ`)  
**Rate limit:** Liberal (100/min)

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `cid` | string | IPFS Content Identifier |

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `buffer` | Response format: `buffer`, `base64`, or `stream` |
| `bypassCache` | boolean | `false` | Skip in-memory cache |

**cURL**
```bash
# Download as file
curl "https://api.starked.edu/api/v1/content/QmXyz1234abcd" \
  -H "Authorization: Bearer <token>" \
  --output lecture.pdf

# Get as base64
curl "https://api.starked.edu/api/v1/content/QmXyz1234abcd?format=base64" \
  -H "Authorization: Bearer <token>"
```

**Response `200` (base64 format)**
```json
{
  "success": true,
  "data": {
    "cid": "QmXyz1234abcd...",
    "content": "JVBERi0xLjQKJ...",
    "size": 204800
  }
}
```

For `buffer` and `stream` formats the response body is the raw binary with headers:
```
Content-Type: application/octet-stream
X-IPFS-CID: QmXyz1234abcd...
```

---

### GET /content/:cid/metadata

Retrieve metadata stored alongside IPFS content.

**Authentication:** Required (permission: `CONTENT_READ`)  
**Rate limit:** Liberal (100/min)

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `cid` | string | IPFS CID of the content |

**Query Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `metadataCid` | string | Yes | IPFS CID of the metadata file |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/content/QmXyz.../metadata?metadataCid=QmMeta..." \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "cid": "QmXyz1234abcd...",
    "metadataCid": "QmMeta5678efgh...",
    "metadata": {
      "course": "math101",
      "title": "Lecture 1",
      "uploadedAt": "2026-07-18T08:00:00.000Z"
    }
  }
}
```

---

### POST /content/:cid/pin

Pin content to IPFS to prevent garbage collection.

**Authentication:** Required (permission: `COURSE_UPDATE`)  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/content/QmXyz1234abcd/pin \
  -H "Authorization: Bearer <token>"
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/content/${cid}/pin`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "message": "Content pinned successfully",
  "data": { "cid": "QmXyz1234abcd...", "pinned": true }
}
```

---

### DELETE /content/:cid/pin

Unpin content from IPFS.

**Authentication:** Required (permission: `COURSE_UPDATE`)  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X DELETE https://api.starked.edu/api/v1/content/QmXyz1234abcd/pin \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "message": "Content unpinned successfully",
  "data": { "cid": "QmXyz1234abcd...", "pinned": false }
}
```

---

### GET /content/node/info

Get IPFS node information. Requires system management permission.

**Authentication:** Required (permission: `SYSTEM_MANAGE`)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/content/node/info \
  -H "Authorization: Bearer <admin-token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "QmNodeId...",
    "version": { "version": "0.14.0", "commit": "abc123" },
    "addresses": ["/ip4/127.0.0.1/tcp/4001"]
  }
}
```

---

### GET /content/cache/stats

Get in-memory content cache statistics.

**Authentication:** Required (permission: `ANALYTICS_READ`)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/content/cache/stats \\
  -H "Authorization: Bearer <admin-token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "size": 42,
    "maxSize": 100,
    "hitRate": 0.87,
    "missRate": 0.13
  }
}
```

---

### DELETE /content/cache

Clear the in-memory content cache.

**Authentication:** Required (permission: `SYSTEM_MANAGE`)  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X DELETE https://api.starked.edu/api/v1/content/cache \\
  -H "Authorization: Bearer <admin-token>"
```

**Response `200`**
```json
{
  "success": true,
  "message": "Cache cleared successfully"
}
```

---

### GET /content/health

**Authentication:** None  
**Rate limit:** Liberal (100/min)

Check IPFS service health.

**cURL**
```bash
curl https://api.starked.edu/api/v1/content/health
```

**Response `200`**
```json
{
  "success": true,
  "status": "healthy",
  "data": {
    "ipfs": { "connected": true, "version": "0.14.0" },
    "cache": { "enabled": true, "size": 42, "maxSize": 100 }
  }
}
```

**Response `503`** — IPFS unavailable
```json
{
  "success": false,
  "status": "unhealthy",
  "message": "IPFS service is not available"
}
```

---

## Courses & Versions

Base path: `/api/v1/courses`

Manages course content versioning with full history, comparison, and restore capabilities.

### POST /courses/:contentId/versions

Create a new version of course content.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `contentId` | string | Course content identifier |

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Version title (3–200 chars) |
| `description` | string | Yes | Version description (10–1000 chars) |
| `content` | object | Yes | Course content structure |
| `changes` | string[] | Yes | List of changes (at least one, each 5–500 chars) |
| `createdBy` | string | Yes | User ID of the author |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/courses/content_123/versions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Module 1",
    "description": "Added new practice exercises",
    "content": { "sections": [{ "id": "s1", "type": "video", "url": "QmXyz..." }] },
    "changes": ["Added 3 practice exercises", "Fixed typo in intro"],
    "createdBy": "user_456"
  }'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/courses/${contentId}/versions`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title, description, content, changes, createdBy })
});
const { data } = await res.json();
```

**Response `201`**
```json
{
  "success": true,
  "message": "Version created successfully",
  "data": {
    "id": "ver_1721296800000",
    "contentId": "content_123",
    "version": 2,
    "title": "Updated Module 1",
    "description": "Added new practice exercises",
    "content": { "sections": [] },
    "changes": ["Added 3 practice exercises", "Fixed typo in intro"],
    "createdBy": "user_456",
    "createdAt": "2026-07-18T08:00:00.000Z",
    "isCurrent": true
  }
}
```

---

### GET /courses/:contentId/versions

Get the full version history for a piece of course content.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number |
| `limit` | integer | `10` | Results per page |
| `sortBy` | string | `version` | Sort field |
| `sortOrder` | string | `desc` | `asc` or `desc` |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/courses/content_123/versions?page=1&limit=10" \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "message": "Version history retrieved successfully",
  "data": {
    "versions": [
      {
        "id": "ver_2",
        "contentId": "content_123",
        "version": 2,
        "title": "Updated Module 1",
        "isCurrent": true,
        "createdBy": "user_456",
        "createdAt": "2026-07-18T08:00:00.000Z"
      }
    ],
    "total": 2,
    "page": 1,
    "limit": 10,
    "hasMore": false
  }
}
```

---

### GET /courses/:contentId/versions/current

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

Get the currently active version of course content.

**cURL**
```bash
curl https://api.starked.edu/api/v1/courses/content_123/versions/current \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "message": "Current version retrieved successfully",
  "data": {
    "id": "ver_2",
    "contentId": "content_123",
    "version": 2,
    "title": "Updated Module 1",
    "isCurrent": true
  }
}
```

---

### GET /courses/:contentId/versions/:versionNumber

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

Get a specific version by its sequential version number.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `contentId` | string | Course content identifier |
| `versionNumber` | integer | Version number (≥ 1) |

**cURL**
```bash
curl https://api.starked.edu/api/v1/courses/content_123/versions/1 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "ver_1",
    "contentId": "content_123",
    "version": 1,
    "title": "Version 1",
    "isCurrent": false
  }
}
```

---

### POST /courses/versions/compare/:v1/:v2

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

Compare two versions and return a diff summary.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `v1` | string | First version ID |
| `v2` | string | Second version ID |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/courses/versions/compare/ver_1/ver_2 \
  -H "Authorization: Bearer <token>"
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/courses/versions/compare/${v1Id}/${v2Id}`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "version1": { "id": "ver_1", "title": "Original" },
    "version2": { "id": "ver_2", "title": "Updated" },
    "differences": [
      { "field": "title", "oldValue": "Original", "newValue": "Updated", "changeType": "modified" }
    ],
    "summary": { "totalChanges": 1, "additions": 0, "modifications": 1, "removals": 0 }
  }
}
```

---

### POST /courses/:contentId/versions/restore

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

Restore content to a specific previous version. Creates a new version record for the restore.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `versionId` | string | Yes | Version ID to restore |
| `restoreReason` | string | No | Reason for restoring (5–500 chars) |
| `restoredBy` | string | Yes | User ID performing the restore |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/courses/content_123/versions/restore \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"versionId": "ver_1", "restoredBy": "user_456", "restoreReason": "Reverting breaking change"}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/courses/${contentId}/versions/restore`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ versionId: 'ver_1', restoredBy: 'user_456' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": { "id": "content_123", "currentVersion": 3, "restoredFrom": "ver_1" },
  "message": "Content restored successfully"
}
```

---

### PUT /courses/:contentId/versions/settings

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

Update version control settings for a piece of content.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `autoVersioning` | boolean | No | Automatically create versions on save |
| `maxVersions` | integer | No | Maximum versions to retain (0 = unlimited) |

**cURL**
```bash
curl -X PUT https://api.starked.edu/api/v1/courses/content_123/versions/settings \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"autoVersioning": true, "maxVersions": 20}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/courses/${contentId}/versions/settings`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ autoVersioning: true, maxVersions: 20 })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": { "contentId": "content_123", "autoVersioning": true, "maxVersions": 20 }
}
```

---

### GET /courses/:contentId/versions/export

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

Export the full version history as a file.

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `json` | Export format: `json` or `csv` |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/courses/content_123/versions/export?format=csv" \
  -H "Authorization: Bearer <token>" \
  --output versions.csv
```

Response headers include `Content-Disposition: attachment; filename="versions_content_123.json"`.

**Response `200`** — File download.
```
Content-Type: application/json
Content-Disposition: attachment; filename="versions_content_123.json"
```

---

### GET /courses/:contentId/versions/statistics

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

Get version activity statistics for a piece of content.

**cURL**
```bash
curl https://api.starked.edu/api/v1/courses/content_123/versions/statistics \\
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "totalVersions": 5,
    "currentVersion": 5,
    "lastUpdate": "2026-07-18T08:00:00.000Z",
    "versionsByCreator": { "user_123": 3, "user_456": 2 },
    "averageVersionsPerMonth": 2.5,
    "recentActivity": [
      { "version": 5, "createdAt": "2026-07-18T08:00:00.000Z", "changes": ["Bug fix"] }
    ]
  }
}
```

---

## Enrollments

Base path: `/api/v1/enrollments`

All enrollment endpoints require a valid JWT token.

### GET /enrollments

Get the authenticated user's enrollments with optional filtering and pagination.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (`active`, `completed`, `cancelled`) |
| `page` | integer | Page number (default `1`) |
| `limit` | integer | Results per page (default `10`) |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/enrollments?status=active" \
  -H "Authorization: Bearer <token>"
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/enrollments?status=active', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "enrollments": [
      { "id": "enr_001", "courseId": "course_123", "status": "active", "progress": 45 }
    ],
    "pagination": { "page": 1, "limit": 10, "total": 1 }
  }
}
```

---

### POST /enrollments

Enroll in a course.

**Authentication:** Required  
**Rate limit:** Enrollment limiter (10/15min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `courseId` | string | Yes | Course to enroll in |
| `paymentId` | string | No | Payment reference for paid courses |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/enrollments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"courseId": "course_123"}'
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/enrollments', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ courseId: 'course_123' })
});
const { data } = await res.json();
```

**Response `201`**
```json
{
  "success": true,
  "data": {
    "id": "enr_001",
    "courseId": "course_123",
    "userId": "user_456",
    "status": "active",
    "enrolledAt": "2026-07-18T08:00:00.000Z"
  }
}
```

---

### GET /enrollments/:id

Get details for a specific enrollment.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/enrollments/enr_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "enr_001",
    "courseId": "course_123",
    "userId": "user_456",
    "status": "active",
    "progress": 45,
    "enrolledAt": "2026-07-18T08:00:00.000Z"
  }
}
```

**Error `404`**
```json
{ "success": false, "message": "Enrollment not found" }
```

---

### PUT /enrollments/:id

Update enrollment details.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X PUT https://api.starked.edu/api/v1/enrollments/enr_001 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/enrollments/${id}`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'paused' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "id": "enr_001", "status": "paused" } }
```

---

### DELETE /enrollments/:id

Cancel an enrollment.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X DELETE https://api.starked.edu/api/v1/enrollments/enr_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{ "success": true, "message": "Enrollment cancelled successfully" }
```

---

### POST /enrollments/:id/complete

Mark an enrollment as completed.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/enrollments/enr_001/complete \
  -H "Authorization: Bearer <token>"
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/enrollments/${id}/complete`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "id": "enr_001", "status": "completed", "completedAt": "2026-07-18T08:00:00.000Z" } }
```

---

### GET /enrollments/:id/progress

Get progress breakdown for an enrollment.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/enrollments/enr_001/progress \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "enrollmentId": "enr_001",
    "overallProgress": 75,
    "completedLessons": 9,
    "totalLessons": 12,
    "lastAccessedAt": "2026-07-17T14:00:00.000Z"
  }
}
```

---

### PUT /enrollments/:id/progress

Update progress for an enrollment.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X PUT https://api.starked.edu/api/v1/enrollments/enr_001/progress \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"lessonId": "lesson_5", "completed": true}'
```

**JavaScript**
```javascript
await fetch(`/api/v1/enrollments/${enrollmentId}/progress`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ lessonId: 'lesson_5', completed: true })
});
```

**Response `200`**
```json
{ "success": true, "data": { "overallProgress": 80, "completedLessons": 10 } }
```

---

### POST /enrollments/:id/renew

Renew an expired enrollment.

**Authentication:** Required  
**Rate limit:** Payment limiter (20/15min)

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/enrollments/enr_001/renew \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"paymentId": "pmt_002"}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/enrollments/${id}/renew`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ paymentId: 'pmt_002' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "id": "enr_001", "status": "active", "renewedAt": "2026-07-18T08:00:00.000Z" } }
```

---

### GET /enrollments/course/:courseId

Get all enrollments for a specific course. Educator/Admin only.

**Authentication:** Required (educator or admin)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/enrollments/course/course_123 \
  -H "Authorization: Bearer <educator-token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "enrollments": [
      { "id": "enr_001", "userId": "user_456", "status": "active", "progress": 45 }
    ],
    "total": 1
  }
}
```

---

### POST /enrollments/:id/certificate

Issue a completion certificate. Educator/Admin only.

**Authentication:** Required (educator or admin)  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/enrollments/enr_001/certificate \
  -H "Authorization: Bearer <educator-token>"
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/enrollments/${id}/certificate`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await res.json();
```

**Response `201`**
```json
{
  "success": true,
  "data": {
    "certificateId": "cert_abc123",
    "enrollmentId": "enr_001",
    "issuedAt": "2026-07-18T08:00:00.000Z",
    "blockchainTxId": "stellar_tx_xyz..."
  }
}
```

---

### GET /enrollments/waitlist/:courseId

Get waitlist for a course. Educator/Admin only.

**Authentication:** Required (educator or admin)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/enrollments/waitlist/course_123 \
  -H "Authorization: Bearer <educator-token>"
```

**Response `200`**
```json
{ "success": true, "data": { "waitlist": [{ "userId": "user_789", "addedAt": "2026-07-17T10:00:00.000Z" }], "total": 1 } }
```

---

### POST /enrollments/waitlist/:courseId

Add the authenticated user to a course waitlist.

**Authentication:** Required  
**Rate limit:** Enrollment limiter (10/15min)

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/enrollments/waitlist/course_123 \
  -H "Authorization: Bearer <token>"
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/enrollments/waitlist/${courseId}`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await res.json();
```

**Response `201`**
```json
{ "success": true, "message": "Added to waitlist", "data": { "position": 3 } }
```

---

### DELETE /enrollments/waitlist/:courseId

Remove the authenticated user from a course waitlist.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X DELETE https://api.starked.edu/api/v1/enrollments/waitlist/course_123 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{ "success": true, "message": "Removed from waitlist" }
```

---

### GET /enrollments/analytics/user

Get enrollment analytics for the authenticated user.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/enrollments/analytics/user \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "totalEnrollments": 5,
    "completedCourses": 2,
    "inProgressCourses": 3,
    "averageProgress": 60,
    "certificatesEarned": 2
  }
}
```

---

### GET /enrollments/analytics/course/:courseId

Get enrollment analytics for a specific course. Educator/Admin only.

**Authentication:** Required (educator or admin)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/enrollments/analytics/course/course_123 \
  -H "Authorization: Bearer <educator-token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "courseId": "course_123",
    "totalEnrollments": 120,
    "activeEnrollments": 98,
    "completionRate": 0.65,
    "averageProgress": 54
  }
}
```

---

### GET /enrollments/analytics/global

Get platform-wide enrollment analytics. Admin only.

**Authentication:** Required (admin)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/enrollments/analytics/global \
  -H "Authorization: Bearer <admin-token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "totalEnrollments": 4300,
    "activeEnrollments": 3100,
    "completedEnrollments": 1200,
    "averageCompletionRate": 0.63,
    "enrollmentsThisMonth": 320
  }
}
```

---

### POST /enrollments/bulk

Perform bulk enrollment operations. Admin only.

**Authentication:** Required (admin)  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `operation` | string | Yes | `enroll`, `cancel`, or `complete` |
| `userIds` | string[] | Yes | User IDs to affect |
| `courseId` | string | Yes | Target course |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/enrollments/bulk \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"operation":"enroll","userIds":["user_1","user_2"],"courseId":"course_123"}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/enrollments/bulk', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ operation: 'enroll', userIds: ['user_1', 'user_2'], courseId: 'course_123' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "processed": 2, "failed": 0 } }
```

---

### GET /enrollments/capacity/:courseId

Get capacity information for a course.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/enrollments/capacity/course_123 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "courseId": "course_123",
    "maxCapacity": 200,
    "enrolledCount": 120,
    "availableSpots": 80,
    "waitlistCount": 5
  }
}
```

---

### POST /enrollments/validate-prerequisites

Check whether the authenticated user meets course prerequisites.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `courseId` | string | Yes | Course to check prerequisites for |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/enrollments/validate-prerequisites \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"courseId": "course_456"}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/enrollments/validate-prerequisites', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ courseId: 'course_456' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "eligible": true,
    "prerequisites": [
      { "courseId": "course_123", "title": "Intro to Blockchain", "met": true }
    ]
  }
}
```

---

### GET /enrollments/history/:userId

Get the full enrollment history for a specific user.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/enrollments/history/user_456 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "userId": "user_456",
    "history": [
      { "id": "enr_001", "courseId": "course_123", "status": "completed", "enrolledAt": "2026-01-01T00:00:00.000Z" }
    ],
    "total": 1
  }
}
```

---

### GET /enrollments/export/:courseId

Export course enrollment data as a file. Educator/Admin only.

**Authentication:** Required (educator or admin)  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `csv` | Export format: `csv` or `json` |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/enrollments/export/course_123?format=csv" \
  -H "Authorization: Bearer <educator-token>" \
  --output enrollments.csv
```

**Response `200`** — File download with `Content-Disposition: attachment` header.

---


## Payments

Base path: `/api/v1/payments`

Handles Stellar blockchain payments and traditional payment gateway integration.

### POST /payments/intent

Create a payment intent before completing a transaction.

**Authentication:** Required  
**Rate limit:** Payment limiter (20/15min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `courseId` | string | Yes | Course to pay for |
| `currency` | string | Yes | Currency code (e.g., `XLM`, `USD`) |
| `amount` | number | Yes | Payment amount |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/payments/intent \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"courseId": "course_123", "currency": "XLM", "amount": 50}'
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/payments/intent', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ courseId: 'course_123', currency: 'XLM', amount: 50 })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "intentId": "pi_abc123",
    "amount": 50,
    "currency": "XLM",
    "status": "pending",
    "expiresAt": "2026-07-18T08:30:00.000Z"
  }
}
```

---

### POST /payments/stellar/create

Create a Stellar payment transaction (returns unsigned XDR envelope).

**Authentication:** Required  
**Rate limit:** Payment limiter (20/15min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sourceAccount` | string | Yes | Sender Stellar public key |
| `amount` | string | Yes | Amount in XLM |
| `memo` | string | No | Transaction memo |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/payments/stellar/create \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sourceAccount":"GSTELLAR...","amount":"50","memo":"course_123"}'
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/payments/stellar/create', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ sourceAccount: 'GSTELLAR...', amount: '50', memo: 'course_123' })
});
const { data } = await res.json(); // data.transactionXdr -> sign with wallet
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "transactionXdr": "AAAAAQAAAA...",
    "networkPassphrase": "Test SDF Network ; September 2015"
  }
}
```

---

### POST /payments/stellar/submit

Submit a signed Stellar transaction XDR to the network.

**Authentication:** Required  
**Rate limit:** Payment limiter (20/15min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `signedXdr` | string | Yes | Signed transaction XDR from wallet |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/payments/stellar/submit \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"signedXdr": "AAAAAQAAAA...signed..."}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/payments/stellar/submit', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ signedXdr: signedTransaction })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "txHash": "abc123...",
    "status": "success",
    "ledger": 48291043
  }
}
```

---

### GET /payments/:id

Get details for a specific payment.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/payments/pmt_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "pmt_001",
    "amount": 50,
    "currency": "XLM",
    "status": "completed",
    "courseId": "course_123",
    "createdAt": "2026-07-18T08:00:00.000Z"
  }
}
```

---

### GET /payments/enrollment/:enrollmentId

Get all payments associated with an enrollment.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/payments/enrollment/enr_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": [
    { "id": "pmt_001", "amount": 50, "currency": "XLM", "status": "completed" }
  ]
}
```

---

### GET /payments/history

Get the authenticated user's payment history.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/payments/history \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "payments": [
      { "id": "pmt_001", "amount": 50, "currency": "XLM", "status": "completed", "createdAt": "2026-07-18T08:00:00.000Z" }
    ],
    "total": 1
  }
}
```

---

### POST /payments/:id/refund

Process a refund. Admin only.

**Authentication:** Required (admin)  
**Rate limit:** Refund limiter (5/hour)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | Yes | Reason for the refund |
| `amount` | number | No | Partial refund amount (defaults to full) |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/payments/pmt_001/refund \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Course cancelled by institution"}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/payments/${id}/refund`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ reason: 'Course cancelled' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "refundId": "ref_001",
    "originalPaymentId": "pmt_001",
    "amount": 50,
    "status": "processed"
  }
}
```

---

### GET /payments/receipt/:paymentId

Generate a downloadable payment receipt.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl "https://api.starked.edu/api/v1/payments/receipt/pmt_001" \
  -H "Authorization: Bearer <token>" \
  --output receipt.pdf
```

**Response `200`** — PDF or JSON receipt with `Content-Disposition: attachment` header.

---

### GET /payments/settings

Get current payment configuration.

**Authentication:** None (public)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/payments/settings
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "stellarNetwork": "testnet",
    "platformFeePercent": 2.5,
    "supportedCurrencies": ["XLM", "USD"]
  }
}
```

---

### PUT /payments/settings

Update payment settings. Admin only.

**Authentication:** Required (admin)  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X PUT https://api.starked.edu/api/v1/payments/settings \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"platformFeePercent": 3.0}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/payments/settings', {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ platformFeePercent: 3.0 })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "platformFeePercent": 3.0, "updatedAt": "2026-07-18T08:00:00.000Z" } }
```

---

### GET /payments/methods

List supported payment methods.

**Authentication:** None (public)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/payments/methods
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "methods": [
      { "id": "stellar_xlm", "name": "Stellar XLM", "enabled": true },
      { "id": "card", "name": "Credit/Debit Card", "enabled": true }
    ]
  }
}
```

---

### POST /payments/validate

Validate payment parameters before submitting.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/payments/validate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"courseId":"course_123","currency":"XLM","amount":50}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/payments/validate', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ courseId: 'course_123', currency: 'XLM', amount: 50 })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "valid": true, "convertedAmount": "50 XLM" } }
```

---

### GET /payments/analytics

Get payment analytics and revenue data. Admin only.

**Authentication:** Required (admin)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/payments/analytics \
  -H "Authorization: Bearer <admin-token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "totalRevenue": 125000,
    "currency": "XLM",
    "transactionsThisMonth": 320,
    "refundsThisMonth": 4
  }
}
```

---

### GET /payments/exchange-rates

Get current exchange rates.

**Authentication:** None (public)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/payments/exchange-rates
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "XLM": { "USD": 0.12, "EUR": 0.11 },
    "updatedAt": "2026-07-18T08:00:00.000Z"
  }
}
```

---

### POST /payments/convert

Convert an amount between currencies.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | number | Yes | Amount to convert |
| `from` | string | Yes | Source currency code |
| `to` | string | Yes | Target currency code |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/payments/convert \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "from": "XLM", "to": "USD"}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/payments/convert', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: 100, from: 'XLM', to: 'USD' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "amount": 100, "from": "XLM", "to": "USD", "converted": 12.0, "rate": 0.12 } }
```

---

### GET /payments/stellar/balance/:address

Get XLM balance for a Stellar account.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/payments/stellar/balance/GSTELLARADDRESS \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{ "success": true, "data": { "address": "GSTELLARADDRESS...", "balance": "250.50", "currency": "XLM" } }
```

---

### GET /payments/stellar/transactions/:address

Get Stellar payment history for an account.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/payments/stellar/transactions/GSTELLARADDRESS \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "transactions": [
      { "txHash": "abc123...", "amount": "50", "type": "payment", "createdAt": "2026-07-18T08:00:00.000Z" }
    ]
  }
}
```

---

### POST /payments/webhook/stellar

Webhook endpoint for Stellar Horizon payment notifications.

**Authentication:** None (verified by Stellar signature)  
**Rate limit:** None

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/payments/webhook/stellar \
  -H "Content-Type: application/json" \
  -d '{"type":"payment","txHash":"abc123...","amount":"50"}'
```


**JavaScript**
```javascript
// Handled server-to-server by Stellar Horizon — no client-side JS needed.
// Verify webhook signature before processing.
```

**Response `200`**
```json
{ "success": true, "message": "Webhook processed" }
```

---

### POST /payments/webhook/payment-gateway

Webhook endpoint for traditional payment gateway notifications.

**Authentication:** None (verified by gateway signature)  
**Rate limit:** None

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/payments/webhook/payment-gateway \
  -H "Content-Type: application/json" \
  -d '{"event":"payment.succeeded","paymentIntentId":"pi_abc123"}'
```


**JavaScript**
```javascript
// Handled server-to-server by payment gateway — no client-side JS needed.
// Verify webhook signature before processing.
```

**Response `200`**
```json
{ "success": true, "message": "Webhook processed" }
```

---


## Quizzes

Base path: `/api/v1/quizzes`

### POST /quizzes

Create a new quiz.

**Authentication:** Required (permission: `QUIZ_CREATE`)  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Quiz title |
| `courseId` | string | Yes | Associated course ID |
| `questions` | object[] | Yes | Array of question objects |
| `timeLimit` | integer | No | Time limit in minutes |
| `passingScore` | number | No | Minimum passing percentage |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/quizzes \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Module 1 Quiz","courseId":"course_123","questions":[{"text":"What is 2+2?","type":"multiple_choice","options":["3","4","5"],"correctAnswer":"4"}],"passingScore":70}'
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/quizzes', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Module 1 Quiz', courseId: 'course_123', questions: [], passingScore: 70 })
});
const { data } = await res.json();
```

**Response `201`**
```json
{
  "success": true,
  "data": {
    "id": "quiz_001",
    "title": "Module 1 Quiz",
    "courseId": "course_123",
    "isPublished": false,
    "createdAt": "2026-07-18T08:00:00.000Z"
  }
}
```

---

### GET /quizzes

List quizzes accessible to the user.

**Authentication:** Required (permission: `QUIZ_READ`)  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `courseId` | string | Filter by course |
| `published` | boolean | Filter by published status |
| `page` | integer | Page number |
| `limit` | integer | Results per page |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/quizzes?courseId=course_123&published=true" \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "quizzes": [
      { "id": "quiz_001", "title": "Module 1 Quiz", "isPublished": true, "questionCount": 10 }
    ],
    "total": 1
  }
}
```

---

### GET /quizzes/:id

Get a specific quiz.

**Authentication:** Required (permission: `QUIZ_READ`)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/quizzes/quiz_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "quiz_001",
    "title": "Module 1 Quiz",
    "courseId": "course_123",
    "questions": [{ "id": "q1", "text": "What is 2+2?", "type": "multiple_choice" }],
    "timeLimit": 30,
    "passingScore": 70,
    "isPublished": true
  }
}
```

---

### PUT /quizzes/:id

Update a quiz.

**Authentication:** Required (permission: `QUIZ_UPDATE`)  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X PUT https://api.starked.edu/api/v1/quizzes/quiz_001 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Module 1 Quiz", "passingScore": 75}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/quizzes/${quizId}`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ passingScore: 75 })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "id": "quiz_001", "title": "Updated Module 1 Quiz", "passingScore": 75 } }
```

---

### DELETE /quizzes/:id

Delete a quiz.

**Authentication:** Required (permission: `QUIZ_DELETE`)  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X DELETE https://api.starked.edu/api/v1/quizzes/quiz_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{ "success": true, "message": "Quiz deleted successfully" }
```

---

### POST /quizzes/:id/publish

Toggle quiz published status.

**Authentication:** Required (permission: `QUIZ_UPDATE`)  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `published` | boolean | Yes | `true` to publish, `false` to unpublish |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/quizzes/quiz_001/publish \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"published": true}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/quizzes/${quizId}/publish`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ published: true })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "id": "quiz_001", "isPublished": true } }
```

---

### POST /quizzes/:id/submit

Submit quiz answers.

**Authentication:** Required (permission: `PROGRESS_TRACK`)  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `answers` | object[] | Yes | Array of `{ questionId, answer }` |
| `timeTaken` | integer | No | Time taken in seconds |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/quizzes/quiz_001/submit \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"answers":[{"questionId":"q1","answer":"4"}],"timeTaken":120}'
```

**JavaScript**
```javascript
const res = await fetch(`/api/v1/quizzes/${quizId}/submit`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ answers: [{ questionId: 'q1', answer: '4' }], timeTaken: 120 })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "submissionId": "sub_001",
    "score": 100,
    "passed": true,
    "correctAnswers": 1,
    "totalQuestions": 1,
    "submittedAt": "2026-07-18T08:02:00.000Z"
  }
}
```

---

### GET /quizzes/:id/submission

Get the current user's submission for a quiz.

**Authentication:** Required (permission: `PROGRESS_TRACK`)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/quizzes/quiz_001/submission \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": { "submissionId": "sub_001", "score": 100, "passed": true, "submittedAt": "2026-07-18T08:02:00.000Z" }
}
```

---

### GET /quizzes/:id/results

Get all results for a quiz.

**Authentication:** Required (permission: `PROGRESS_TRACK`)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/quizzes/quiz_001/results \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "results": [
      { "userId": "user_456", "score": 100, "passed": true, "submittedAt": "2026-07-18T08:02:00.000Z" }
    ]
  }
}
```

---

### GET /quizzes/:id/statistics

Get aggregate quiz statistics.

**Authentication:** Required (permission: `ANALYTICS_READ`)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/quizzes/quiz_001/statistics \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "totalSubmissions": 45,
    "averageScore": 72.3,
    "passRate": 0.82,
    "averageTimeTaken": 1200
  }
}
```

---

### GET /quizzes/:id/grading-statistics

Get grading breakdown.

**Authentication:** Required (permission: `COURSE_GRADE`)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/quizzes/quiz_001/grading-statistics \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "scoreDistribution": { "90-100": 12, "70-89": 20, "below70": 13 },
    "questionDifficulty": [{ "questionId": "q1", "correctRate": 0.95 }]
  }
}
```

---

### GET /quizzes/submissions/:submissionId

Get a specific submission by ID.

**Authentication:** Required (permission: `COURSE_GRADE`)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/quizzes/submissions/sub_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "sub_001",
    "quizId": "quiz_001",
    "userId": "user_456",
    "answers": [{ "questionId": "q1", "answer": "4", "correct": true }],
    "score": 100
  }
}
```

---

### POST /quizzes/submissions/:submissionId/regrade

Regrade a submission.

**Authentication:** Required (permission: `COURSE_GRADE`)  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | Yes | Reason for regrading |
| `newScore` | number | No | Override score |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/quizzes/submissions/sub_001/regrade \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Grading error on question 2", "newScore": 90}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/quizzes/submissions/${submissionId}/regrade`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ reason: 'Grading error', newScore: 90 })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "submissionId": "sub_001", "oldScore": 80, "newScore": 90, "regradedAt": "2026-07-18T09:00:00.000Z" } }
```

---

### GET /quizzes/health

Health check for the quiz service.

**Authentication:** None  
**Rate limit:** None

**cURL**
```bash
curl https://api.starked.edu/api/v1/quizzes/health
```

**Response `200`**
```json
{ "success": true, "status": "healthy" }
```

---


## Assignments

Base path: `/api/v1/assignments`

All assignment endpoints require authentication.

### POST /assignments/courses/:courseId/assignments

Create an assignment for a course.

**Authentication:** Required  
**Rate limit:** 10 requests / 15 min

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Assignment title |
| `description` | string | Yes | Assignment instructions |
| `dueDate` | string | Yes | ISO 8601 due date |
| `maxScore` | number | Yes | Maximum achievable score |
| `allowedFileTypes` | string[] | No | Permitted file extensions |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/assignments/courses/course_123/assignments \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Essay: Blockchain in Education","description":"Write a 1000-word essay","dueDate":"2026-08-01T23:59:00.000Z","maxScore":100}'
```

**JavaScript**
```javascript
const res = await fetch(`/api/v1/assignments/courses/${courseId}/assignments`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Essay', description: '...', dueDate: '2026-08-01T23:59:00.000Z', maxScore: 100 })
});
const { data } = await res.json();
```

**Response `201`**
```json
{
  "success": true,
  "data": {
    "id": "asgn_001",
    "courseId": "course_123",
    "title": "Essay: Blockchain in Education",
    "dueDate": "2026-08-01T23:59:00.000Z",
    "maxScore": 100,
    "createdAt": "2026-07-18T08:00:00.000Z"
  }
}
```

---

### GET /assignments/courses/:courseId/assignments

List assignments for a course.

**Authentication:** Required  
**Rate limit:** 100 requests / 15 min

**cURL**
```bash
curl https://api.starked.edu/api/v1/assignments/courses/course_123/assignments \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "assignments": [
      { "id": "asgn_001", "title": "Essay: Blockchain in Education", "dueDate": "2026-08-01T23:59:00.000Z", "maxScore": 100 }
    ],
    "total": 1
  }
}
```

---

### GET /assignments/assignments/:assignmentId

Get a specific assignment.

**Authentication:** Required  
**Rate limit:** 200 requests / 15 min

**cURL**
```bash
curl https://api.starked.edu/api/v1/assignments/assignments/asgn_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "asgn_001",
    "courseId": "course_123",
    "title": "Essay: Blockchain in Education",
    "description": "Write a 1000-word essay...",
    "dueDate": "2026-08-01T23:59:00.000Z",
    "maxScore": 100
  }
}
```

---

### PUT /assignments/assignments/:assignmentId

Update an assignment.

**Authentication:** Required  
**Rate limit:** 20 requests / 15 min

**cURL**
```bash
curl -X PUT https://api.starked.edu/api/v1/assignments/assignments/asgn_001 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"dueDate": "2026-08-05T23:59:00.000Z"}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/assignments/assignments/${assignmentId}`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ dueDate: '2026-08-05T23:59:00.000Z' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "id": "asgn_001", "dueDate": "2026-08-05T23:59:00.000Z" } }
```

---

### DELETE /assignments/assignments/:assignmentId

Delete an assignment.

**Authentication:** Required  
**Rate limit:** 10 requests / 15 min

**cURL**
```bash
curl -X DELETE https://api.starked.edu/api/v1/assignments/assignments/asgn_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{ "success": true, "message": "Assignment deleted successfully" }
```

---

### POST /assignments/assignments/:assignmentId/submissions

Submit work for an assignment. Accepts file uploads.

**Authentication:** Required  
**Rate limit:** 20 requests / 15 min  
**Content-Type:** `multipart/form-data`

**Form Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `files` | file[] | No | Uploaded files (max 10) |
| `content` | string | No | Text content of submission |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/assignments/assignments/asgn_001/submissions \
  -H "Authorization: Bearer <token>" \
  -F "files=@/path/to/essay.pdf" \
  -F "content=My essay introduction..."
```

**JavaScript**
```javascript
const form = new FormData();
form.append('files', fileBlob, 'essay.pdf');
form.append('content', 'My essay introduction...');
const res = await fetch(`/api/v1/assignments/assignments/${assignmentId}/submissions`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: form
});
```

**Response `201`**
```json
{
  "success": true,
  "data": {
    "id": "sub_001",
    "assignmentId": "asgn_001",
    "userId": "user_456",
    "status": "draft",
    "submittedAt": null,
    "createdAt": "2026-07-18T08:00:00.000Z"
  }
}
```

---

### GET /assignments/assignments/:assignmentId/submissions

List all submissions for an assignment.

**Authentication:** Required  
**Rate limit:** 100 requests / 15 min

**cURL**
```bash
curl https://api.starked.edu/api/v1/assignments/assignments/asgn_001/submissions \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "submissions": [
      { "id": "sub_001", "userId": "user_456", "status": "submitted", "score": null }
    ],
    "total": 1
  }
}
```

---

### GET /assignments/submissions/:submissionId

Get a specific submission.

**Authentication:** Required  
**Rate limit:** 200 requests / 15 min

**cURL**
```bash
curl https://api.starked.edu/api/v1/assignments/submissions/sub_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "sub_001",
    "assignmentId": "asgn_001",
    "userId": "user_456",
    "content": "My essay...",
    "files": [{ "name": "essay.pdf", "cid": "QmXyz..." }],
    "status": "submitted"
  }
}
```

---

### PUT /assignments/submissions/:submissionId

Update a draft submission before final submit.

**Authentication:** Required  
**Rate limit:** 30 requests / 15 min

**cURL**
```bash
curl -X PUT https://api.starked.edu/api/v1/assignments/submissions/sub_001 \
  -H "Authorization: Bearer <token>" \
  -F "content=Updated essay content..."
```


**JavaScript**
```javascript
const form = new FormData();
form.append('content', 'Updated essay content...');
const res = await fetch(`/api/v1/assignments/submissions/${submissionId}`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}` },
  body: form
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "id": "sub_001", "status": "draft", "updatedAt": "2026-07-18T09:00:00.000Z" } }
```

---

### POST /assignments/submissions/:submissionId/submit

Finalize and submit a draft submission.

**Authentication:** Required  
**Rate limit:** 10 requests / 15 min

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/assignments/submissions/sub_001/submit \
  -H "Authorization: Bearer <token>"
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/assignments/submissions/${submissionId}/submit`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "id": "sub_001", "status": "submitted", "submittedAt": "2026-07-18T09:01:00.000Z" } }
```

---

### POST /assignments/submissions/:submissionId/grade

Grade a submission.

**Authentication:** Required  
**Rate limit:** 50 requests / 15 min

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `score` | number | Yes | Score awarded |
| `feedback` | string | No | Grader's feedback |
| `rubric` | object | No | Rubric breakdown |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/assignments/submissions/sub_001/grade \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"score": 87, "feedback": "Good analysis, needs stronger conclusion."}'
```

**JavaScript**
```javascript
const res = await fetch(`/api/v1/assignments/submissions/${submissionId}/grade`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ score: 87, feedback: 'Good analysis.' })
});
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "sub_001",
    "score": 87,
    "feedback": "Good analysis, needs stronger conclusion.",
    "gradedAt": "2026-07-18T10:00:00.000Z"
  }
}
```

---

### GET /assignments/assignments/:assignmentId/grades

Get all grades for an assignment.

**Authentication:** Required  
**Rate limit:** 100 requests / 15 min

**cURL**
```bash
curl https://api.starked.edu/api/v1/assignments/assignments/asgn_001/grades \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "grades": [
      { "submissionId": "sub_001", "userId": "user_456", "score": 87 }
    ],
    "averageScore": 87,
    "total": 1
  }
}
```

---

### GET /assignments/assignments/:assignmentId/stats

Get submission statistics for an assignment.

**Authentication:** Required  
**Rate limit:** 50 requests / 15 min

**cURL**
```bash
curl https://api.starked.edu/api/v1/assignments/assignments/asgn_001/stats \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "totalSubmissions": 28,
    "gradedSubmissions": 20,
    "averageScore": 78.5,
    "onTimeSubmissions": 25,
    "lateSubmissions": 3
  }
}
```

---

### GET /assignments/courses/:courseId/progress

Get assignment progress summary for the authenticated student in a course.

**Authentication:** Required  
**Rate limit:** 100 requests / 15 min

**cURL**
```bash
curl https://api.starked.edu/api/v1/assignments/courses/course_123/progress \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "courseId": "course_123",
    "totalAssignments": 5,
    "submitted": 3,
    "graded": 2,
    "averageScore": 85.5
  }
}
```

---

### POST /assignments/assignments/:assignmentId/bulk-grade

Bulk grade multiple submissions at once.

**Authentication:** Required  
**Rate limit:** 5 requests / 15 min

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grades` | object[] | Yes | Array of `{ submissionId, score, feedback }` |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/assignments/assignments/asgn_001/bulk-grade \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"grades":[{"submissionId":"sub_001","score":87},{"submissionId":"sub_002","score":91}]}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/assignments/assignments/${assignmentId}/bulk-grade`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ grades: [{ submissionId: 'sub_001', score: 87 }] })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "graded": 2, "failed": 0 } }
```

---


## Analytics

Base path: `/api/v1/analytics`

### GET /analytics/overview

Get high-level platform statistics.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/analytics/overview \
  -H "Authorization: Bearer <token>"
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/analytics/overview', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "totalUsers": 1200,
    "totalCourses": 85,
    "totalEnrollments": 4300,
    "completionRate": 0.63,
    "activeUsersLast30Days": 540
  }
}
```

---

### GET /analytics/report

Get a detailed analytics report with configurable time ranges.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | string | ISO 8601 start date |
| `endDate` | string | ISO 8601 end date |
| `granularity` | string | `day`, `week`, or `month` |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/analytics/report?startDate=2026-07-01&endDate=2026-07-31&granularity=week" \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "period": { "start": "2026-07-01", "end": "2026-07-31" },
    "granularity": "week",
    "series": [
      { "date": "2026-07-01", "enrollments": 42, "completions": 12, "activeUsers": 210 }
    ]
  }
}
```

---

### GET /analytics/enrollment-trends

Get enrollment trend data over time (PII-safe — no user identifiers returned).

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/analytics/enrollment-trends \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "trends": [
      { "date": "2026-07-01", "enrollments": 42 },
      { "date": "2026-07-08", "enrollments": 58 }
    ]
  }
}
```

---

### GET /analytics/completion-rates

Get course completion rate data (PII-safe).

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/analytics/completion-rates \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "overall": 0.63,
    "byCourse": [
      { "courseId": "course_123", "title": "Intro to Blockchain", "completionRate": 0.72 }
    ]
  }
}
```

---

### GET /analytics/export

Export analytics data as a downloadable file.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string | `csv` or `json` |
| `type` | string | `enrollments`, `completions`, or `overview` |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/analytics/export?format=csv&type=enrollments" \
  -H "Authorization: Bearer <token>" \
  --output analytics.csv
```

**Response `200`** — File download with `Content-Disposition: attachment` header.

---


## Search

Base path: `/api/v1/search`

### GET /search

Full-text search across courses and content.

**Authentication:** None (public)  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query |
| `category` | string | Filter by category |
| `level` | string | Filter by difficulty level |
| `page` | integer | Page number |
| `limit` | integer | Results per page |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/search?q=blockchain+basics&limit=10"
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/search?q=blockchain+basics&limit=10');
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "results": [
      { "id": "course_123", "title": "Blockchain Basics", "relevanceScore": 0.95 }
    ],
    "total": 1,
    "page": 1
  }
}
```

---

### GET /search/suggestions

Get autocomplete suggestions for a query.

**Authentication:** None (public)  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Partial search query |
| `limit` | integer | Max suggestions (default 6) |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/search/suggestions?q=block&limit=5"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "suggestions": ["blockchain basics", "blockchain development", "blockchain for finance"]
  }
}
```

---

### POST /search/voice

Process a voice search query.

**Authentication:** None (public)  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `transcript` | string | Conditional | Voice transcript text |
| `query` | string | Conditional | Fallback text query |
| `filters` | object | No | Additional search filters |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/search/voice \
  -H "Content-Type: application/json" \
  -d '{"transcript": "show me blockchain courses for beginners"}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/search/voice', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ transcript: 'blockchain courses for beginners' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "normalizedQuery": "blockchain courses beginners",
    "result": { "results": [{ "id": "course_123", "title": "Blockchain Basics" }], "total": 1 }
  }
}
```

---

### GET /search/recommendations

Get personalized course recommendations.

**Authentication:** None (public)  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | User identifier |
| `limit` | integer | Max results (default 6) |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/search/recommendations?userId=user_456&limit=6"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "recommendations": [
      { "id": "course_456", "title": "Advanced Soroban", "reason": "Based on your blockchain interest" }
    ]
  }
}
```

---

### GET /search/trending

Get trending courses and topics.

**Authentication:** None (public)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl "https://api.starked.edu/api/v1/search/trending?limit=5"
```

**Response `200`**
```json
{
  "success": true,
  "data": [
    { "id": "course_123", "title": "Blockchain Basics", "trendScore": 0.98 }
  ]
}
```

---

### GET /search/similar/:courseId

Get courses similar to a given course.

**Authentication:** None (public)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl "https://api.starked.edu/api/v1/search/similar/course_123?limit=4"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "similar": [
      { "id": "course_456", "title": "Advanced Soroban", "similarityScore": 0.87 }
    ]
  }
}
```

---

### GET /search/learning-paths

Get suggested learning paths based on a query.

**Authentication:** None (public)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl "https://api.starked.edu/api/v1/search/learning-paths?q=blockchain&limit=4"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "paths": [
      { "id": "path_001", "title": "Blockchain Developer Track", "courses": ["course_123", "course_456"] }
    ]
  }
}
```

---

### GET /search/curators

Get curator-recommended content picks.

**Authentication:** None (public)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl "https://api.starked.edu/api/v1/search/curators?limit=3"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "curators": [
      { "curator": "StarkEd Team", "picks": [{ "id": "course_123", "title": "Blockchain Basics" }] }
    ]
  }
}
```

---

### GET /search/history

Get the search history for a user session.

**Authentication:** None (session-based)  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | string | User identifier |
| `sessionId` | string | Session identifier |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/search/history?userId=user_456"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "items": [
      { "query": "blockchain basics", "searchedAt": "2026-07-18T07:00:00.000Z" }
    ]
  }
}
```

---

### GET /search/saved-searches

Get saved searches for a user.

**Authentication:** None (session-based)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl "https://api.starked.edu/api/v1/search/saved-searches?userId=user_456"
```

**Response `200`**
```json
{ "success": true, "data": { "items": [{ "id": "ss_001", "query": "blockchain basics" }] } }
```

---

### POST /search/saved-searches

Save a search query.

**Authentication:** None (session-based)  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/search/saved-searches \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_456","query":"blockchain basics"}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/search/saved-searches', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user_456', query: 'blockchain basics' })
});
const { data } = await res.json();
```

**Response `201`**
```json
{ "success": true, "data": { "id": "ss_001", "query": "blockchain basics" } }
```

---

### GET /search/alerts

Get search alerts for a user.

**Authentication:** None (session-based)  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl "https://api.starked.edu/api/v1/search/alerts?userId=user_456"
```

**Response `200`**
```json
{ "success": true, "data": { "items": [{ "id": "alert_001", "query": "soroban", "frequency": "daily" }] } }
```

---

### POST /search/alerts

Create a new search alert.

**Authentication:** None (session-based)  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/search/alerts \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_456","query":"soroban","frequency":"daily"}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/search/alerts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user_456', query: 'soroban', frequency: 'daily' })
});
const { data } = await res.json();
```

**Response `201`**
```json
{ "success": true, "data": { "id": "alert_001", "query": "soroban", "frequency": "daily" } }
```

---

### POST /search/click

Record a click event on a search result.

**Authentication:** None (session-based)  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/search/click \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_456","resultId":"course_123","query":"blockchain basics"}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/search/click', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user_456', resultId: 'course_123', query: 'blockchain' })
});
const { data } = await res.json();
```

**Response `201`**
```json
{ "success": true, "data": { "recorded": true } }
```

---

### GET /search/analytics

Get search analytics (query volume, click-through rates).

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/search/analytics \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "totalSearches": 8400,
    "uniqueQueries": 2100,
    "clickThroughRate": 0.42,
    "topQueries": ["blockchain basics", "soroban", "stellar"]
  }
}
```

---


## Gamification

Base path: `/api/v1/gamification`

### GET /gamification/leaderboard

Get the global or category-specific leaderboard.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category` | string | `global` | Leaderboard scope |
| `categoryId` | string | — | ID for category-scoped leaderboards |
| `page` | integer | `1` | Page number |
| `limit` | integer | `50` | Results per page (max 50) |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/gamification/leaderboard?category=global&limit=10" \
  -H "Authorization: Bearer <token>"
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/gamification/leaderboard?category=global&limit=10', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "entries": [
      { "rank": 1, "userId": "user_001", "username": "alice", "points": 4200 },
      { "rank": 2, "userId": "user_002", "username": "bob", "points": 3850 }
    ],
    "total": 120
  }
}
```

---

### GET /gamification/user/:userId/achievements

Get achievements for a specific user.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `earned` | boolean | Filter by earned status |
| `category` | string | Filter by achievement category |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/gamification/user/user_001/achievements?earned=true" \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "id": "ach_001",
      "userId": "user_001",
      "title": "First Course Complete",
      "category": "learning",
      "isEarned": true,
      "earnedDate": "2026-07-10T14:00:00.000Z",
      "points": 100
    }
  ]
}
```

---

### POST /gamification/event

Process a gamification event (e.g., lesson completed, quiz passed).

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | User who triggered the event |
| `event` | string | Yes | Event type (e.g., `lesson_complete`, `quiz_passed`) |
| `data` | object | No | Event context data |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/gamification/event \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_001","event":"lesson_complete","data":{"lessonId":"lesson_5"}}'
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/gamification/event', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user_001', event: 'lesson_complete', data: { lessonId: 'lesson_5' } })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "pointsAwarded": 25,
    "newAchievements": ["First Lesson Complete"],
    "totalPoints": 250,
    "levelUp": false
  }
}
```

---

### POST /gamification/points/award

Manually award points to a user.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | Recipient user ID |
| `amount` | integer | Yes | Points to award (1–100,000) |
| `category` | string | Yes | Points category |
| `description` | string | Yes | Reason for award (max 500 chars) |
| `metadata` | object | No | Additional context |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/gamification/points/award \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_001","amount":100,"category":"bonus","description":"Top performer award"}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/gamification/points/award', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user_001', amount: 100, category: 'bonus', description: 'Top performer' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "transactionId": "pts_001",
    "userId": "user_001",
    "amount": 100,
    "newTotal": 4300
  }
}
```

---

### GET /gamification/challenges

Get active challenges.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | `active` (default), `upcoming`, or `ended` |
| `type` | string | Challenge type |
| `category` | string | Challenge category |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/gamification/challenges?status=active" \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": [
    {
      "id": "chal_001",
      "title": "Complete 5 Quizzes",
      "status": "active",
      "rewards": { "points": 500, "badge": "Quiz Master" },
      "endDate": "2026-07-22T00:00:00.000Z"
    }
  ]
}
```

---

### POST /gamification/challenges/:challengeId/join

Join an active challenge.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | User joining the challenge |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/gamification/challenges/chal_001/join \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_001"}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/gamification/challenges/${challengeId}/join`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user_001' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "message": "Joined challenge successfully" }
```

---

### PUT /gamification/challenges/:challengeId/progress

Update a user's progress on a challenge objective.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | User ID |
| `objectiveId` | string | Yes | Objective identifier |
| `progress` | number | Yes | Current progress value |

**cURL**
```bash
curl -X PUT https://api.starked.edu/api/v1/gamification/challenges/chal_001/progress \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_001","objectiveId":"obj_1","progress":3}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/gamification/challenges/${challengeId}/progress`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user_001', objectiveId: 'obj_1', progress: 3 })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "participant": { "userId": "user_001", "progress": 3, "completed": false },
    "challengeCompleted": false
  }
}
```

---


## Notifications

Base path: `/api/v1/notifications`

### GET /notifications/:userId

Get notification history for a user.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `read` | boolean | Filter by read status |
| `type` | string | Filter by notification type |
| `page` | integer | Page number |
| `limit` | integer | Results per page |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/notifications/user_001?read=false" \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif_001",
        "type": "enrollment_confirmed",
        "title": "Enrollment Confirmed",
        "message": "You have been enrolled in Blockchain Basics",
        "read": false,
        "createdAt": "2026-07-18T08:00:00.000Z"
      }
    ],
    "unreadCount": 3
  }
}
```

---

### PATCH /notifications/:notificationId/read

Mark a specific notification as read.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X PATCH https://api.starked.edu/api/v1/notifications/notif_001/read \
  -H "Authorization: Bearer <token>"
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/notifications/${notificationId}/read`, {
  method: 'PATCH',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "id": "notif_001", "read": true } }
```

---

### PATCH /notifications/read-all

Mark all notifications as read for a user.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | User whose notifications to mark read |

**cURL**
```bash
curl -X PATCH https://api.starked.edu/api/v1/notifications/read-all \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user_001"}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/notifications/read-all', {
  method: 'PATCH',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'user_001' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "message": "All notifications marked as read", "data": { "updatedCount": 3 } }
```

---

### GET /notifications/:userId/preferences

Get notification delivery preferences for a user.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/notifications/user_001/preferences \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "email": true,
    "push": true,
    "sms": false,
    "types": {
      "enrollment": true,
      "achievement": true,
      "quiz_result": true,
      "payment": true
    }
  }
}
```

---

### PUT /notifications/:userId/preferences

Update notification preferences.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body** — same shape as the preferences object above.

**cURL**
```bash
curl -X PUT https://api.starked.edu/api/v1/notifications/user_001/preferences \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email":true,"push":false,"sms":false,"types":{"enrollment":true,"achievement":true}}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/notifications/${userId}/preferences`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: true, push: false, sms: false })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "email": true, "push": false, "sms": false } }
```

---

### DELETE /notifications/:notificationId

Delete a specific notification.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X DELETE https://api.starked.edu/api/v1/notifications/notif_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{ "success": true, "message": "Notification deleted" }
```

---


## Time-Lock Credentials

Base path: `/api/v1/time-lock`

Blockchain-backed credentials locked until a specified release date. All endpoints require authentication.

### POST /time-lock/issue

Issue a new time-locked credential.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `recipient` | string | Yes | Recipient Stellar address |
| `credentialHash` | string | Yes | Hash of the credential document |
| `metadata` | object | Yes | Credential metadata (title, course, etc.) |
| `releaseTime` | string | Yes | ISO 8601 datetime when credential unlocks |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/time-lock/issue \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"recipient":"GRECIPIENT...","credentialHash":"sha256:abc123","metadata":{"title":"Certificate of Completion"},"releaseTime":"2026-12-31T00:00:00.000Z"}'
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/time-lock/issue', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    recipient: 'GRECIPIENT...',
    credentialHash: 'sha256:abc123',
    metadata: { title: 'Certificate of Completion' },
    releaseTime: '2026-12-31T00:00:00.000Z'
  })
});
const { data } = await res.json();
```

**Response `201`**
```json
{
  "success": true,
  "data": {
    "id": "cred_001",
    "issuer": "GISSUER...",
    "recipient": "GRECIPIENT...",
    "status": "locked",
    "releaseTime": "2026-12-31T00:00:00.000Z",
    "issuedAt": "2026-07-18T08:00:00.000Z"
  },
  "message": "Time-locked credential issued successfully"
}
```

---

### POST /time-lock/release/:credentialId

Release a time-locked credential (only succeeds after `releaseTime`).

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/time-lock/release/cred_001 \
  -H "Authorization: Bearer <token>"
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/time-lock/release/${credentialId}`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "id": "cred_001", "status": "released", "releasedAt": "2026-12-31T00:01:00.000Z" } }
```

**Error `400`** — Lock not yet expired
```json
{ "success": false, "message": "Time lock has not expired yet" }
```

---

### POST /time-lock/batch-release

Release multiple credentials in one request.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `credentialIds` | string[] | Yes | IDs of credentials to release |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/time-lock/batch-release \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"credentialIds": ["cred_001", "cred_002"]}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/time-lock/batch-release', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ credentialIds: ['cred_001', 'cred_002'] })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "results": [
      { "credentialId": "cred_001", "success": true },
      { "credentialId": "cred_002", "success": false, "error": "Time lock not expired" }
    ],
    "summary": { "total": 2, "successful": 1, "failed": 1 }
  }
}
```

---

### POST /time-lock/emergency-revoke/:credentialId

Emergency revoke a credential. Requires the caller to match `EMERGENCY_ADMIN_ADDRESS`.

**Authentication:** Required (emergency admin)  
**Rate limit:** Strict (5/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | Yes | Reason for emergency revocation |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/time-lock/emergency-revoke/cred_001 \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Fraudulent credential detected"}'
```


**JavaScript**
```javascript
const res = await fetch(`/api/v1/time-lock/emergency-revoke/${credentialId}`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ reason: 'Fraudulent credential' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "id": "cred_001", "status": "revoked", "revokedAt": "2026-07-18T10:00:00.000Z" } }
```

---

### POST /time-lock/schedule

Create a release schedule for multiple credentials.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `credentialIds` | string[] | Yes | Credential IDs |
| `releaseTimes` | string[] | Yes | Corresponding ISO 8601 release times |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/time-lock/schedule \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"credentialIds":["cred_001","cred_002"],"releaseTimes":["2026-12-01T00:00:00.000Z","2026-12-15T00:00:00.000Z"]}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/time-lock/schedule', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ credentialIds: ['cred_001'], releaseTimes: ['2026-12-01T00:00:00.000Z'] })
});
const { data } = await res.json();
```

**Response `201`**
```json
{ "success": true, "data": { "scheduleId": "sched_001" }, "message": "Release schedule created successfully" }
```

---

### GET /time-lock/upcoming/:recipient

Get upcoming credential releases for a recipient.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeWindow` | integer | `86400000` | Lookahead in milliseconds |

**cURL**
```bash
curl "https://api.starked.edu/api/v1/time-lock/upcoming/GRECIPIENT...?timeWindow=86400000" \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": [{ "id": "cred_001", "releaseTime": "2026-07-19T08:00:00.000Z", "title": "Certificate" }],
  "count": 1
}
```

---

### GET /time-lock/recipient/:recipient

Get all credentials issued to a Stellar address.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/time-lock/recipient/GRECIPIENT... \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": [{ "id": "cred_001", "status": "locked", "releaseTime": "2026-12-31T00:00:00.000Z" }],
  "count": 1
}
```

---

### GET /time-lock/issuer/:issuer

Get all credentials issued by a Stellar address.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/time-lock/issuer/GISSUER... \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": [{ "id": "cred_001", "recipient": "GRECIPIENT...", "status": "locked" }],
  "count": 1
}
```

---

### GET /time-lock/audit/:credentialId

Get the full audit trail for a credential.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/time-lock/audit/cred_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": [
    { "event": "issued", "actor": "GISSUER...", "timestamp": "2026-07-18T08:00:00.000Z" },
    { "event": "released", "actor": "GISSUER...", "timestamp": "2026-12-31T00:01:00.000Z" }
  ]
}
```

---


## VRF (Verifiable Random Function)

Base path: `/api/v1/vrf`

Provides cryptographically verifiable randomness. All endpoints require authentication.

### POST /vrf/request

Request a verifiable random number.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `seed` | string | Yes | Entropy seed |
| `purpose` | string | Yes | Intended use (e.g., `quiz_shuffle`) |
| `context` | string | No | Additional context string |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/vrf/request \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"seed":"quiz_001_2026-07-18","purpose":"quiz_shuffle"}'
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/vrf/request', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ seed: 'quiz_001_2026-07-18', purpose: 'quiz_shuffle' })
});
const { data } = await res.json(); // data.requestId
```

**Response `201`**
```json
{ "success": true, "data": { "requestId": "vrf_req_001" }, "message": "VRF request created successfully" }
```

---

### POST /vrf/generate

Generate a random number within a range.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `purpose` | string | Yes | Use case identifier |
| `seed` | string | Yes | Entropy seed |
| `min` | integer | Yes | Minimum value (≥ 0) |
| `max` | integer | Yes | Maximum value (≥ 0) |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/vrf/generate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"purpose":"quiz_shuffle","seed":"quiz_001","min":1,"max":100}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/vrf/generate', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ purpose: 'quiz_shuffle', seed: 'quiz_001', min: 1, max: 100 })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": { "purpose": "quiz_shuffle", "randomValue": 42, "range": { "min": 1, "max": 100 } }
}
```

---

### GET /vrf/request/:requestId

Get details and status of a VRF request.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/vrf/request/vrf_req_001 \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "id": "vrf_req_001",
    "purpose": "quiz_shuffle",
    "status": "fulfilled",
    "randomValue": 42,
    "createdAt": "2026-07-18T08:00:00.000Z"
  }
}
```

---

### GET /vrf/user/:user/requests

Get all VRF requests made by a user address.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/vrf/user/GSTELLARADDRESS.../requests \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": [{ "id": "vrf_req_001", "purpose": "quiz_shuffle", "status": "fulfilled" }],
  "count": 1
}
```

---

### GET /vrf/beacon/latest

Get the latest public randomness beacon value.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/vrf/beacon/latest \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "beaconId": "beacon_001",
    "value": "0xdeadbeef...",
    "timestamp": "2026-07-18T08:00:00.000Z",
    "proof": "0xproof..."
  }
}
```

---

### GET /vrf/stats

Get VRF system usage statistics.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/vrf/stats \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": { "totalRequests": 1024, "totalBeacons": 288, "averageResponseTime": 45 }
}
```

---

### POST /vrf/commit

Record a cryptographic commitment (commit-reveal scheme).

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `commitmentHash` | string | Yes | Hash of the secret value |
| `validUntil` | string | Yes | ISO 8601 expiry datetime |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/vrf/commit \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"commitmentHash":"sha256:mysecret","validUntil":"2026-07-18T09:00:00.000Z"}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/vrf/commit', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ commitmentHash: 'sha256:mysecret', validUntil: '2026-07-18T09:00:00.000Z' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "message": "Commitment recorded successfully" }
```

---

### POST /vrf/reveal

Reveal a previously committed value and verify it.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `revealedValue` | string | Yes | The original secret value |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/vrf/reveal \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"revealedValue": "my_secret_value"}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/vrf/reveal', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ revealedValue: 'my_secret_value' })
});
const { data } = await res.json();
```

**Response `200`**
```json
{ "success": true, "data": { "isValid": true, "revealedValue": "my_secret_value" }, "message": "Value revealed successfully" }
```

---


## Holographic Storage

Base path: `/api/v1/holographic`

Advanced 3D spatial data storage abstraction layer with wavelet-based compression.

### POST /holographic/encode

Encode educational content into holographic format.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contentId` | string | Yes | Unique content identifier |
| `data` | string | Yes | Base64-encoded content data |
| `metadata` | object | No | Optional metadata |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/holographic/encode \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"contentId":"course_123_module_1","data":"JVBERi0xLjQK...","metadata":{"type":"video"}}'
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/holographic/encode', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ contentId: 'course_123_module_1', data: btoa(rawData) })
});
const { data } = await res.json(); // data.hash for future retrieval
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "hash": "holo_abc123xyz...",
    "compressionRatio": 2.4,
    "storageDensity": 0.87,
    "encodedAt": "2026-07-18T08:00:00.000Z"
  }
}
```

---

### GET /holographic/decode/:hash

Decode holographic content by hash.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `hash` | string | Holographic content hash |

**cURL**
```bash
curl https://api.starked.edu/api/v1/holographic/decode/holo_abc123xyz \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "contentId": "course_123_module_1",
    "data": "JVBERi0xLjQK...",
    "metadata": { "type": "video" }
  }
}
```

---

### POST /holographic/access/parallel

Retrieve multiple holographic resources simultaneously (up to 15,000 MB/s throughput).

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hashes` | string[] | Yes | Array of holographic content hashes |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/holographic/access/parallel \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"hashes":["holo_abc...","holo_def...","holo_ghi..."]}'
```

**JavaScript**
```javascript
const res = await fetch('/api/v1/holographic/access/parallel', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ hashes: ['holo_abc...', 'holo_def...'] })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "results": [
      { "hash": "holo_abc...", "success": true, "data": "..." },
      { "hash": "holo_def...", "success": true, "data": "..." }
    ],
    "throughput": "12800 MB/s",
    "retrievedAt": "2026-07-18T08:00:00.000Z"
  }
}
```

---

### GET /holographic/metrics

Get storage density and performance metrics.

**Authentication:** Required  
**Rate limit:** Liberal (100/min)

**cURL**
```bash
curl https://api.starked.edu/api/v1/holographic/metrics \
  -H "Authorization: Bearer <token>"
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "storageDensity": 0.85,
    "totalStored": 1024,
    "compressionRatio": 2.3,
    "averageReadThroughput": "10200 MB/s",
    "averageWriteThroughput": "8400 MB/s"
  }
}
```

---

### POST /holographic/optimize

Trigger storage density optimization using wavelet-based compression.

**Authentication:** Required  
**Rate limit:** Moderate (30/min)

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetDensity` | number | No | Target density ratio (0.0–1.0) |

**cURL**
```bash
curl -X POST https://api.starked.edu/api/v1/holographic/optimize \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"targetDensity": 0.90}'
```


**JavaScript**
```javascript
const res = await fetch('/api/v1/holographic/optimize', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ targetDensity: 0.90 })
});
const { data } = await res.json();
```

**Response `200`**
```json
{
  "success": true,
  "data": {
    "previousDensity": 0.72,
    "newDensity": 0.89,
    "spaceReclaimed": "42 GB",
    "optimizationTime": "3.2s"
  }
}
```

---

*Documentation generated for StarkEd API v1 · Last updated: 2026-07-18*
