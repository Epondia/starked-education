# Contributing to StarkEd

First off, thank you for taking the time to contribute! StarkEd is a decentralized
learning and credential verification platform built on the Stellar blockchain, and it
grows through community contributions of every size — from typo fixes to new smart
contracts.

This guide is your **comprehensive onboarding resource** as a new contributor. It covers
environment setup, the monorepo structure, coding conventions, the pull request workflow,
and how to find your first issue to work on.

> **Just landed here and want to get started fast?** Jump to the
> [First-Time Contributor Checklist](#first-time-contributor-checklist).

## Table of Contents

- [First-Time Contributor Checklist](#first-time-contributor-checklist)
- [Finding and Claiming Good First Issues](#finding-and-claiming-good-first-issues)
- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Project Layout](#project-layout)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Commit Conventions](#commit-conventions)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Review Process](#review-process)
- [Troubleshooting Common Setup Issues](#troubleshooting-common-setup-issues)
- [Reporting Bugs & Requesting Features](#reporting-bugs--requesting-features)
- [Security Issues](#security-issues)
- [Additional Resources](#additional-resources)

## First-Time Contributor Checklist

If you are brand new to StarkEd, follow this checklist to get your first PR merged:

- [ ] **1. Fork and clone the repository** — see [Getting Started](#getting-started).
- [ ] **2. Install all prerequisites** — Node.js v18+, pnpm, Rust + Soroban CLI, PostgreSQL, Redis.
      Full details in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
- [ ] **3. Run `pnpm install:all` and verify your setup** — the backend, frontend, and contracts
      should all build without errors. Use `pnpm build` from the root, then run a few tests
      (`pnpm test` in each package).
- [ ] **4. Read the [Architecture Overview](docs/ARCHITECTURE.md)** — understand how the three
      packages (contracts, backend, frontend) fit together.
- [ ] **5. Find a [good first issue](#finding-and-claiming-good-first-issues)** — look for issues
      labeled `good first issue` on the [issues board](https://github.com/Epondia/starked-education/issues).
- [ ] **6. Comment on the issue** — write a short comment like "I'd like to work on this" so a
      maintainer can assign it to you.
- [ ] **7. Create a topic branch** — follow the [branch naming convention](#development-workflow).
- [ ] **8. Make focused changes and write tests** — see [Coding Standards](#coding-standards) and
      [Testing Requirements](#testing-requirements).
- [ ] **9. Run the existing test suite** — `pnpm test` (backend), `pnpm test` (frontend), or
      `cargo test` (contracts) in each package you touched, to confirm nothing is broken.
- [ ] **10. Run linters and type checks** — make sure `pnpm run lint` and `pnpm run typecheck`
      (backend) or `pnpm run type-check` (frontend) pass for the packages you touched. For
      contracts, run `cargo fmt` and `cargo clippy`.
- [ ] **11. Open a pull request** — fill out the PR template completely and link the issue with
       `Closes #<number>`.
- [ ] **12. Respond to review feedback** — be patient and address all comments.

If you hit a snag at any step, check the [Troubleshooting](#troubleshooting-common-setup-issues)
section below or the one in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Finding and Claiming Good First Issues

We use the `good first issue` label to highlight tasks that are especially welcoming for
new contributors. These issues are scoped to be approachable — they typically require
little domain knowledge and have clear acceptance criteria.

### How to find them

1. **Browse the issues board** — visit
   [github.com/Epondia/starked-education/issues](https://github.com/Epondia/starked-education/issues)
   and filter by the `good first issue` label.
2. **Look at the labels area** on each issue — the label tells you which part of the
   stack the work touches (`area: frontend`, `area: backend`, `area: contracts`,
   `documentation`, `area: devops`). Pick one that matches your skills or interests.
3. **Read the priority** — `priority: low` or `priority: medium` issues are usually less
   urgent and a better fit for learning the codebase.
4. **Check the assignee** — if nobody is assigned, the issue is available.

### How to claim an issue

1. Comment on the issue with something like:
   > I'd like to work on this! Can I be assigned?
2. A maintainer (or the GrantFox bot) will assign you. The bot typically responds within
   a few seconds.
3. Once assigned, the bot will remind you to open a PR referencing the issue (e.g.,
   `Closes #<number>`).

### Tips for your first contribution

- Start with **documentation** issues if you are new to the stack — they help you learn
  the project while making an immediate impact.
- If an issue looks too large, ask in the comments whether a smaller slice is available.
- Don't be afraid to ask questions! Maintainers are happy to clarify requirements or
  point you to relevant files.

## Code of Conduct

This project and everyone participating in it is governed by a shared expectation of
respectful, inclusive collaboration. By participating, you are expected to uphold these
principles:

- **Be respectful.** Disagreement is fine; personal attacks, harassment, and
  discriminatory language are not.
- **Be constructive.** Critique ideas and code, not people. Offer actionable feedback.
- **Be welcoming.** Assume good intent and help newcomers get oriented.
- **Be collaborative.** Share knowledge, document decisions, and credit others' work.

Unacceptable behavior may be reported to the maintainers at
`security@starked-education.org`. Maintainers are responsible for clarifying standards and
may remove, edit, or reject contributions that violate this code of conduct.

## Ways to Contribute

- **Report bugs** using the bug report issue template.
- **Suggest features** using the feature request issue template.
- **Improve documentation** — fix typos, clarify steps, add examples.
- **Write code** — pick up an open issue, especially ones labeled `good first issue`.
- **Review pull requests** — thoughtful review is a high-value contribution.

If you plan to work on something substantial, please open or comment on an issue first so
we can avoid duplicated effort and align on the approach.

## Project Layout

StarkEd is a monorepo with three primary packages, orchestrated with pnpm workspaces:

```
starked-education/
├── contracts/   # Soroban smart contracts (Rust)
├── backend/     # Node.js + Express + TypeScript API
├── frontend/    # Next.js 14 + TypeScript web app
├── docs/        # Project documentation
└── scripts/     # Deployment and utility scripts
```

For a deeper explanation of how these fit together, see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Getting Started

A complete, step-by-step setup for all three packages lives in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). In short:

```bash
# Fork, then clone your fork
git clone https://github.com/<your-username>/starked-education.git
cd starked-education

# Install dependencies for every workspace
pnpm install:all

# Configure environment
cp .env.example .env
cp backend/.env.example backend/.env
# Edit the .env files with your local values

# Run backend + frontend together
pnpm dev
```

Prerequisites: Node.js v18+, pnpm, Rust + the Stellar/Soroban CLI, and a running database
and Redis instance. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for versions and
installation details.

## Development Workflow

1. **Find or open an issue.** Make sure the work is tracked and not already in progress.
2. **Fork and branch.** Create a topic branch off the latest `main`:

   ```bash
   git checkout main
   git pull upstream main
   git checkout -b <type>/issue-<number>-short-description
   ```

   Use a branch prefix that matches the change type, e.g. `feat/`, `fix/`, `docs/`,
   `refactor/`, `test/`, or `chore/`.
3. **Make focused changes.** Keep each pull request scoped to a single concern.
4. **Write and run tests.** See [Testing Requirements](#testing-requirements).
5. **Run the linters and type checks** for any package you touched.
6. **Commit** using the [commit conventions](#commit-conventions).
7. **Open a pull request** against `main` and fill out the template.

## Coding Standards

### General

- Keep changes minimal and focused; avoid unrelated refactors in the same PR.
- Match the style and idioms of the surrounding code.
- Prefer clear names over comments, and document the *why* when behavior is non-obvious.

### Backend & Frontend (TypeScript / JavaScript)

- Code is written in **TypeScript**. Avoid `any` where a precise type is feasible.
- Linting is enforced with **ESLint**; the frontend additionally uses **Prettier**.
- Before committing, run the checks for each package you changed:

  ```bash
  # Backend
  cd backend && pnpm run lint && pnpm run typecheck

  # Frontend
  cd frontend && pnpm run lint && pnpm run type-check
  ```

- Fix auto-fixable issues with `pnpm run lint:fix` (backend) or `pnpm run lint:fix`
  (frontend).

### Smart Contracts (Rust / Soroban)

- Follow standard Rust conventions and keep contracts `no_std`-friendly per the Soroban
  SDK.
- Format and lint before committing:

  ```bash
  cd contracts
  cargo fmt
  cargo clippy
  ```

- Be mindful of storage costs — see the storage optimization notes in the README and keep
  new state packed and tiered where possible.

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/). Each commit
message has the form:

```
<type>(<optional scope>): <short summary>
```

Common types:

| Type       | Use for                                              |
|------------|------------------------------------------------------|
| `feat`     | A new feature                                        |
| `fix`      | A bug fix                                             |
| `docs`     | Documentation only changes                           |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test`     | Adding or correcting tests                           |
| `chore`    | Tooling, build, or dependency changes                |
| `perf`     | A performance improvement                            |

Examples:

```
feat(contracts): add credential revocation entry point
fix(backend): restore Joi validation on smart-wallet routes
docs: add contribution and developer setup guides
```

Keep the summary in the imperative mood and under ~72 characters. Reference the issue in
the body or footer (e.g. `Closes #78`).

## Testing Requirements

Every behavioral change should be covered by tests, and the full suite must pass before a
pull request is merged. The conventions for unit, integration, and end-to-end tests are
documented in [docs/TESTING.md](docs/TESTING.md).

Quick reference:

```bash
# Backend tests
cd backend && pnpm test

# Backend integration tests only
cd backend && pnpm run test:integration

# Frontend tests
cd frontend && pnpm test

# Contract tests
cd contracts && cargo test
```

The CI pipeline (`.github/workflows/ci.yml`) runs type checks, lint, tests, and builds for
all three packages on every pull request. Please make sure these pass locally first.

## Pull Request Process

1. Ensure your branch is up to date with `main` and that all checks pass locally.
2. Push your branch and open a pull request against `main`.
3. Fill out the [pull request template](.github/PULL_REQUEST_TEMPLATE.md) completely,
   including the checklist for tests, documentation, and breaking changes.
4. Link the issue your PR resolves using a closing keyword, e.g. `Closes #123`.
5. Keep the PR focused; large PRs are harder to review and slower to merge.
6. Respond to review feedback by pushing additional commits (avoid force-pushing during
   active review so reviewers can see incremental changes).

## Troubleshooting Common Setup Issues

Below are some of the most frequent problems new contributors encounter and how to
resolve them. For a more complete list, see the Troubleshooting section in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

### `wasm32-unknown-unknown` target missing

```bash
rustup target add wasm32-unknown-unknown
```

### Backend cannot connect to the database or Redis

- Confirm PostgreSQL and Redis are running (`pg_isready`, `redis-cli ping`).
- Double-check `DATABASE_URL` and `REDIS_URL` in `backend/.env`.
- If using Docker, make sure the containers are up (`docker ps`).

### Frontend build runs out of memory

Increase the Node.js heap size:

```bash
NODE_OPTIONS="--max-old-space-size=4096" pnpm run build
```

This is the same setting CI uses.

### Type errors after pulling new changes

Reinstall dependencies in the affected workspace:

```bash
# In the affected package directory
pnpm install
```

### `pnpm install:all` fails

- Make sure you are using **pnpm** (not npm or yarn). Install it with `npm i -g pnpm`.
- Ensure `cargo` is installed and on your `PATH` (run `cargo --version` to verify).
- Try running the steps individually:
  ```bash
  pnpm install          # install JS dependencies
  cd contracts && cargo build   # build Rust contracts
  ```

### Stellar CLI not found

Install it via Cargo:

```bash
cargo install --locked stellar-cli
```

### Port conflicts (3000, 5000, or 5432 already in use)

- Find and kill the process using the port:
  ```bash
  lsof -ti:3000 | xargs kill -9   # for frontend (Next.js default)
  lsof -ti:5000 | xargs kill -9   # for backend (Express default)
  ```
- Alternatively, set custom ports in your `.env` files.

### Tests fail with "Cannot find module" errors

- Make sure you have run `pnpm install` in the package whose tests are failing.
- For the backend, ensure `ts-jest` is configured correctly in `jest.config.js`.
- For the frontend, make sure Jest has access to the correct `tsconfig`.

## Review Process

- At least one maintainer review is required before merging.
- Reviewers look for correctness, test coverage, adherence to the coding standards, and
  clarity. CI must be green.
- Address all review comments or explain why a suggestion does not apply.
- Once approved and green, a maintainer will merge — typically using **squash and merge**
  to keep a clean history.
- Be patient and responsive; maintainers review on a best-effort basis.

## Reporting Bugs & Requesting Features

- **Bugs:** [open a bug report](https://github.com/jobbykings/starked-education/issues/new?labels=bug&template=bug_report.md).
  Include reproduction steps, expected vs. actual behavior, and environment details.
- **Features:** [suggest a feature](https://github.com/jobbykings/starked-education/issues/new?labels=enhancement&template=feature_request.md).
  Describe the problem you are solving, not only the solution.

## Security Issues

Please **do not** open public issues for security vulnerabilities. Instead, email
`security@starked-education.org` with details. See the security issue template for the
information to include.

---

## Additional Resources

These companion documents provide deeper context on specific topics:

| Document | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, component interactions, data flow diagrams, and the request lifecycle |
| [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md) | Key architecture decision records (ADRs) explaining why we chose specific technologies and patterns |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Detailed local development environment setup for all three packages |
| [docs/TESTING.md](docs/TESTING.md) | Testing conventions, tools, and coverage expectations for each package |
| [README.md](README.md) | Project overview, feature list, technology stack, and quick-start instructions |
| [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) | The PR checklist you must complete before submitting |

### Architecture Diagrams

A system-level architecture diagram showing how the three packages and external services
connect is available in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). That document also
walks through a typical request lifecycle (e.g., issuing a credential) to illustrate how
each component participates.

### Video Walkthrough

A video walkthrough of first-time setup is planned. In the meantime, follow the
step-by-step instructions in the [First-Time Contributor Checklist](#first-time-contributor-checklist)
above and refer to [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed per-package
setup commands.

---

Thank you for helping build decentralized education on Stellar! ⭐
