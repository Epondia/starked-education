#![cfg(test)]

use crate::credential_registry::{
    batch_issue_credentials, batch_renew_credentials, batch_revoke_credentials, get_credential,
    get_credential_count, get_revocation_history, is_credential_valid,
    issue_credential_with_expiration, revoke_credential, verify_credential, BatchIssueInput,
    BatchRenewInput, BatchResult, CredentialStatus, RegistryRevocationRecord,
    RegistryVerificationResult, RevocationReason,
};
use crate::pause::{init_pause, is_paused, pause, unpause};
use crate::StarkEdContract;
use soroban_sdk::{testutils::Address as _, Address, Env, String, Symbol, Vec};

// ═══════════════════════════════════════════════════════════════════
//  Test harness
// ═══════════════════════════════════════════════════════════════════

/// Run `f` inside a contract execution context bound to `contract`.
///
/// The `credential_registry` (and `pause`) modules store data in `persistent` /
/// `instance` storage, which requires a "current contract" to be associated with
/// the `Env`. Plain `Env::default()` has no running contract, so every
/// storage-touching call must execute within `env.as_contract(..)`. The same
/// `contract` address is reused across calls within a test so that written data
/// remains visible.
fn with_contract<F, R>(env: &Env, contract: &Address, f: F) -> R
where
    F: FnOnce() -> R,
{
    env.as_contract(contract, f)
}

/// Set up an `Env` with `mock_all_auths`, a stored admin, a registered contract
/// address (used as the storage context) and the pause module initialized to
/// that admin.
fn setup_env() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract = env.register_contract(None, StarkEdContract);
    with_contract(&env, &contract, || {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &admin);
        init_pause(&env, admin.clone());
    });

    (env, admin, contract)
}

/// Shorthand for creating a Soroban `String` in tests.
fn s(env: &Env, text: &str) -> String {
    String::from_str(env, text)
}

fn make_issue_input(
    recipient: Address,
    title: String,
    description: String,
    course_id: String,
    ipfs_hash: String,
    validity_duration: u64,
) -> BatchIssueInput {
    BatchIssueInput {
        recipient,
        title,
        description,
        course_id,
        ipfs_hash,
        validity_duration,
    }
}

fn make_renew_input(credential_id: u64, extension_duration: u64) -> BatchRenewInput {
    BatchRenewInput {
        credential_id,
        extension_duration,
    }
}

fn count_successes(results: &Vec<BatchResult>) -> u32 {
    let mut count = 0u32;
    for i in 0..results.len() {
        if results.get(i).unwrap().success {
            count += 1;
        }
    }
    count
}

/// Issue a single active credential and return its id.
fn issue_one(env: &Env, contract: &Address, admin: &Address) -> u64 {
    with_contract(env, contract, || {
        issue_credential_with_expiration(
            env,
            admin.clone(),
            Address::generate(env),
            s(env, "Title"),
            s(env, "Desc"),
            s(env, "c1"),
            s(env, "ipfs://1"),
            3600,
        )
    })
}

// ═══════════════════════════════════════════════════════════════════
//  Core credential lifecycle
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_issue_credential_is_active_and_counted() {
    let (env, admin, contract) = setup_env();

    let cred_id = issue_one(&env, &contract, &admin);
    assert!(cred_id > 0);
    assert_eq!(
        with_contract(&env, &contract, || get_credential_count(&env)),
        1
    );

    let cred = with_contract(&env, &contract, || get_credential(&env, cred_id));
    assert_eq!(cred.status, CredentialStatus::Active);
    assert!(with_contract(&env, &contract, || is_credential_valid(
        &env, cred_id
    )));
}

#[test]
fn test_verify_active_credential_reports_valid() {
    let (env, admin, contract) = setup_env();
    let cred_id = issue_one(&env, &contract, &admin);

    let result = with_contract(&env, &contract, || verify_credential(&env, cred_id));
    assert!(matches!(result, RegistryVerificationResult::Valid));
}

#[test]
fn test_revoke_stores_on_chain_and_reports_revoked() {
    let (env, admin, contract) = setup_env();
    let cred_id = issue_one(&env, &contract, &admin);

    with_contract(&env, &contract, || {
        revoke_credential(
            &env,
            cred_id,
            admin.clone(),
            RevocationReason::AcademicDishonesty,
            Some(s(&env, "Cheating on final exam")),
        )
    });

    let record: Option<RegistryRevocationRecord> =
        with_contract(&env, &contract, || get_revocation_history(&env, cred_id));
    assert!(record.is_some());

    // verify_credential surfaces the revoked state.
    let result = with_contract(&env, &contract, || verify_credential(&env, cred_id));
    assert!(matches!(result, RegistryVerificationResult::Revoked(_, _)));
    assert!(!with_contract(&env, &contract, || is_credential_valid(
        &env, cred_id
    )));
}

