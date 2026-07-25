#![cfg(test)]

use crate::upgrade::{
    get_contract_version, get_last_migration_version, get_migration_history, needs_migration,
    run_migration, set_contract_version, upgrade_contract, MigrationRecord,
};
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Symbol};

/// Test: contract version is initialized to 1
#[test]
fn test_initial_version_is_1() {
    let env = Env::default();
    assert_eq!(get_contract_version(&env), 1);
}

/// Test: set and get contract version
#[test]
fn test_set_and_get_contract_version() {
    let env = Env::default();
    set_contract_version(&env, 3);
    assert_eq!(get_contract_version(&env), 3);
}

/// Test: needs_migration returns true when stored version < code version
#[test]
fn test_needs_migration_when_outdated() {
    let env = Env::default();
    set_contract_version(&env, 1);
    assert!(needs_migration(&env, 3));
}

/// Test: needs_migration returns false when versions match
#[test]
fn test_no_migration_needed_when_versions_match() {
    let env = Env::default();
    set_contract_version(&env, 2);
    assert!(!needs_migration(&env, 2));
}

/// Test: run_migration applies pending migrations and updates version
#[test]
fn test_run_migration_applies_pending() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    set_contract_version(&env, 1);

    // Run migration from version 1 to 3
    let applied = run_migration(&env, 3);
    assert_eq!(applied, 2); // Two migrations: 1->2, 2->3
    assert_eq!(get_contract_version(&env), 3);
    assert_eq!(get_last_migration_version(&env), 3);
}

/// Test: migration history is recorded
#[test]
fn test_migration_history_recorded() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    set_contract_version(&env, 1);
    run_migration(&env, 2);

    let history: Option<MigrationRecord> = get_migration_history(&env, 1);
    assert!(history.is_some());
    let record = history.unwrap();
    assert_eq!(record.from_version, 1);
    assert_eq!(record.to_version, 2);
}

/// Test: upgrade_contract requires admin authorization
#[test]
fn test_upgrade_requires_admin() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);
    let wasm_hash = BytesN::from_array(&env, &[0u8; 32]);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        upgrade_contract(&env, non_admin, wasm_hash);
    }));
    assert!(result.is_err());
}

/// Test: run_migration does nothing when versions match
#[test]
fn test_run_migration_noop_when_current() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    set_contract_version(&env, 5);
    let applied = run_migration(&env, 5);
    assert_eq!(applied, 0);
    assert_eq!(get_contract_version(&env), 5);
}

/// Test: run_migration when stored version > code version (downgrade scenario)
#[test]
fn test_run_migration_noop_when_stored_newer() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    set_contract_version(&env, 5);
    let applied = run_migration(&env, 3); // Code is older than stored
    assert_eq!(applied, 0);
    assert_eq!(get_contract_version(&env), 5); // Version unchanged
}
