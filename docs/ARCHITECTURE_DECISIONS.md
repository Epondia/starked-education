# Architecture Decision Records (ADR)

This document records the key architectural decisions made during the development of
StarkEd. Each entry describes the context, the decision, the rationale, and any trade-offs
or alternatives that were considered.

An ADR is *not* a permanent decree — it is a snapshot of what we decided and why at a
point in time. Decisions can be superseded by newer ADRs as the project evolves.

---

## ADR-001: Monorepo with pnpm Workspaces

**Date:** 2025-01  
**Status:** Accepted

### Context

StarkEd consists of three distinct packages that must evolve in tandem: Soroban smart
contracts (Rust), a backend API (Node.js/Express/TypeScript), and a Next.js frontend.
Keeping these in separate repositories would create version-skew, duplicated CI
configuration, and a painful contributor onboarding experience.

### Decision

We use a **pnpm workspace monorepo** with the following layout:

```
starked-education/
├── contracts/   # Soroban smart contracts (Rust, Cargo workspace)
├── backend/     # Node.js + Express + TypeScript
├── frontend/    # Next.js 14 + TypeScript
├── docs/        # Shared documentation
├── scripts/     # Deployment and utility scripts
└── .github/     # Shared CI/CD workflows
```

### Rationale

- **Atomic changes.** A single PR can touch contracts, backend, and frontend when the
  feature spans layers.
- **Shared CI.** One `.github/workflows/ci.yml` exercises all three packages, reducing
  duplication.
- **Simplified onboarding.** A single `pnpm install:all` sets up every JavaScript
  workspace and builds the contracts.
- **pnpm** was chosen over npm or yarn for its strict dependency resolution, disk
  efficiency via a global store, and first-class workspace support.

### Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Separate repos per package | Version skew, duplicated CI, cross-repo PR choreography |
| npm workspaces | Slower installs, less mature workspace tooling at time of decision |
| Turborepo / Nx | Added complexity without a clear need at this scale; can adopt later if monorepo grows |

### Consequences

- Contributors must install `pnpm` (`npm i -g pnpm`). This is documented in
  [DEVELOPMENT.md](DEVELOPMENT.md).
- The root `package.json` orchestrates install, build, and dev commands via workspace
  scripts.

---

## ADR-002: Soroban (Rust) for Smart Contracts

**Date:** 2025-01  
**Status:** Accepted

### Context

The platform needs tamper-proof credential issuance and verification on a blockchain.
Stellar is the chosen L1 for its speed, low transaction costs, and institutional
adoption. We needed a smart contract platform compatible with Stellar.

### Decision

We use **Soroban**, Stellar's native smart contract platform, and write contracts in
**Rust**.

### Rationale

- **Native Stellar integration.** Soroban is purpose-built for Stellar; transactions are
  first-class citizens and fees are predictable.
- **Rust safety.** Memory safety guarantees reduce the attack surface for on-chain
  credential logic.
- **`no_std` compatibility.** Soroban's SDK is designed for constrained environments,
  and Rust's ecosystem supports this well.
- **Storage efficiency.** Soroban charges based on ledger entry footprint. Rust gives us
  fine-grained control over storage layout, enabling bit-packing, hash-based storage,
  and tiered state (see README gas savings table).

### Alternatives Considered

| Alternative | Why rejected |
|---|---|
| EVM (Solidity) on a Stellar bridge | Adds a bridge trust assumption; Stellar-native is simpler |
| CosmWasm | Different ecosystem; Stellar users already have wallet infrastructure |
| Move | Not available on Stellar |

### Consequences

- Contributors need the Rust toolchain and the Soroban/Stellar CLI. These are
  documented in [DEVELOPMENT.md](DEVELOPMENT.md).
- Contract tests use the Soroban SDK's `testutils` feature rather than a standalone
  test framework.

---

## ADR-003: Express over Fastify or NestJS

**Date:** 2025-01  
**Status:** Accepted

### Context

The backend serves as the application layer between the Next.js frontend and the Stellar
blockchain, handling auth, off-chain data, IPFS, caching, and third-party integrations.

### Decision

