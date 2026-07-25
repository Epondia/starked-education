//! Upgrade module for Soroban smart contract upgrades
//!
//! This module provides a reference implementation of version-based
//! migration support for Soroban smart contracts. Soroban supports native
//! contract upgrades via `env.deployer().update_current_contract_wasm()`,
//! which replaces the code while preserving the contract ID and all storage.
//!
//! **IMPORTANT — Storage Key Namespace:**
//! This module uses its own `UpgradeKey` namespace for storage. The
//! `StarkEdContract` in `lib.rs` has its own upgrade entry point using
//! `DataKey` for consistency with the rest of the contract storage. See
//! `lib.rs::StarkEdContract::upgrade()` for the primary upgrade path.
//!
//! **DO NOT call `upgrade_contract()` from this module on a contract
//! initialized by `StarkEdContract::initialize()`** — it uses a different
//! admin storage key (`Symbol("admin")` vs `DataKey::Admin`) and will
//! panic with "Contract not initialized". This module is a standalone
//! reference for contracts that want a pluggable upgrade framework with
//! its own isolated storage namespace.
//!
//! This module serves as:
//! - A reference pattern for implementing migrations
//! - A standalone utility for contracts that want a pluggable upgrade
//!   framework with its own isolated storage namespace
//!
//! # Upgrade Flow
//! 1. Admin uploads new WASM to the network
//! 2. Admin calls `upgrade_contract()` with the new WASM hash
//! 3. Contract code is atomically replaced
//! 4. `run_migration()` checks the stored version and applies any needed
//!    data migrations lazily on first access
//!
//! # Version Tracking
//! - Each deployed version is tracked via a `UpgradeKey::ContractVersion` storage key
//! - Migrations are defined per-version and run sequentially
//! - Lazy migration: data is migrated on first read, not at upgrade time

use soroban_sdk::{contracttype, Address, Env, Symbol, Vec};

/// Versioned migration entry
#[contracttype]
#[derive(Clone)]
pub struct MigrationRecord {
    pub from_version: u32,
    pub to_version: u32,
    pub applied_at: u64,
    pub applied_by: Address,
}

/// Storage key for upgrade-related data
#[contracttype]
pub enum UpgradeKey {
    ContractVersion,
    MigrationHistory(u32), // from_version -> MigrationRecord
    LastMigrationVersion,
}

/// Get the current contract version from storage
pub fn get_contract_version(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&UpgradeKey::ContractVersion)
        .unwrap_or(1)
}

/// Set the contract version in storage
pub fn set_contract_version(env: &Env, version: u32) {
    env.storage()
        .instance()
        .set(&UpgradeKey::ContractVersion, &version);
}

/// Run pending migrations for the contract
///
/// This function should be called at the beginning of every entry point
/// or lazily on first storage access. It checks if the stored data version
/// is behind the current code version and applies any pending migrations.
///
/// Returns the number of migrations applied.
pub fn run_migration(env: &Env, current_code_version: u32) -> u32 {
    let stored_version = get_contract_version(env);
    let mut migrations_applied = 0u32;

    if stored_version < current_code_version {
        for v in stored_version..current_code_version {
            apply_migration(env, v, v + 1);
            migrations_applied += 1;
        }
        set_contract_version(env, current_code_version);
    }

    migrations_applied
}

/// Apply a single migration step from one version to the next
fn apply_migration(env: &Env, from_version: u32, to_version: u32) {
    let timestamp = env.ledger().timestamp();

    match (from_version, to_version) {
        // Example migration: v1 -> v2 — no data changes needed for initial upgrade
        (1, 2) => {
            // No data migration required for v1->v2
        }
        // Add more migration steps here as the contract evolves
        (from, to) => {
            // Unknown migration path — emit warning event for operators
            env.events().publish(
                (
                    Symbol::new(env, "upgrade"),
                    Symbol::new(env, "unknown_migration"),
                ),
                (from, to),
            );
        }
    }

    // Record migration
    let record = MigrationRecord {
        from_version,
        to_version,
        applied_at: timestamp,
        applied_by: get_admin_or_panic(env),
    };

    env.storage()
        .instance()
        .set(&UpgradeKey::MigrationHistory(from_version), &record);
    env.storage()
        .instance()
        .set(&UpgradeKey::LastMigrationVersion, &to_version);
}

/// Upgrade the contract to a new WASM hash
///
/// This is the core upgrade function. Only the contract admin can call it.
/// On success, the contract code is atomically replaced while preserving
/// all storage.
pub fn upgrade_contract(env: &Env, admin: Address, new_wasm_hash: soroban_sdk::BytesN<32>) {
    admin.require_auth();

    let stored_admin: Address = env
        .storage()
        .instance()
        .get(&Symbol::new(env, "admin"))
        .unwrap_or_else(|| panic!("Contract not initialized"));

    if admin != stored_admin {
        panic!("Only admin can upgrade the contract");
    }

    let current_version = get_contract_version(env);

    // Perform the upgrade (this replaces the running code)
    env.deployer().update_current_contract_wasm(new_wasm_hash);

    // The following code runs in the NEW contract context:
    // Bump version
    set_contract_version(env, current_version + 1);

    // Emit upgrade event
    env.events().publish(
        (
            Symbol::new(env, "upgrade"),
            Symbol::new(env, "completed"),
        ),
        (current_version, current_version + 1),
    );
}

/// Check if the contract needs migration
pub fn needs_migration(env: &Env, current_code_version: u32) -> bool {
    get_contract_version(env) < current_code_version
}

/// Get migration history for a specific version jump
pub fn get_migration_history(env: &Env, from_version: u32) -> Option<MigrationRecord> {
    env.storage()
        .instance()
        .get(&UpgradeKey::MigrationHistory(from_version))
}

/// Get the last migration version applied
pub fn get_last_migration_version(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&UpgradeKey::LastMigrationVersion)
        .unwrap_or(1)
}

/// Helper: get admin address or panic
fn get_admin_or_panic(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&Symbol::new(env, "admin"))
        .unwrap_or_else(|| panic!("Contract not initialized"))
}
