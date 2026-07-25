## Summary

Resolves issue #166 assigned to @Degentle12:

- Closes #166 — [Contracts] Implement upgrade mechanism for Soroban smart contracts (priority: high)

---

## Changes

### 🔴 #166 — Upgrade Mechanism (priority: high)

**Problem:** No way to upgrade deployed Soroban smart contracts without losing state.

**Solution:** Uses Soroban's native `env.deployer().update_current_contract_wasm()` mechanism (no proxy pattern needed — Soroban preserves contract ID and storage natively).

- **`contracts/src/lib.rs`**: Added `upgrade()` entry point with admin-only authorization, version tracking via `ContractVersion` storage key, `get_version()` query, and event emission. Documented the critical caveat that code after `update_current_contract_wasm()` runs in the new WASM context.
- **`contracts/src/upgrade.rs`** _(new)_: Reference migration framework with `run_migration()`, `needs_migration()`, `upgrade_contract()`, `get_migration_history()`, and extensible per-version migration steps (`apply_migration` with version match arms). Includes warning event emission for unknown migration paths and strong documentation about storage key namespace isolation.
- **`contracts/src/upgrade_test.rs`** _(new)_: 9 tests — version tracking, pending migration application, admin-only authorization, idempotent no-ops, downgrade safety (no-op when stored > code), and migration history recording.
- **`contracts/UPGRADE.md`** _(new)_: Complete upgrade guide with CLI commands (`soroban contract install` → `soroban contract invoke -- upgrade`), migration safety rules, security considerations, version history, and troubleshooting table.

---

## Files Changed

| File | Change |
|------|--------|
| `contracts/src/lib.rs` | Added `upgrade`, `get_version`; added `ContractVersion` key; registered `upgrade`/`upgrade_test` modules |
| `contracts/src/upgrade.rs` | **New** — Migration framework with storage-namespaced versioning |
| `contracts/src/upgrade_test.rs` | **New** — 9 upgrade/migration tests |
| `contracts/UPGRADE.md` | **New** — Deployment upgrade guide |

---

## Testing

- 9 new tests added
- All tests follow existing project patterns (`#[test]`, `Env::default()`, `mock_all_auths()`)
- Covers: version tracking, migration flow, auth rejection, idempotent no-ops, downgrade safety, migration history recording

## How to Verify

```bash
cd contracts
cargo test -- upgrade_test
cargo build --target wasm32-unknown-unknown --release
```