We use **Express.js** with **TypeScript**.

### Rationale

- **Ecosystem maturity.** Express has the largest middleware ecosystem in the Node.js
  world (Helmet, rate-limiting, CORS, file uploads via Multer, JWT, etc.).
- **Team familiarity.** Express is the most widely-known Node.js framework, lowering the
  barrier for new contributors.
- **Simplicity.** For the API surface area StarkEd needs, Express's minimal abstraction
  is appropriate. Heavier frameworks like NestJS add decorators, modules, and DI that
  would complicate a codebase this size without proportionate benefit.

### Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Fastify | Faster but smaller ecosystem; fewer contributor hours of experience |
| NestJS | Opinionated architecture (modules, decorators) adds boilerplate; overkill at this scale |
| Koa | Thinner than Express; would need to re-add middleware that Express provides out of the box |

### Consequences

- Route handlers are organized under `backend/src/routes/` and validated with Joi
  middleware.
- The backend uses `ts-node` for development and compiles to `dist/` for production.

---

## ADR-004: Next.js App Router over Pages Router

**Date:** 2025-02  
**Status:** Accepted

### Context

The frontend needed a React framework with server-side rendering, good developer
experience, and wallet integration support.

### Decision

We use **Next.js 14 with the App Router** (`app/` directory).

### Rationale

- **Server Components by default.** Reduces client-side JavaScript shipped to the user,
  improving performance.
- **Layout nesting.** Shared layouts, loading states, and error boundaries are native
  to the App Router, reducing boilerplate.
- **Streaming and Suspense.** Built-in support for progressive rendering.
- **Migration path.** The Pages Router (`pages/`) still works for existing pages,
  allowing incremental migration.

### Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Next.js Pages Router only | Missing modern features (layouts, streaming, RSC); App Router is the future |
| Remix | Smaller ecosystem; Stellar wallet kits target Next.js/React |
| Vite + React Router | Lacks SSR without additional tooling |
| Create React App | Deprecated; no SSR |

### Consequences

