// k6 load test for backend API — Issue #212
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp up to 20 users
    { duration: '1m', target: 20 },     // Stay at 20 users
    { duration: '30s', target: 50 },    // Ramp up to 50 users
    { duration: '1m', target: 50 },     // Stay at 50 users
    { duration: '30s', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // 95% of requests < 500ms
    http_req_failed: ['rate<0.05'],      // Error rate < 5%
  },
};

export default function () {
  // Health check
  const healthRes = http.get('http://localhost:3000/health');
  check(healthRes, {
    'health status 200': (r) => r.status === 200,
  });

  // Course listing
  const coursesRes = http.get('http://localhost:3000/api/courses?limit=10');
  check(coursesRes, {
    'courses status 200': (r) => r.status === 200,
    'courses has data': (r) => r.json('data') !== undefined,
  });

  // Credential verification
  const verifyRes = http.get('http://localhost:3000/api/credentials/verify?code=test123');
  check(verifyRes, {
    'verify responds': (r) => r.status === 200 || r.status === 404,
  });

  sleep(1);
}
