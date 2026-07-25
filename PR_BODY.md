## Summary

Resolves all 3 issues assigned to @Degentle12 in a single quality PR:

- Closes #166 — [Contracts] Implement upgrade mechanism for Soroban smart contracts (priority: high)
- Closes #170 — [Contracts] Optimize smart contract binary size (priority: low)
- Closes #172 — [Contracts] Implement batch credential verification (priority: medium)

---

## Changes

### 🔴 #166 — Upgrade Mechanism (priority: high)

**Problem:** No way to upgrade deployed Soroban smart contracts without losing state.

**Solution:** Uses Soroban's native `env.deployer().update_current_contract_wasm()` mechanism (no proxy pattern needed — Soroban preserves contract ID and storage natively).

- **`contracts/src/lib.rs`**: Added `upgrade()` entry point with admin-only authorization, version tracking via `ContractVersion` storage key, `get_version()` query, and event emission. Documented the critical caveat that code after `update_current_contract_wasm()` runs in the new WASM context.
- **`contracts/src/upgrade.rs`** _(new)_: Reference migration framework with `run_migration()`, `needs_migration()`, `upgrade_contract()`, `get_migration_history()`, and extensible per-version migration steps (`apply_migration` with version match arms).
- **`contracts/src/upgrade_test.rs`** _(new)_: 9 tests — version tracking, pending migration application, admin-only authorization, idempotent no-ops, downgrade safety (no-op when stored > code), and migration history recording.
- **`contracts/UPGRADE.md`** _(new)_: Complete upgrade guide with CLI commands (`soroban contract install` → `soroban contract invoke -- upgrade`), migration safety rules, security considerations, version history, and troubleshooting table.

### 🟢 #170 — Binary Size Optimization (priority: low)

**Problem:** Large WASM binary increases Stellar deployment costs.

**Solution:** Added `[profile.release]` to `Cargo.toml` with maximum size optimizations:

```toml
[profile.release]
opt-level = "z"        # Optimize for size over speed
lto = true             # Link-time optimization across entire crate
codegen-units = 1      # Single codegen unit for better inlining
strip = true           # Strip debug symbols
panic = "abort"        # Abort on panic (no unwinding machinery)
```

These flags target ~20%+ binary size reduction by enabling aggressive dead code elimination, cross-crate inlining, and removing panic unwinding infrastructure from the WASM output.

### 🟡 #172 — Batch Credential Verification (priority: medium)

**Problem:** Verifying multiple credentials requires N separate contract calls, each incurring cross-contract call overhead.

**Solution:** Added `verify_credentials_batch(Vec<u64>) -> Vec<bool>` to both the main contract and the credentials module.

- **`contracts/src/lib.rs`**: `StarkEdContract::verify_credentials_batch()` — iterates credential IDs, returns a boolean array of verification results in a single call.
- **`contracts/src/credentials.rs`**: `verify_credentials_batch()` — same pattern integrated with the existing status/revocation/expiration checks (verifies active, non-revoked, non-expired).
- **`contracts/src/credentials_test.rs`**: 3 batch tests — mixed active/revoked/nonexistent, empty list, and expired credentials.

---

## Files Changed

| File | Change |
|------|--------|
| `contracts/Cargo.toml` | Added `[profile.release]` size optimizations |
| `contracts/src/lib.rs` | Added `verify_credentials_batch`, `upgrade`, `get_version`; added `ContractVersion` key; registered `upgrade`/`upgrade_test` modules |
| `contracts/src/credentials.rs` | Added `verify_credentials_batch` function |
| `contracts/src/credentials_test.rs` | Added 3 batch verification tests; fixed batch to return `false` for nonexistent IDs |
| `contracts/src/upgrade.rs` | **New** — Migration framework with storage-namespaced versioning |
| `contracts/src/upgrade_test.rs` | **New** — 9 upgrade/migration tests |
| `contracts/UPGRADE.md` | **New** — Deployment upgrade guide |

---

## Testing

- 12 new tests added (3 batch verification + 9 upgrade/migration)
- All tests follow existing project patterns (`#[test]`, `Env::default()`, `mock_all_auths()`)
- Upgrade tests cover: version tracking, migration flow, auth rejection, idempotent no-ops, downgrade safety
- Batch tests cover: mixed states (active/revoked/nonexistent), empty input, expired credentials

## How to Verify

```bash
cd contracts
cargo test
cargo build --target wasm32-unknown-unknown --release
```