#[test]
fn test_batch_issue_and_revoke() {
    let (env, admin, contract) = setup_env();

    let mut inputs = Vec::new(&env);
    for _ in 0..5u32 {
        inputs.push_back(make_issue_input(
            Address::generate(&env),
            s(&env, "Title"),
            s(&env, "Desc"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        ));
    }
    let results = with_contract(&env, &contract, || {
        batch_issue_credentials(&env, admin.clone(), inputs)
    });
    assert_eq!(count_successes(&results), 5);

    let mut ids = Vec::new(&env);
    for i in 0..5u32 {
        ids.push_back(results.get(i).unwrap().credential_id);
    }
    let revoke_results = with_contract(&env, &contract, || {
        batch_revoke_credentials(&env, admin.clone(), ids)
    });
    assert_eq!(count_successes(&revoke_results), 5);
}

#[test]
fn test_batch_renew_extends_expiry() {
    let (env, admin, contract) = setup_env();
    let cred_id = issue_one(&env, &contract, &admin);

    let renewals = Vec::from_array(&env, [make_renew_input(cred_id, 31_536_000)]);
    let results = with_contract(&env, &contract, || {
        batch_renew_credentials(&env, admin.clone(), renewals)
    });
    assert_eq!(count_successes(&results), 1);
}

#[test]
#[should_panic]
fn test_unauthorized_revocation_panics() {
    let (env, admin, contract) = setup_env();
    let cred_id = issue_one(&env, &contract, &admin);
    let attacker = Address::generate(&env);

    with_contract(&env, &contract, || {
        revoke_credential(&env, cred_id, attacker, RevocationReason::Other, None)
    });
}

// ═══════════════════════════════════════════════════════════════════
//  Issue #317 — Pause / emergency-stop capability
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_admin_can_pause_and_unpause() {
    let (env, admin, contract) = setup_env();
    assert!(!with_contract(&env, &contract, || is_paused(&env)));

    with_contract(&env, &contract, || pause(&env, admin.clone()).unwrap());
    assert!(with_contract(&env, &contract, || is_paused(&env)));

    with_contract(&env, &contract, || unpause(&env, admin.clone()).unwrap());
    assert!(!with_contract(&env, &contract, || is_paused(&env)));
}

#[test]
fn test_non_admin_cannot_pause() {
    let (env, _admin, contract) = setup_env();
    let attacker = Address::generate(&env);

    let result = with_contract(&env, &contract, || pause(&env, attacker));
    assert!(result.is_err());
    assert!(!with_contract(&env, &contract, || is_paused(&env)));
}

#[test]
#[should_panic]
fn test_state_changing_rejected_while_paused() {
    let (env, admin, contract) = setup_env();
    let cred_id = issue_one(&env, &contract, &admin);

    with_contract(&env, &contract, || pause(&env, admin.clone()).unwrap());
    assert!(with_contract(&env, &contract, || is_paused(&env)));

    // Any state-changing entry point must be rejected (panic) while paused.
    with_contract(&env, &contract, || {
        revoke_credential(&env, cred_id, admin.clone(), RevocationReason::Other, None)
    });
}

#[test]
fn test_reads_work_while_paused() {
    let (env, admin, contract) = setup_env();
    let cred_id = issue_one(&env, &contract, &admin);

    with_contract(&env, &contract, || pause(&env, admin.clone()).unwrap());

    // Reads must continue to work while paused.
    let cred = with_contract(&env, &contract, || get_credential(&env, cred_id));
    assert_eq!(cred.status, CredentialStatus::Active);

    let result = with_contract(&env, &contract, || verify_credential(&env, cred_id));
    assert!(matches!(result, RegistryVerificationResult::Valid));

    assert!(with_contract(&env, &contract, || is_credential_valid(
        &env, cred_id
    )));
    assert_eq!(
        with_contract(&env, &contract, || get_credential_count(&env)),
        1
    );
}

#[test]
fn test_resume_after_unpause_restores_operations() {
    let (env, admin, contract) = setup_env();
    let cred_id = issue_one(&env, &contract, &admin);

    with_contract(&env, &contract, || pause(&env, admin.clone()).unwrap());

    // While paused, credential state must remain unchanged.
    assert_eq!(
        with_contract(&env, &contract, || get_credential(&env, cred_id)).status,
        CredentialStatus::Active
    );

    // Unpause and confirm operations resume without state loss.
    with_contract(&env, &contract, || unpause(&env, admin.clone()).unwrap());
    assert!(!with_contract(&env, &contract, || is_paused(&env)));

    with_contract(&env, &contract, || {
        revoke_credential(&env, cred_id, admin.clone(), RevocationReason::Other, None)
    });
    assert!(with_contract(&env, &contract, || !is_credential_valid(
        &env, cred_id
    )));
}
