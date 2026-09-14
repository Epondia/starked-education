# StarkEd — Decentralized Education on Stellar

StarkEd is a decentralized learning and credential-verification platform built on the **Stellar blockchain**. Educational credentials are issued, verified, and revoked **on-chain via Soroban smart contracts (Rust)**, while heavy content (course materials, certificates, badge metadata) is stored **off-chain on IPFS** and referenced by CID from the contracts.

> ⚠️ **Deployment status (fill these in before submission)**
>
> | Asset | Address / URL |
> |---|---|
> | **Live Demo (Frontend)** | `https://starked-education-frontend.vercel.app` ✅ deployed |
> | **Live API (Backend)** | `https://starked-api.onrender.com` <!-- TODO: replace with deployed backend URL --> |
> | **Soroban Contract — Credential Registry** | `C...` <!-- TODO: paste contract ID from deploy-testnet.sh output --> |
> | **Soroban Contract — Course Metadata** | `C...` <!-- TODO: paste contract ID from deploy-testnet.sh output --> |
> | **Soroban Contract — Credential Registry (extended)** | `C...` <!-- TODO: paste contract ID from deploy-testnet.sh output --> |
> | **Soroban Contract — Dynamic NFT / Achievements** | `C...` <!-- TODO: paste contract ID from deploy-testnet.sh output --> |
>
> Deploy the contracts with [`scripts/deploy-testnet.sh`](#deploying-to-stellar-testnet) and paste the generated IDs into this table (they are also saved to `.env`).

---

## 🎯 Core Value Proposition

1. **Soroban Smart Contracts (Rust)** — Credentials, courses, achievements, and governance run as auditable, tamper-proof contracts on Stellar Testnet/Mainnet. No centralized issuer can forge or silently revoke a credential.
2. **IPFS Metadata Storage** — Credential documents, certificate files, and badge metadata live on IPFS; only lightweight CIDs and cryptographic hashes are stored on-chain. This keeps transaction costs low while content stays immutable and censorship-resistant.
3. **~30% Gas/Storage Optimization** — The contract suite uses bit-packing, packed timestamps, hash-based storage, and separate storage tiers. Measured result: **43 → 30 storage slots (−30%)** and **~9,000 gas saved per deployment** across the four core contracts (see [Gas Savings table](#gas-savings)).

---

## 📊 Gas Savings (Rust Storage Optimization)

| Contract | Storage Slots (Before) | Storage Slots (After) | Reduction | Gas Savings |
|----------|----------------------|---------------------|-----------|-------------|
| UserProfile | 10 | 6 | **40%** | ~2,500 gas |
| CourseMetadata | 17 | 12 | **29%** | ~3,200 gas |
| Credential | 9 | 7 | **22%** | ~1,800 gas |
| Achievement | 7 | 5 | **28%** | ~1,500 gas |
| **Overall** | **43** | **30** | **30%** | **~9,000 gas** |

**Key techniques**

- **Bit packing** — boolean flags and small integers packed into single bytes.
- **Packed timestamps** — `created_at` + `updated_at` combined in one `u64`.
- **Hash-based storage** — large strings/vectors referenced by hash instead of stored inline.
- **Separate storage tiers** — hot vs. cold data split for cheaper reads.
- **Optional expiry** — `Option<u64>` for `expires_at` avoids 8 wasted bytes per credential.

**Reproduce the numbers:**

```bash
cd contracts
cargo test --release bench_
# or run the standalone gas benchmark example:
cargo run --release --example bench_gas --features testutils
```

---

## ✨ Features

- 📚 **On-chain courses** — creation, enrollment, and marketplace via Soroban contracts.
- 🎓 **Verifiable credentials** — issue, verify, and revoke with cross-chain proof generation (`generate_credential_proof` / `verify_cross_chain_proof`).
- 🏆 **Dynamic NFT achievement badges** — mint, evolve, fuse, upgrade, and transfer badges with append-only upgrade history.
- 💼 **On-chain profiles** — learning history, reputation, and achievement tracking.
- 🗳️ **Governance & tokenomics** — role-based access control, proposals, staking, quadratic voting.
- 📦 **IPFS content layer** — upload, pin, retrieve, and stream educational content via the backend API.
- 🔐 **Auth & security** — JWT auth, RBAC, rate limiting, circuit breakers, per-route timeouts, Helmet/CSP.
- 📡 **Realtime** — WebSocket collaboration, sync, and notifications.

---

## 🧱 Monorepo Structure

```
starked-education/
├── contracts/            # Soroban smart contracts (Rust / no_std)
│   └── src/
│       ├── lib.rs                # StarkEdContract — credentials, courses, proofs
│       ├── credential_registry.rs# Extended credential registry
│       ├── course_metadata.rs    # Course metadata & enrollment
│       ├── dynamic_nft.rs        # Dynamic NFT achievement badges
│       ├── user_profile.rs       # On-chain profiles
│       ├── governance.rs         # Roles, proposals, voting
│       ├── tokenomics.rs         # Reward token, staking
│       └── ...                   # marketplace, pause, events, utils
├── backend/              # Node.js / Express + TypeScript API (PostgreSQL, Redis, IPFS)
│   ├── src/
│   │   ├── routes/       # REST endpoints (auth, content, courses, credentials, …)
│   │   ├── controllers/  # Request handlers
│   │   ├── services/     # IPFS client, Stellar SDK, caching, …
│   │   └── middleware/   # JWT, Joi validation, rate limiting, security
│   └── migrations/       # SQL migrations (custom runner: src/utils/migrate.ts)
├── frontend/             # Next.js 14 (App Router) + TypeScript + Tailwind
│   └── src/
│       ├── app/          # App Router pages
│       ├── components/   # UI components
│       └── services/     # API + wallet (Freighter, Stellar Wallets Kit) clients
├── scripts/              # Deploy & ops scripts
│   └── deploy-testnet.sh # Soroban contract deployment to Stellar Testnet
├── docs/                 # Architecture, API reference, deployment guides
└── .github/workflows/    # CI/CD
```

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Blockchain | Stellar · Soroban (Rust, `soroban-sdk` 20.x) |
| Frontend | Next.js 14 · React 18 · TypeScript · TailwindCSS · Stellar Wallets Kit / Freighter |
| Backend | Node.js · Express · TypeScript · PostgreSQL · Redis · Prisma-style SQL migrations |
| Storage | IPFS (`ipfs-http-client`) · PostgreSQL · Redis |
| CI/CD | GitHub Actions · Docker · Vercel / Render |

---

## 🚀 Quick Start

### Prerequisites

- Node.js **v18+** and pnpm (`npm i -g pnpm`)
- Rust stable + `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`)
- [stellar-cli](https://github.com/stellar/stellar-cli) (`cargo install --locked stellar-cli`) for contract deploys
- PostgreSQL 15+ and Redis 7+

### 1. Install

```bash
git clone https://github.com/jobbykings/starked-education.git
cd starked-education
pnpm install:all          # installs JS workspaces + builds contracts
```

### 2. Configure environment

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Set `DATABASE_URL`, `REDIS_URL`, and `JWT_SECRET` in `backend/.env`. See
[`.env.example`](.env.example) for the full variable list.

### 3. Start supporting services

```bash
docker run -d --name starked-postgres -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=starked_dev -p 5432:5432 postgres:15
docker run -d --name starked-redis -p 6379:6379 redis:7
```

### 4. Run the stack

```bash
pnpm dev                 # backend (port 3001) + frontend (port 3000) via concurrently
```

Or run packages individually:

```bash
cd backend && pnpm dev       # API at http://localhost:3001
cd frontend && pnpm dev      # web app at http://localhost:3000
```

### 5. Run database migrations (backend)

```bash
cd backend
pnpm run migrate:up
```

### 6. Test the contracts

```bash
cd contracts
cargo test
```

---

## 📦 Deploying to Stellar Testnet

All four core Soroban contracts are deployed with one script:

```bash
# 1. Set your funded testnet account
export STELLAR_SECRET="S...your-testnet-secret-key..."

# 2. Deploy all contracts to Testnet (defaults to "all" roles)
./scripts/deploy-testnet.sh
# …or deploy a single role: ./scripts/deploy-testnet.sh credential
```

What it does:

1. Builds the contracts for `wasm32-unknown-unknown`.
2. Deploys each contract with `soroban contract deploy`.
3. Runs the required `soroban contract invoke` initialization calls.
4. Writes every generated Contract ID to `deployed_contracts_testnet.env` (and `.env`), e.g.:

```dotenv
CREDENTIAL_REGISTRY_CONTRACT_ID=C...
COURSE_METADATA_CONTRACT_ID=C...
CREDENTIAL_REGISTRY_EXTENDED_CONTRACT_ID=C...
DYNAMIC_NFT_CONTRACT_ID=C...
```

> **Manual, contract-by-contract commands:**
>
> ```bash
> # 0. Build the contracts (from the repo root)
> cd contracts && cargo build --release --target wasm32-unknown-unknown && cd ..
>
> # Deploy
> soroban contract deploy \
>   --wasm contracts/target/wasm32-unknown-unknown/release/starked_education_contracts.wasm \
>   --source-account "$STELLAR_SECRET" \
>   --rpc-url https://soroban-testnet.stellar.org \
>   --network-passphrase "Test SDF Network ; September 2015"
>
> # Initialize (example — admin address required)
> soroban contract invoke \
>   --id <CONTRACT_ID> \
>   --source-account "$STELLAR_SECRET" \
>   --rpc-url https://soroban-testnet.stellar.org \
>   --network-passphrase "Test SDF Network ; September 2015" \
>   -- initialize --admin <ADMIN_ADDRESS>
> ```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full deployment guide.

---

## ☁️ Deploying Web App & API

### Frontend — Vercel

The frontend is a standard Next.js 14 App Router app. [`frontend/vercel.json`](frontend/vercel.json) pins the build output for Vercel:

```bash
cd frontend
vercel --prod
```

Required env vars: `NEXT_PUBLIC_API_URL` (backend URL), `NEXT_PUBLIC_STELLAR_NETWORK`,
`NEXT_PUBLIC_CONTRACT_ADDRESS`.

### Backend — Render / Railway / Fly.io

The backend ships a production `Dockerfile` and a `Procfile`. On Render (or Railway/Fly),
run the web process and migrations:

```bash
# Render/Railway start commandcommit
web: sh -c "npm run migrate:up && node dist/index.js"
```

The Docker image already runs `npm run build`; the migration step runs on container start
before the API listens. See [`backend/Dockerfile`](backend/Dockerfile) and
[`backend/Procfile`](backend/Procfile).

Required env vars: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `STELLAR_RPC_URL`,
`CONTRACT_ADDRESS`, `IPFS_API_URL`.

### Docker Compose (single host)

```bash
docker compose up --build
```

---

## 🔌 API Surface (v1)

| Area | Endpoints |
|---|---|
| Auth | `POST /api/v1/auth/register` · `login` · `refresh` |
| Content / IPFS | `POST /api/v1/content/upload` · `GET /api/v1/content/:cid` · pin/unpin · `GET /api/v1/content/health` |
| Courses | `GET/POST /api/v1/courses` · `GET /api/v1/courses/:id` |
| Credentials | `POST /api/v1/credentials/issue` · `GET /api/v1/credentials/:id` · `GET /api/v1/credentials/user/:address` |
| Profiles | `GET /api/v1/profiles/:address` |
| Governance | Roles, proposals, voting via `/api/v1/governance` |
| Realtime | Collaboration, sync, notifications (WebSocket) |

Full reference: [docs/API_REFERENCE.md](docs/API_REFERENCE.md) · Interactive Swagger at `/api-docs` when the backend runs.

---

## ✅ Testing & CI

CI runs on every push/PR (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

- **Contracts** — `cargo check`, `cargo test`, gas benchmarks.
- **Backend** — `tsc --noEmit`, ESLint, Jest, build.
- **Frontend** — `tsc --noEmit`, ESLint, Jest, `next build`.

Local checks:

```bash
# Contracts
cd contracts && cargo test

# Backend
cd backend && pnpm run typecheck && pnpm test && pnpm run build

# Frontend
cd frontend && pnpm run type-check && pnpm test && pnpm run build
```

---

## 📚 Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development Setup](docs/DEVELOPMENT.md)
- [API Reference](docs/API_REFERENCE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Testing Guide](docs/TESTING.md)
- [Contributing](CONTRIBUTING.md)

---

## 📄 License

MIT — see [LICENSE](LICENSE).

⭐ Star this repository to support decentralized education on Stellar.