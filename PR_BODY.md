# feat(contracts): add batch credential operations for institutions — resolves #8

> **Issue:** https://github.com/Epondia/starked-education/issues/8
> **Assignee:** jonathanayubausara-a11y
> **Branch:** `feat/issue-8-batch-credential-operations`
> **Closes:** #8

## Summary

Adds three batch credential operations (`batch_issue`, `batch_revoke`, `batch_renew`) to the Soroban credential registry smart contract, enabling institutions to issue, revoke, and renew up to 100 credentials in a single transaction. Each operation supports **partial failure** — individual items that fail validation are skipped with an error recorded in the result, so one problematic credential doesn't block the entire batch.

Also introduces a configurable `max_batch_size` (default 100) that administrators can adjust, and enhances the `CredentialRegistry` struct with explicit `issued_at` / `expires_at` timestamp fields (replacing `PackedTimestamps`) for clearer expiration management.

## What changes

### Modified
- **`contracts/src/credential_registry.rs`** — adds `batch_issue_credentials`, `batch_revoke_credentials`, `batch_renew_credentials`, `get_max_batch_size`, and `set_max_batch_size`. Also adds supporting types: `BatchIssueInput`, `BatchRenewInput`, `BatchResult`, `BatchConfigKey`, `RenewalRecord`, and `CredentialEvent`.
- **`contracts/src/lib.rs`** — registers the `credential_registry` module and its test module.

### Added
- **`contracts/src/credential_registry_test.rs`** — 27 unit tests covering:
  - AC 1: Batch issue 50 credentials — all succeed
  - AC 2: Batch includes one invalid item — valid ones still issued, invalid skipped
  - AC 3: Batch revoke 30 credentials — all marked revoked
  - AC 4: Batch renew 20 credentials — all expiry dates extended
  - AC 5: Exceeding max batch size rejected with clear error
  - AC 6: Partial success semantics (per-credential atomicity)
  - Authorization checks (unauthorized issuer/revoker/renewer rejected)
  - Edge cases (empty batch, zero validity duration, non-existent IDs, already-revoked, recipient-based renewal, batch config)

## Design decisions

- **Per-credential atomicity, not whole-batch rollback.** If one credential in a batch fails validation (e.g. zero validity duration, already revoked, not found), it's recorded as a failure in the `BatchResult` and the rest continue processing. This avoids the gas cost of rollback logic and matches real-world institution workflows where partial success is acceptable.
- **Configurable batch ceiling.** `DEFAULT_MAX_BATCH_SIZE = 100` with `set_max_batch_size` (admin-gated) so institutions can tune the limit as gas costs evolve on Stellar/Soroban.
- **Individual events per credential.** Each successful operation emits its own event (`batch_issued`, `batch_revoked`, `batch_renewed`), keeping the event log granular for off-chain indexing.
- **Renewal history tracked.** Every renewal records a `RenewalRecord` (old/new expiry, renewer, timestamp) stored under `RenewalHistory(credential_id)` for auditability.
- **Recipient self-renewal.** `batch_renew_credentials` allows the credential recipient to renew their own credentials, not just the admin. Unauthorized users are rejected per-item.

## Validation

- `cargo build --lib` — **✅ passes** with zero new errors (7 pre-existing warnings in unrelated files)
- `cargo test` — pre-existing compilation errors in unrelated test files (governance, user_profile, dna_storage, analytics, etc.) prevent a full run; these are tracked separately. The CI config already has `continue-on-error: true` for this step.
- Manual verification: the 8 `*u64` dereference errors that would have caused a CI build failure were fixed in this PR.

## Out of scope / Follow-ups

1. **Fix pre-existing test compilation errors** across `governance_test.rs`, `user_profile_test.rs`, `dna_storage_test.rs`, etc. (~49 errors from `#![no_std]` macro/import issues). Tracked separately.
2. **Gas benchmarking** — measure batch operation gas costs under realistic loads and tune `max_batch_size`.
3. **Indexed storage for `get_credentials_expiring_soon`** — currently O(n) linear scan; add a time-indexed data structure for production use.
4. **Event indexing integration** — wire batch events into the backend event logger for dashboards.

---

🤖 Generated with assistance from Codebuff; reviewed and signed off by the human collaborator.
