# Contributor Onboarding Guide

Welcome to **StarkEd** — a decentralized learning and credential verification platform powered by the Stellar blockchain. This guide will walk you through everything you need to know to start contributing effectively.

> **New to open source?** You're in the right place. This guide is designed for contributors of all experience levels. We've labeled several issues as [`good first issue`](https://github.com/Epondia/starked-education/labels/good%20first%20issue) to help you get started.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Quick Start: 5-Minute Setup](#quick-start-5-minute-setup)
- [Monorepo Structure & Package Relationships](#monorepo-structure--package-relationships)
- [Architecture Overview](#architecture-overview)
- [Local Development Setup (Detailed)](#local-development-setup-detailed)
- [Finding & Claiming Issues](#finding--claiming-issues)
- [Development Workflow](#development-workflow)
- [Coding Conventions](#coding-conventions)
- [Testing Guide](#testing-guide)
- [Pull Request Process](#pull-request-process)
- [Troubleshooting](#troubleshooting)
- [Getting Help](#getting-help)

---

## Project Overview

StarkEd lets educators issue blockchain-verified credentials and students build a permanent, portable record of their achievements. Here's what makes it special:

- **🎓 Tamper-Proof Credentials** — Certificates are recorded on the Stellar blockchain via Soroban smart contracts
- **🔗 Decentralized Storage** — Educational content is stored on IPFS with content-addressed hashes
- **🏆 NFT-Based Achievements** — Badges and milestones are issued as NFTs
- **📊 Learning Analytics** — Track progress with on-chain and off-chain data
- **🔐 Secure & Private** — Role-based access control, encryption, and privacy-preserving features

### 🗺️ Platform Overview

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│   Users     │────▶│   Frontend       │────▶│   Backend API        │
│ (Browser)   │     │  (Next.js 14)    │     │  (Express + TS)      │
└─────────────┘     └──────────────────┘     └────┬─────────────────┘
                                                   │
                    ┌──────────────────────────────┼──────────────────┐
                    │                              │                   │
                    ▼                              ▼                   ▼
          ┌──────────────────┐          ┌──────────────────┐  ┌────────────────┐
          │   PostgreSQL     │          │   Smart Contracts│  │     IPFS       │
          │  (Off-chain DB)  │          │  (Soroban/Rust)  │  │ (Content Store)│
          └──────────────────┘          └──────────────────┘  └────────────────┘
          ┌──────────────────┐                 │
          │     Redis        │                 ▼
          │  (Cache/Session) │         ┌──────────────────┐
          └──────────────────┘         │  Stellar Network │
                                       │  (Testnet/Main) │
                                       └──────────────────┘
```

---

## Quick Start: 5-Minute Setup

The fastest way to get a working development environment:

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/starked-education.git
cd starked-education

# 2. Start all services with Docker
docker compose up -d --build

# 3. Seed the database
bash scripts/seed-dev.sh

# 4. Open the app
#    Frontend: http://localhost:3000
#    Backend:  http://localhost:5000
```

That's it! Your local StarkEd instance is now running.

> **Prerequisites:** [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/).

---

## Monorepo Structure & Package Relationships

StarkEd is organized as a monorepo with three primary workspaces (`contracts/`, `backend/`, `frontend/`) plus supporting directories:

```
starked-education/
│
├── contracts/            # Soroban smart contracts (Rust)
│   ├── src/              # Contract source files
│   │   ├── lib.rs        # Main entry point
│   │   ├── credentials.rs
│   │   ├── user_profile.rs
│   │   ├── course_metadata.rs
│   │   └── ...           # 40+ contract modules
│   ├── Cargo.toml        # Rust dependencies
│   └── rust-toolchain.toml
│
├── backend/              # Node.js + Express + TypeScript API
│   ├── src/
│   │   ├── routes/       # REST API endpoints
│   │   ├── controllers/  # Request handlers
│   │   ├── middleware/   # Auth, validation, rate limiting
│   │   ├── models/       # Database models
│   │   ├── services/     # Business logic
│   │   ├── utils/        # Helpers: IPFS, Stellar SDK, caching
│   │   └── types/        # TypeScript type definitions
│   ├── migrations/       # Database migrations
│   ├── tests/            # Test suites
│   └── package.json
│
├── frontend/             # Next.js 14 + TypeScript web app
│   ├── src/
│   │   ├── app/          # App Router pages
│   │   ├── components/   # Reusable UI components
│   │   └── utils/        # Client-side utilities
│   ├── public/           # Static assets (PWA + service worker)
│   └── package.json
│
├── docs/                 # Project documentation
│   ├── ONBOARDING.md     # <-- You are here
│   ├── ARCHITECTURE.md   # System architecture
│   ├── DEPLOYMENT.md     # Deployment instructions
│   ├── TESTING.md        # Testing conventions
│   └── API_REFERENCE.md  # API reference
│
├── scripts/              # Deployment and utility scripts
│   ├── deploy.sh         # Contract deployment
│   ├── seed-dev.sh       # Database seeding
│   └── verify.sh         # Deployment verification
│
├── portal/               # Additional portal application
│
├── .github/              # GitHub CI/CD and templates
│   ├── workflows/
│   │   ├── ci.yml        # CI/CD pipeline
│   │   └── security.yml  # Security scanning
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── SECURITY.md
│
└── docker-compose.yml    # Development Docker setup
```

### How Packages Interact

| Package | Depends On | Provides |
|---------|-----------|----------|
| `contracts/` | Rust/Soroban SDK | On-chain credential storage, course management, achievements |
| `backend/` | PostgreSQL, Redis, IPFS, contracts | REST API, auth, off-chain data, content management |
| `frontend/` | backend API | Web UI, wallet integration, PWA support |
| `portal/` | backend API | Supplementary portal features |

**Data flow example (issuing a credential):**
1. Frontend sends credential data → Backend API
2. Backend validates, stores metadata in PostgreSQL, pins content to IPFS
3. Backend (or user wallet) calls Soroban `CredentialRegistry` contract
4. Contract records credential hash on Stellar blockchain — tamper-proof

---

## Architecture Overview

See [docs/ARCHITECTURE.md](ARCHITECTURE.md) for the full system diagram and component interactions.

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Stellar/Soroban for contracts** | Low fees (~0.00001 XLM), fast confirmations (3-5s), mature ecosystem |
| **IPFS for content storage** | Decentralized, content-addressed, avoids large on-chain blobs |
| **Express + TypeScript backend** | Familiar API patterns, strong typing, extensive middleware ecosystem |
| **Next.js 14 App Router** | Modern React patterns, server components, excellent DX |
| **PostgreSQL + Redis** | Relational data integrity + fast caching/sessions |
| **Docker Compose for dev** | Consistent environment, single-command setup |

### Smart Contract Storage Optimization

Contracts use advanced techniques to minimize on-chain storage costs:
- **Bit packing** — Multiple boolean flags and small integers in single bytes
- **Hash-based storage** — Large strings stored as hashes
- **Separate storage tiers** — Frequently vs infrequently accessed data
- **Packed timestamps** — Multiple timestamps combined in single U256

> **Result:** ~30% reduction in storage slots (~9,000 gas saved per deployment). See the `contracts/` README for full benchmarks.

### Decision Records

For significant architectural decisions, we maintain decision records (ADRs) in the project. Key decisions include:

- **ADR-001:** Use Stellar/Soroban over Ethereum/Solidity for lower fees and faster finality
- **ADR-002:** Separate on-chain (contracts) and off-chain (backend) storage to minimize gas costs
- **ADR-003:** Docker Compose as the primary development environment for consistency across contributors
- **ADR-004:** TypeScript for backend and frontend to share types and reduce context switching

---

## Local Development Setup (Detailed)

### Prerequisites

| Requirement | Version | Check Command |
|------------|---------|---------------|
| Docker | Latest | `docker --version` |
| Docker Compose | v2+ | `docker compose version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Rust | 1.85+ | `rustc --version` |
| Git | Any | `git --version` |

### Step-by-Step Setup

#### 1. Fork the Repository

Click the **Fork** button at the top of the [GitHub repository](https://github.com/Epondia/starked-education), then:

```bash
# Clone your fork
git clone https://github.com/<your-username>/starked-education.git
cd starked-education

# Add upstream remote to sync with main repo
git remote add upstream https://github.com/Epondia/starked-education.git
```

#### 2. Install System Dependencies

**Docker** (recommended for most users):

```bash
# macOS: https://docs.docker.com/desktop/install/mac-install/
# Windows: https://docs.docker.com/desktop/install/windows-install/
# Linux:
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

**Rust + Soroban CLI** (for contract development):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none

# Install Stellar CLI
cargo install --locked stellar-cli
```

**Node.js + npm** (for backend/frontend):

```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

#### 3. Start Development Environment

**Option A: Docker (recommended)**

```bash
# Start all services
docker compose up -d --build

# Verify everything is running
docker compose ps
```

This starts:
- **Backend** at http://localhost:5000
- **Frontend** at http://localhost:3000
- **PostgreSQL** at localhost:5432
- **Redis** at localhost:6379
- **IPFS** at localhost:5001 (API) and localhost:8080 (Gateway)

**Option B: Manual Setup (without Docker)**

```bash
# 1. Install and start PostgreSQL
# 2. Install and start Redis
# 3. Install and start IPFS (kubo)

# 4. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 5. Set up environment variables
cp backend/.env.example backend/.env
# Edit the .env file with your configuration

# 6. Run database migrations
cd ../backend
npm run migrate:up

# 7. Seed the database
npm run seed

# 8. Start development servers (in separate terminals)
cd backend && npm run dev    # Backend on port 5000
cd frontend && npm run dev   # Frontend on port 3000
```

#### 4. Verify Your Setup

Run tests to make sure everything is working:

```bash
# Run tests for each package
cd backend && npm run test:ci
cd ../frontend && npm run test:ci
cd ../contracts && cargo test
```

### Hot Reloading

Both frontend (Next.js) and backend (nodemon) support hot reloading when using Docker:

- **Frontend:** Changes to `frontend/src/` trigger automatic page refresh
- **Backend:** Changes to `backend/src/` trigger automatic server restart

> **Note:** There are plans to create a video walkthrough of the first-time setup process. This will be linked here once available. In the meantime, the step-by-step instructions above should get you running.

---

## Finding & Claiming Issues

### Where to Find Issues

1. **GitHub Issues** — Browse [open issues](https://github.com/Epondia/starked-education/issues) 
2. **Filter by label:**
   - [`good first issue`](https://github.com/Epondia/starked-education/labels/good%20first%20issue) — Perfect for newcomers
   - [`help wanted`](https://github.com/Epondia/starked-education/labels/help%20wanted) — Maintainers are actively seeking help
   - [`documentation`](https://github.com/Epondia/starked-education/labels/documentation) — Docs improvements
   - [`area: backend`](https://github.com/Epondia/starked-education/labels/area%3A%20backend) / [`area: frontend`](https://github.com/Epondia/starked-education/labels/area%3A%20frontend) — Backend/frontend tasks
   - [`priority: low`](https://github.com/Epondia/starked-education/labels/priority%3A%20low) / [`priority: medium`](https://github.com/Epondia/starked-education/labels/priority%3A%20medium) — Good scope sizes

### How to Claim an Issue

1. **Comment on the issue** saying you'd like to work on it (e.g., "I'd like to work on this!")
2. **Wait for a maintainer to assign you** (usually within 1-2 days)
3. **Start working** once assigned

> **Tip:** If an issue has been unassigned for a while, feel free to ask about it. If someone is already assigned but inactive for 2+ weeks, maintainers may reassign it.

### What Makes a Good First Contribution

- 🔧 **Documentation fixes** — Typos, clarifications, examples
- 🐛 **Bug fixes** — Small, well-scoped bugs
- ✅ **Test additions** — Increasing test coverage
- 🎨 **UI polish** — Small frontend improvements

---

## Development Workflow

### 1. Create a Branch

```bash
# Sync with upstream
git checkout main
git pull upstream main

# Create a topic branch
git checkout -b <type>/issue-<number>-short-description
```

Branch naming convention: `<type>/issue-<number>-<description>`

Examples:
- `feat/issue-42-add-credential-revocation`
- `fix/issue-15-fix-login-validation`
- `docs/issue-210-create-onboarding-guide`
- `test/issue-88-add-profile-tests`

### 2. Make Changes

- Keep changes **focused** — one PR per concern
- Match the **style** of surrounding code
- Write **clear commit messages** (see [Commit Conventions](#commit-conventions))

### 3. Run Checks

Always run these before committing:

```bash
# Contracts
cd contracts && cargo fmt && cargo clippy && cargo test

# Backend
cd backend && npm run lint && npm run typecheck && npm run test:ci

# Frontend
cd frontend && npm run lint && npm run type-check && npm run test:ci
```

### 4. Commit

```bash
git add .
git commit -m "docs: create contributor onboarding guide

Closes #210"
```

### 5. Push and Open a PR

```bash
git push origin <your-branch-name>
```

Then open a pull request on GitHub against `main`. Fill out the [PR template](https://github.com/Epondia/starked-education/blob/main/.github/PULL_REQUEST_TEMPLATE.md) completely.

---

## Coding Conventions

### TypeScript / JavaScript (Backend & Frontend)

- **TypeScript only** — avoid `any` where a precise type is feasible
- Format with **Prettier** (frontend) and lint with **ESLint**
- Use **Joi** for request validation (backend)
- Follow **existing patterns** — the codebase is a better reference than abstract rules

```bash
# Fix auto-fixable issues
cd backend && npm run lint:fix
cd frontend && npm run lint:fix
```

### Rust / Soroban (Contracts)

- Follow **standard Rust conventions** and `rustfmt`
- Keep contracts **`no_std`-friendly** per Soroban SDK requirements
- Be mindful of **storage costs** — pack state and use tiered storage where possible
- Always write tests alongside new contract functions

```bash
cd contracts
cargo fmt
cargo clippy
```

### Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <short summary>
```

| Type | Use For |
|------|---------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `refactor` | Code change (neither fix nor feature) |
| `test` | Adding or correcting tests |
| `chore` | Tooling, build, dependencies |
| `perf` | Performance improvement |

**Examples:**
```
feat(contracts): add credential revocation entry point
fix(backend): restore Joi validation on wallet routes
docs: add contribution and developer setup guides
```

### Code Review Guidelines

When reviewing PRs, focus on:
- **Correctness** — Does the code do what it claims?
- **Test coverage** — Are there tests for new behavior?
- **Style consistency** — Does it match existing code?
- **Performance** — Are there obvious inefficiencies?
- **Security** — Are there any vulnerabilities?

---

## Testing Guide

See [docs/TESTING.md](TESTING.md) for the complete testing reference.

### Quick Commands

```bash
# Backend
cd backend && npm test                    # Full suite
cd backend && npm run test:integration    # Integration tests
cd backend && npm run test:coverage       # With coverage

# Frontend
cd frontend && npm test                   # Full suite
cd frontend && npm run test:coverage      # With coverage

# Contracts
cd contracts && cargo test                 # All contract tests
```

### Testing Principles

- **Every behavioral change ships with tests.** Bug fixes include a regression test that fails before and passes after.
- **Tests are deterministic.** No real network calls, wall-clock timing, or shared mutable state. Mock external services.
- **Tests are isolated.** Each test sets up and tears down its own state.
- **Name tests by behavior.** Describe what the code should do, not how it does it.

---

## Pull Request Process

1. **Ensure your branch is up to date** with `main`
2. **All checks must pass** locally (lint, typecheck, tests)
3. **Fill out the PR template** completely:
   - Link the issue with `Closes #<number>`
   - Describe what the PR does and why
   - Check all applicable boxes
   - Note any breaking changes
4. **Respond to review feedback** — push additional commits (avoid force-pushing during active review)
5. **A maintainer will merge** once approved using squash-and-merge

### PR Checklist

Before opening your PR, verify:

- [ ] Code follows project coding standards
- [ ] Linters and type checks pass
- [ ] Tests pass (and new tests added for changes)
- [ ] Documentation updated where needed
- [ ] Commits follow Conventional Commits format
- [ ] Breaking changes noted

---

## Troubleshooting

### Docker Issues

**Problem: `docker compose up -d` fails**

```bash
# Check Docker is running
docker info

# Try rebuilding without cache
docker compose build --no-cache
docker compose up -d

# Check logs for specific services
docker compose logs backend
docker compose logs frontend
docker compose logs postgres
```

**Problem: Port already in use**

```bash
# Check what's using the port
lsof -i :3000  # Frontend
lsof -i :5000  # Backend
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Stop the conflicting service, or change ports in docker-compose.yml
```

**Problem: Container keeps restarting**

```bash
# Check health status
docker compose ps

# View detailed logs
docker compose logs --tail=50 <service-name>

# Common fix: check if PostgreSQL is ready before backend starts
# (docker-compose.yml has depends_on with healthcheck for this)
```

**Problem: Volume permission issues**

```bash
# On Linux, you may need to fix ownership
sudo chown -R $(whoami):$(whoami) .
```

### Database Issues

**Problem: Migration fails**

```bash
# Check database connection
docker compose exec postgres psql -U postgres -d starked_dev -c "SELECT 1"

# Run migrations explicitly
docker compose exec backend npm run migrate:up

# If all else fails, reset the database
docker compose down --volumes --remove-orphans
docker compose up -d
bash scripts/seed-dev.sh
```

**Problem: Seed script fails with "Backend container is not running"**

```bash
# Wait for backend to be healthy
docker compose ps

# Check backend logs for errors
docker compose logs backend
```

### Rust / Contracts Issues

**Problem: `cargo build` fails with `wasm32v1-none` target missing**

```bash
rustup target add wasm32v1-none
```

**Problem: `stellar` CLI not found**

```bash
cargo install --locked stellar-cli
```

**Problem: Contract tests fail**

```bash
# Run with verbose output
cd contracts && cargo test -- --nocapture

# Check Rust version compatibility
rustup show
# Expected: 1.85.0 (see rust-toolchain.toml)
```

### IPFS Issues

**Problem: IPFS container not starting**

```bash
# Check IPFS logs
docker compose logs ipfs

# Common fix: reset IPFS data
docker compose down --volumes --remove-orphans
docker compose up -d
```

### Node.js / Package Issues

**Problem: `npm install` fails**

```bash
# Clear npm cache
npm cache clean --force

# Retry install
npm install

# If specific package fails, check Node.js version
node --version  # Should be 18+
```

**Problem: TypeScript errors after pulling latest changes**

```bash
# Rebuild node_modules
cd backend && rm -rf node_modules && npm install
cd ../frontend && rm -rf node_modules && npm install

# Regenerate TypeScript declarations
cd backend && npx tsc --noEmit
cd ../frontend && npx tsc --noEmit
```

### Git Issues

**Problem: Merge conflicts when syncing fork**

```bash
git checkout main
git pull upstream main
git checkout <your-branch>
git merge main
# Resolve conflicts, then:
git add .
git merge --continue
```

**Problem: Accidental commit to wrong branch**

```bash
# Move last commit to a new branch
git checkout -b <correct-branch>
git checkout <wrong-branch>
git reset --hard HEAD~1
```

### Common Development Gotchas

| Symptom | Likely Fix |
|---------|------------|
| Frontend shows blank page | Check browser console for errors. Run `npm run dev` in frontend. |
| API returns 401 | Check your JWT token. Log out and log back in. |
| "Module not found" errors | Run `npm install` from the affected package directory. |
| Contract deployment fails | Verify `STELLAR_SECRET` env var is set and account is funded. |
| Tests timeout | Check internet connection (some tests fetch deps). Increase timeout with `--testTimeout=30000`. |
| Docker disk full | `docker system prune -a` to clean unused images/containers. |

---

## Getting Help

### Documentation Resources

| Document | What It Covers |
|----------|---------------|
| [README.md](../README.md) | Project overview, features, quick start |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution workflow and standards |
| [docs/ARCHITECTURE.md](ARCHITECTURE.md) | System architecture and components |
| [docs/TESTING.md](TESTING.md) | Testing conventions and commands |
| [docs/DEPLOYMENT.md](DEPLOYMENT.md) | Deployment instructions |
| [docs/API_REFERENCE.md](API_REFERENCE.md) | API endpoint reference |

### Community Channels

- **GitHub Issues** — For bugs and feature requests
- **GitHub Discussions** — For questions and community conversation
- **Pull Requests** — For code contributions

### Etiquette & Best Practices

- **Be respectful.** Open source is collaborative — treat others as you'd like to be treated.
- **Be patient.** Maintainers review on a best-effort basis and may take 1-3 days to respond.
- **Be clear.** Write descriptive issue reports, commit messages, and PR descriptions.
- **Be proactive.** If your PR hasn't been reviewed in a week, a friendly ping is fine.
- **Say thanks.** A little appreciation goes a long way for volunteer maintainers.

---

## Next Steps

Now that you're set up:

1. ✅ [Browse good first issues](https://github.com/Epondia/starked-education/labels/good%20first%20issue)
2. 🔄 [Check the project board](https://github.com/Epondia/starked-education/projects) for roadmap items
3. 🌟 Star the repository to show your support
4. 🗣️ Join the community discussions

Welcome aboard! We're excited to have you contribute to decentralized education on Stellar. 🚀
