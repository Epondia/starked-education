# Contract Upgrade Guide

## Overview

StarkEd smart contracts use Soroban's **native upgrade mechanism** to enable code updates without losing state. Unlike EVM-based proxy patterns, Soroban provides `env.deployer().update_current_contract_wasm()` which atomically replaces the contract code while preserving the contract ID and all storage.

## Architecture

```
┌─────────────────────────────────────────────┐
│              Contract ID (unchanged)         │
├─────────────────────────────────────────────┤
│  Storage (persistent + instance - preserved) │
│  ┌───────────────────────────────────────┐  │
│  │  ContractVersion: u32                 │  │
│  │  Admin: Address                       │  │
│  │  Credentials, Courses, Profiles...    │  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│  Code (WASM - replaced on upgrade)          │
│  v1 → v2 → v3 ...                          │
└─────────────────────────────────────────────┘
```

## How to Upgrade

### Step 1: Build the new contract version

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
```

### Step 2: Upload the new WASM to the network

```bash
soroban contract install \
    --wasm target/wasm32-unknown-unknown/release/starked_education_contracts.wasm \
    --source <ADMIN_SECRET_KEY> \
    --rpc-url <RPC_URL> \
    --network-passphrase <NETWORK_PASSPHRASE>
```

This returns a WASM hash that you'll use in the next step.

### Step 3: Call the upgrade function

```bash
soroban contract invoke \
    --id <CONTRACT_ID> \
    --source <ADMIN_SECRET_KEY> \
    --rpc-url <RPC_URL> \
    --network-passphrase <NETWORK_PASSPHRASE> \
    -- \
    upgrade \
    --admin <ADMIN_ADDRESS> \
    --new_wasm_hash <WASM_HASH_FROM_STEP_2>
```

### Step 4: Verify the upgrade

```bash
soroban contract invoke \
    --id <CONTRACT_ID> \
    --rpc-url <RPC_URL> \
    -- \
    get_version
```

Should return the new version number (e.g., `2`).

## State Migration

State migration is handled **lazily** — data is migrated on first access after an upgrade, not at upgrade time.

### How it works

1. The contract stores `ContractVersion` in instance storage
2. On every entry point call, `run_migration()` checks if the stored version matches the code version
3. If the stored version is behind, migrations run sequentially for each version jump
4. Each migration transforms data from `version N` to `version N+1`

### Adding a new migration

In `contracts/src/upgrade.rs`, add a new match arm to `apply_migration()`:

```rust
fn apply_migration(env: &Env, from_version: u32, to_version: u32) {
    match (from_version, to_version) {
        // Existing migrations...
        (1, 2) => { /* No data changes needed */ }
        
        // Add new migrations here:
        (2, 3) => {
            // Migrate data from v2 format to v3 format
            // Example: rename a storage key, add a new field, etc.
        }
        _ => { /* Forward compatible */ }
    }
}
```

### Migration safety rules

1. **Backward compatibility**: Old storage keys must still be readable
2. **Idempotent**: Migrations should be safe to run multiple times
3. **Atomic**: Each migration step should complete or fail cleanly
4. **Test thoroughly**: Write tests for each migration path

## Access Control

- Only the contract **admin** can call `upgrade()`
- The admin is set during `initialize()` and stored in contract storage
- Each upgrade call requires `admin.require_auth()` verification

## Security Considerations

1. **WASM verification**: Always verify the WASM hash before upgrading
2. **Test on testnet first**: Deploy and upgrade on Testnet before Mainnet
3. **Immutable fallback**: Consider a time-lock or multi-sig for upgrade authorization
4. **Storage compatibility**: Ensure new code can read all old storage keys
5. **Event emission**: Upgrades emit `contract:upgraded` events for audit trails

## Version History

| Version | Description | Migration Required |
|---------|-------------|-------------------|
| 1 | Initial deployment | None |
| 2 | Added upgrade mechanism & batch verification | None |
| 3+ | Future enhancements | Per migration spec |

## Testing Upgrades

```bash
# Run upgrade-specific tests
cargo test --package starked-education-contracts -- upgrade_test

# Run all tests including migration tests
cargo test --package starked-education-contracts
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Contract not initialized` | Call `initialize()` before upgrading |
| `Only admin can upgrade` | Use the admin secret key as `--source` |
| `WASM not found` | Ensure WASM was uploaded with `soroban contract install` |
| Data corruption after upgrade | Check migration logic in `apply_migration()` |
