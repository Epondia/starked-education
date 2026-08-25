// k6 load test for the critical backend endpoints — Issue #306
//
// Per-endpoint latency budgets are loaded from scripts/benchmark-budgets.json
// so the k6 thresholds and the CI regression checker can never drift apart.
//
// Run locally:
//   1. Start the backend (npm run dev in backend/) with Postgres + Redis
//   2. k6 run scripts/benchmark-backend.js
//
// Budgets are documented in docs/PERFORMANCE_BUDGETS.md.
import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Shared per-endpoint budgets — single source of truth with
// scripts/check-benchmark-regression.js.
const budgets = JSON.parse(open('./benchmark-budgets.json'));

// Build k6 thresholds from the budget file. Each endpoint's latency is
// measured with the `endpoint` tag so thresholds apply per endpoint and
// p95/p99 (not just averages) are enforced.
const thresholds = {
  http_req_failed: [`rate<${budgets.errorRatePercent / 100}`],
  // Sanity check: the test actually generated traffic.
  http_reqs: ['rate>0'],
};
for (const [endpoint, budget] of Object.entries(budgets.endpoints)) {
  thresholds[`http_req_duration{endpoint:${endpoint}}`] = [
    `p(95)<${budget.p95}`,
    `p(99)<${budget.p99}`,
  ];
}

export const options = {
  // Moderate load profile: ramp to 20 VUs, hold, ramp to 40, hold, ramp down.
  // Kept deliberately below saturation so CI results reflect server latency
  // rather than queuing delay, which keeps the gate stable (no flakes).
  stages: [
    { duration: '15s', target: 20 },
    { duration: '30s', target: 20 },
    { duration: '15s', target: 40 },
    { duration: '30s', target: 40 },
    { duration: '15s', target: 0 },
  ],
  thresholds,
};

export default function () {
  group('health', () => {
    // Liveness probe — fast, dependency-free process check.
    const res = http.get(`${BASE_URL}/health/live`, { tags: { endpoint: 'health' } });
    check(res, { 'health/live responds 200': (r) => r.status === 200 });
  });

  group('courses list', () => {
    const res = http.get(`${BASE_URL}/api/v1/courses?limit=10&page=1`, {
      tags: { endpoint: 'courses-list' },
    });
    check(res, { 'courses list responds 200': (r) => r.status === 200 });
  });

  group('course current version', () => {
    // Uses a placeholder content id: the route returns 200 for existing
    // content and 404 otherwise — latency is measured either way.
    const res = http.get(`${BASE_URL}/api/v1/courses/benchmark-course/versions/current`, {
      tags: { endpoint: 'course-current' },
    });
    check(res, {
      'course current version responds': (r) => r.status === 200 || r.status === 404,
    });
  });

  group('search', () => {
    const res = http.get(`${BASE_URL}/api/v1/search?q=blockchain&limit=10`, {
      tags: { endpoint: 'search' },
    });
    check(res, { 'search responds 200': (r) => r.status === 200 });
  });

  group('search suggestions', () => {
    const res = http.get(`${BASE_URL}/api/v1/search/suggestions?q=block`, {
      tags: { endpoint: 'search-suggestions' },
    });
    check(res, { 'suggestions responds 200': (r) => r.status === 200 });
  });

  group('trending', () => {
    const res = http.get(`${BASE_URL}/api/v1/search/trending`, {
      tags: { endpoint: 'search-trending' },
    });
    check(res, { 'trending responds 200': (r) => r.status === 200 });
  });

  group('login', () => {
    // Invalid credentials exercise the full auth path (validation, lookup,
    // hashing); the endpoint returns 400/401 which is the expected result.
    const res = http.post(
      `${BASE_URL}/api/v1/auth/login`,
      JSON.stringify({ username: 'benchmark@starked.test', password: 'benchmark-password' }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'login' },
      },
    );
    check(res, {
      'login validates request': (r) => r.status === 400 || r.status === 401,
    });
  });

  sleep(1);
}