- Some pages still use the Pages Router (`pages/`). New pages should use the App Router.
- The root layout (`app/layout.tsx`) owns the canonical `<main>` landmark and skip link,
  as documented in the accessibility PR (#70).

---

## ADR-005: Database Strategy (PostgreSQL with Optional MongoDB)

**Date:** 2025-03  
**Status:** Accepted

### Context

Off-chain data falls into two categories: highly relational data (users, courses,
enrollments, payments, credentials) and flexible document data (course content,
analytics events, IPFS metadata).

### Decision

**PostgreSQL** is the required relational database for all deployments. **MongoDB** is
supported as an optional document store for workloads that benefit from a flexible
schema (e.g., deeply nested analytics events, content version blobs). When MongoDB is
not configured, these workloads fall back to PostgreSQL's JSONB columns.

### Rationale

- **PostgreSQL** excels at joins, transactions, and referential integrity — critical for
  enrollment/payment/credential workflows.
- **MongoDB** is a better fit for certain document-shaped data (hierarchical analytics,
  content revisions) but is not mandatory — see
  [docs/DEVELOPMENT.md](DEVELOPMENT.md) which lists it as an alternative.
- Both have mature Node.js drivers and ORM/ODM support (Prisma/pg for PG, Mongoose for
  Mongo).

### Alternatives Considered

| Alternative | Why rejected |
|---|---|
| PostgreSQL only (JSONB for documents) | JSONB querying is less ergonomic for deeply nested analytics data; MongoDB is an opt-in improvement |
| MongoDB only | Lacks the relational integrity guarantees needed for payments and credential records |
| SQLite | Not suitable for a multi-tenant, concurrent-access production API |

### Consequences

- PostgreSQL is required; MongoDB is optional. See `backend/.env.example` for the
  connection variables.
- When both are configured, the backend manages connections to two database systems.
- Migrations live in `backend/migrations/` and are run with the project's migration
  utility (`pnpm run migrate:up`).

---

## ADR-006: IPFS for Decentralized Content Storage

**Date:** 2025-04  
**Status:** Accepted

### Context

Educational content (videos, PDFs, images) must be stored in a way that is verifiable
and resistant to tampering. Storing large files directly on Stellar is prohibitively
expensive.

### Decision

We store content on **IPFS** and record the content identifier (CID) on-chain via the
Soroban contracts.

### Rationale

- **Content addressing.** The CID is a cryptographic hash of the content — any tampering
  produces a different CID, making verification trivial.
- **Cost efficiency.** On-chain storage is limited to a 32-byte hash; the actual file
  lives off-chain.
- **Decentralization.** IPFS distributes content across a peer-to-peer network, reducing
  reliance on a single storage provider.

### Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Store entire files on Stellar | Prohibitively expensive (ledger entry fees scale with size) |
| AWS S3 / Cloudflare R2 | Centralized; no content-addressing guarantees without additional hashing |
| Arweave | Higher cost for one-time uploads; Stellar/IPFS integration is more mature |

### Consequences

- The backend includes an IPFS HTTP client (`ipfs-http-client` package) with upload,
  retrieval, pin, and health-check endpoints.
- Files uploaded to IPFS must be pinned to ensure availability. See
  `backend/src/config/ipfs.js` for configuration.

---

## ADR-007: Redis for Caching and Session State

**Date:** 2025-04  
**Status:** Accepted

### Context

Frequently accessed course data, user sessions, and rate-limiting counters benefit from
an in-memory store that is faster than database reads and shared across API instances.

### Decision

We use **Redis** for caching, session storage, and rate-limiting state.

### Rationale

- **Sub-millisecond latency** for cache hits.
- **Data structures** (sorted sets, hashes, lists) enable leaderboards, queues, and
  counters without application-level logic.
- **Persistence options** allow trade-offs between durability and performance per use
  case.
- Ubiquitous in the Node.js ecosystem (ioredis, express-rate-limit with Redis store).

### Alternatives Considered

| Alternative | Why rejected |
|---|---|
| In-memory Map (per process) | Cache lost on restart; not shared across instances |
| Memcached | Fewer data structures; Redis's sorted sets and pub/sub are valuable for real-time features |
| PostgreSQL UNLOGGED tables | Slower than Redis for simple key-value lookups |

### Consequences

- Redis must be running locally for development. See [DEVELOPMENT.md](DEVELOPMENT.md) for
  Docker setup commands.
- The backend configures Redis via `backend/src/config/redis.js`.

---

## ADR-008: Conventional Commits

**Date:** 2025-05  
**Status:** Accepted

### Context

A consistent commit history aids code review, automates changelog generation, and makes
`git bisect` more efficient. Without a convention, commit messages vary widely in
format and usefulness.

### Decision

All commits follow the [Conventional Commits](https://www.conventionalcommits.org/)
specification: `<type>(<optional scope>): <short summary>`.

### Rationale

- **Machine-parseable.** CI can determine the next semantic version from the commit
  types in a release.
- **Human-readable.** The type prefix immediately signals intent (`fix:` is a bug fix,
  `feat:` is new behavior).
- **Widely adopted.** Familiar to contributors from many open-source projects.

### Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Free-form messages | Inconsistent; hard to automate changelogs |
| Gitmoji | Fun but less machine-parseable; no standard for automation |
| Angular commit guidelines | Effectively the same as Conventional Commits; we align with the broader spec |

### Consequences

- The permitted types (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`) are
  documented in [CONTRIBUTING.md](../CONTRIBUTING.md#commit-conventions).
- PRs are squash-merged so the merge commit's message follows the convention even if
  individual branch commits do not.

---

## Decision Template

New ADRs should follow this template:

```markdown
## ADR-NNN: Title

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded (by ADR-NNN)

### Context

What is the issue that motivates this decision? Describe the forces at play (technical,
business, team, timeline).

### Decision

What did we decide to do? Be specific.

### Rationale

Why is this the right choice? Reference data, benchmarks, prior art, or team consensus.

### Alternatives Considered

| Alternative | Why rejected |
|---|---|
| Option A | Reason |
| Option B | Reason |

### Consequences

What becomes easier or harder because of this decision? What must contributors know?
```
