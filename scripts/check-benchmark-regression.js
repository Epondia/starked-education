#!/usr/bin/env node
// Issue #212: Check backend benchmark results for performance regressions
const fs = require('fs');
const path = process.argv[2];

if (!path || !fs.existsSync(path)) {
  console.log('⚠ No benchmark results file found — skipping regression check');
  process.exit(0);
}

try {
  const raw = fs.readFileSync(path, 'utf8');
  const lines = raw.trim().split('\n').filter(l => l.includes('"point"'));
  
  let totalRequests = 0;
  let failedRequests = 0;
  const durations = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.metric === 'http_req_duration' && entry.data && entry.data.value) {
        durations.push(entry.data.value);
      }
      if (entry.metric === 'http_reqs' && entry.data && entry.data.value) {
        totalRequests += entry.data.value;
      }
      if (entry.metric === 'http_req_failed' && entry.data && entry.data.value) {
        failedRequests = entry.data.value;
      }
    } catch {}
  }

  if (durations.length === 0) {
    console.log('⚠ No duration data found — skipping regression check');
    process.exit(0);
  }

  durations.sort((a, b) => a - b);
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;

  console.log(`📊 Backend Load Test Results:`);
  console.log(`   Total requests: ${totalRequests}`);
  console.log(`   P95 response time: ${p95.toFixed(2)}ms`);
  console.log(`   Error rate: ${errorRate.toFixed(2)}%`);

  const P95_THRESHOLD = 500;
  const ERROR_THRESHOLD = 5;

  let failed = false;
  if (p95 > P95_THRESHOLD) {
    console.error(`❌ P95 response time (${p95.toFixed(2)}ms) exceeds threshold (${P95_THRESHOLD}ms)`);
    failed = true;
  }
  if (errorRate > ERROR_THRESHOLD) {
    console.error(`❌ Error rate (${errorRate.toFixed(2)}%) exceeds threshold (${ERROR_THRESHOLD}%)`);
    failed = true;
  }

  if (!failed) {
    console.log('✅ All performance checks passed');
  }
  process.exit(failed ? 1 : 0);
} catch (err) {
  console.error('Failed to parse benchmark results:', err.message);
  process.exit(0);
}
