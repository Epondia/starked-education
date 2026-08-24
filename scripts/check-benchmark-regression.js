#!/usr/bin/env node
// Issue #306: Check k6 backend benchmark results against the per-endpoint
// performance budgets defined in scripts/benchmark-budgets.json.
//
// Usage:
//   node scripts/check-benchmark-regression.js <k6-json-output> [budgets-file]
//
// Reads the JSON-lines output of `k6 run --out json=...` and fails when any
// critical endpoint exceeds its p95/p99 latency budget or the overall error
// rate budget is breached. Budgets live in scripts/benchmark-budgets.json
// (documented in docs/PERFORMANCE_BUDGETS.md).

const fs = require('fs');
const path = require('path');

const resultsFile = process.argv[2];
const budgetsFile = process.argv[3] || path.join(__dirname, 'benchmark-budgets.json');

if (!resultsFile) {
  console.error('Usage: node scripts/check-benchmark-regression.js <k6-json-output> [budgets-file]');
  process.exit(2);
}

let budgets;
try {
  budgets = JSON.parse(fs.readFileSync(budgetsFile, 'utf8'));
} catch (err) {
  console.error(`Failed to read budgets file ${budgetsFile}:`, err.message);
  process.exit(1);
}

if (!fs.existsSync(resultsFile)) {
  console.error(`❌ Benchmark results file not found: ${resultsFile}`);
  console.error('   Run the load test first: k6 run --out json=<file> scripts/benchmark-backend.js');
  process.exit(1);
}

// ─── Parse k6 JSON-lines output ────────────────────────────────────────────
const durationsByEndpoint = new Map(); // endpoint -> number[] (ms)
let totalRequests = 0;
let failedRequests = 0;

for (const line of fs.readFileSync(resultsFile, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue; // tolerate stray non-JSON lines
  }
  if (entry.type !== 'Point' || !entry.data) continue;

  const { metric, data } = entry;
  if (metric === 'http_req_duration' && typeof data.value === 'number') {
    const endpoint = data.tags && data.tags.endpoint;
    if (!endpoint) continue;
    if (!durationsByEndpoint.has(endpoint)) durationsByEndpoint.set(endpoint, []);
    durationsByEndpoint.get(endpoint).push(data.value);
  } else if (metric === 'http_reqs' && typeof data.count === 'number') {
    totalRequests = data.count;
  } else if (metric === 'http_req_failed' && typeof data.count === 'number') {
    failedRequests = data.count;
  }
}

// ─── Percentile helpers ────────────────────────────────────────────────────
function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(label, values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    label,
    count: sorted.length,
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

// ─── Report ────────────────────────────────────────────────────────────────
console.log('📊 Backend Load Test Results\n');

const headers = ['Endpoint', 'Requests', 'p95 (ms)', 'p99 (ms)', 'Budget p95', 'Budget p99', 'Status'];
const rows = [];

let failed = false;

const endpointBudgets = budgets.endpoints || {};
const knownEndpoints = Object.keys(endpointBudgets);
const measuredEndpoints = new Set(durationsByEndpoint.keys());

for (const endpoint of knownEndpoints) {
  const budget = endpointBudgets[endpoint];
  const values = durationsByEndpoint.get(endpoint) || [];
  const { count, p95, p99 } = summarize(endpoint, values);

  const exceeded = [];
  if (p95 === null) {
    exceeded.push('no data');
  } else {
    if (p95 > budget.p95) exceeded.push(`p95 ${p95.toFixed(1)} > ${budget.p95}`);
    if (p99 > budget.p99) exceeded.push(`p99 ${p99.toFixed(1)} > ${budget.p99}`);
  }

  const ok = exceeded.length === 0;
  if (!ok) failed = true;

  rows.push([
    endpoint,
    String(count),
    p95 === null ? '—' : p95.toFixed(1),
    p99 === null ? '—' : p99.toFixed(1),
    String(budget.p95),
    String(budget.p99),
    ok ? '✅' : `❌ ${exceeded.join(', ')}`,
  ]);
}

// Endpoints measured but not covered by a budget — surface as a warning so
// new scenarios are always paired with a budget.
for (const endpoint of measuredEndpoints) {
  if (!knownEndpoints.includes(endpoint)) {
    const { count, p95, p99 } = summarize(endpoint, durationsByEndpoint.get(endpoint));
    rows.push([
      endpoint,
      String(count),
      p95 === null ? '—' : p95.toFixed(1),
      p99 === null ? '—' : p99.toFixed(1),
      '—',
      '—',
      '⚠️ no budget',
    ]);
    console.warn(`⚠️ Endpoint "${endpoint}" has no budget in ${budgetsFile} — add one.`);
  }
}

// Table formatting
const widths = headers.map((h, i) =>
  Math.max(h.length, ...rows.map((r) => String(r[i]).length)),
);
const pad = (s, w) => String(s).padEnd(w);
console.log(headers.map((h, i) => pad(h, widths[i])).join('  '));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const row of rows) {
  console.log(row.map((cell, i) => pad(cell, widths[i])).join('  '));
}

// Error rate budget
const errorRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;
const errorBudget = budgets.errorRatePercent ?? 5;
console.log(`\nTotal requests: ${totalRequests}`);
console.log(`Failed requests: ${failedRequests}`);
console.log(`Error rate: ${errorRate.toFixed(2)}% (budget: ${errorBudget}%)`);
if (errorRate > errorBudget) {
  console.error(`❌ Error rate exceeds budget (${errorRate.toFixed(2)}% > ${errorBudget}%)`);
  failed = true;
}

if (totalRequests === 0) {
  console.error('❌ No traffic recorded — the load test produced no requests.');
  failed = true;
}

if (!failed) {
  console.log('\n✅ All performance budgets satisfied');
} else {
  console.error('\n❌ Performance budgets exceeded — see docs/PERFORMANCE_BUDGETS.md');
}
process.exit(failed ? 1 : 0);
