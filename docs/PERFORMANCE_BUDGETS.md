# Performance Budgets

StarkEd defines **latency budgets** for the critical backend endpoints so
regressions are caught by CI instead of by users. The budgets live in a single
source of truth — `scripts/benchmark-budgets.json` — which is consumed by both
the k6 load test (`scripts/benchmark-backend.js`) and the CI regression gate
(`scripts/check-benchmark-regression.js`), so the two can never drift apart.

## Budgets

Budgets are expressed as **p95 / p99 response times in milliseconds** for each
endpoint, plus a global error-rate budget. Percentiles (not averages) are used
because averages hide long-tail latency.

| Endpoint | Route | p95 budget | p99 budget |
|----------|-------|-----------:|-----------:|
| `health` | `GET /health/live` | 100 ms | 200 ms |
| `courses-list` | `GET /api/v1/courses?limit=10&page=1` | 300 ms | 500 ms |
| `course-current` | `GET /api/v1/courses/:contentId/versions/current` | 300 ms | 500 ms |
| `search` | `GET /api/v1/search?q=...` | 400 ms | 700 ms |
| `search-suggestions` | `GET /api/v1/search/suggestions?q=...` | 300 ms | 500 ms |
| `search-trending` | `GET /api/v1/search/trending` | 300 ms | 500 ms |
| `login` | `POST /api/v1/auth/login` | 500 ms | 1000 ms |

**Global error-rate budget: 5%** — the share of failed requests across all
benchmarked endpoints must stay below this.

## How it works

1. **k6 load test** (`scripts/benchmark-backend.js`) ramps to 20 VUs, holds,
   ramps to 40 VUs, holds, then ramps down. Each request is tagged with its
   `endpoint` so latencies can be bucketed per endpoint. k6 thresholds are
   generated directly from `scripts/benchmark-budgets.json`, so exceeding a
   budget fails the k6 run itself.
2. **Regression gate** (`scripts/check-benchmark-regression.js`) parses the
   k6 JSON output and prints a per-endpoint report of p95/p99 vs. budget. It
   exits non-zero when any endpoint is over budget, when the error rate
   exceeds 5%, or when no traffic was recorded (e.g. the test failed to run).
3. **CI** (`.github/workflows/benchmark.yml`) runs both steps on every PR
   touching `backend/`, `frontend/`, or `contracts/`. The k6 step fails the
   build on a budget breach; the regression gate always runs afterwards to
   attach the detailed report. Results are uploaded as an artifact even on
   failure.

## Running locally

```bash
# 1. Start the backend with its dependencies (Postgres, Redis)
cd backend && npm run dev

# 2. Run the load test (k6 is required: https://k6.io)
k6 run --out json=benchmark-results/backend-load.json scripts/benchmark-backend.js

# 3. Check the results against the budgets
node scripts/check-benchmark-regression.js benchmark-results/backend-load.json
```

Point k6 at another environment with `BASE_URL`:

```bash
k6 run -e BASE_URL=https://staging.starked.example scripts/benchmark-backend.js
```

## Adjusting budgets

Budgets should reflect what the team has measured as *healthy* latency, with
headroom for slow CI runners. To change a budget:

1. Edit the value in `scripts/benchmark-budgets.json`.
2. Update the table above.
3. Open a PR — the benchmark job will validate the new budget against the
   current measured latency.

Never widen a budget to silence a regression; investigate the slowdown first.

## Stability notes

- The load profile is deliberately below saturation so CI numbers reflect
  server latency, not queuing delay — this keeps the gate free of flakes.
- The rate limiter is skipped when `NODE_ENV=test` (the CI benchmark runs in
  test mode), so requests are not throttled mid-test.
- Every endpoint added to `scripts/benchmark-backend.js` **must** be paired
  with a budget in `scripts/benchmark-budgets.json`; the regression gate warns
  when it sees measured endpoints without a budget.
