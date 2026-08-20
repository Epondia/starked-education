#![cfg(test)]

use crate::credential_registry::{
    batch_issue_credentials, batch_renew_credentials, batch_revoke_credentials,
    get_credential, get_credential_count, get_renewal_history, get_revocation_history,
    get_user_credentials, is_credential_valid, issue_credential_with_expiration,
    revoke_credential, set_max_batch_size, verify_credential, BatchIssueInput,
    BatchRenewInput, BatchResult, CredentialStatus, RegistryRevocationRecord,
    RegistryVerificationResult, RevocationReason,
};
use crate::StarkEdContract;
use soroban_sdk::{
    testutils::Address as _, testutils::Ledger as _, Address, Env, String, Symbol, Vec,
};

// ═══════════════════════════════════════════════════════════════════
//  Test harness
// ═══════════════════════════════════════════════════════════════════

/// Run `f` inside a contract execution context bound to `contract`.
///
/// The `credential_registry` module stores data in `persistent` storage, which
/// requires a "current contract" to be associated with the `Env`. Plain
/// `Env::default()` has no running contract, so every storage-touching call must
/// execute within `env.as_contract(..)`. The same `contract` address is reused
/// across calls within a test so that written data remains visible.
fn with_contract<F, R>(env: &Env, contract: &Address, f: F) -> R
where
    F: FnOnce() -> R,
{
    env.as_contract(contract, f)
}

/// Set up an `Env` with `mock_all_auths` enabled, a stored admin, and a stable
/// contract address used for all `persistent` storage in the test. The contract
/// is registered so that `Env::as_contract` provides a real storage context.
fn setup_env() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract = env.register_contract(None, StarkEdContract);
    with_contract(&env, &contract, || {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &admin);
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

// ═══════════════════════════════════════════════════════════════════
//  Core credential lifecycle
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_issue_credential_is_active_and_counted() {
    let (env, admin, contract) = setup_env();

    let cred_id = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            Address::generate(&env),
            s(&env, "Title"),
            s(&env, "Desc"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )
    });

    assert!(cred_id > 0);
    assert_eq!(with_contract(&env, &contract, || get_credential_count(&env)), 1);

    let cred = with_contract(&env, &contract, || get_credential(&env, cred_id));
    assert_eq!(cred.status, CredentialStatus::Active);
    assert_eq!(cred.renewal_count, 0);

    assert!(with_contract(&env, &contract, || is_credential_valid(&env, cred_id)));
}

#[test]
fn test_verify_active_credential_reports_valid() {
    let (env, admin, contract) = setup_env();
    let cred_id = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            Address::generate(&env),
            s(&env, "Title"),
            s(&env, "Desc"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )
    });

    let result = with_contract(&env, &contract, || verify_credential(&env, cred_id));
    assert!(matches!(result, RegistryVerificationResult::Valid));
}

#[test]
fn test_expired_credential_is_reported_as_expired() {
    let (env, admin, contract) = setup_env();
    let cred_id = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            Address::generate(&env),
            s(&env, "Title"),
            s(&env, "Desc"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )
    });

    // Advance ledger time beyond the credential's validity window.
    let now = env.ledger().timestamp();
    let mut ledger = env.ledger().get();
    ledger.timestamp = now + 7200;
    env.ledger().set(ledger);

    let status = with_contract(&env, &contract, || {
        let st = crate::credential_registry::check_credential_expiration(&env, cred_id);
        st
    });
    assert_eq!(status, CredentialStatus::Expired);

    let result = with_contract(&env, &contract, || verify_credential(&env, cred_id));
    assert!(matches!(result, RegistryVerificationResult::Expired));
}

#[test]
fn test_user_credentials_are_tracked() {
    let (env, admin, contract) = setup_env();
    let recipient = Address::generate(&env);

    let _cred_id = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            recipient.clone(),
            s(&env, "Title"),
            s(&env, "Desc"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )
    });

    let user_creds = with_contract(&env, &contract, || get_user_credentials(&env, recipient));
    assert_eq!(user_creds.len(), 1);
}

// ═══════════════════════════════════════════════════════════════════
//  Batch operations
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_batch_issue_credentials_all_succeed() {
    let (env, admin, contract) = setup_env();

    let mut inputs = Vec::new(&env);
    for _ in 0..10u32 {
        inputs.push_back(make_issue_input(
            Address::generate(&env),
            s(&env, "Title"),
            s(&env, "Desc"),
            s(&env, "course-x"),
            s(&env, "ipfs://hash"),
            3600,
        ));
    }

    let results = with_contract(&env, &contract, || {
        batch_issue_credentials(&env, admin.clone(), inputs)
    });

    assert_eq!(results.len(), 10);
    assert_eq!(count_successes(&results), 10);
    assert_eq!(with_contract(&env, &contract, || get_credential_count(&env)), 10);
}

#[test]
fn test_batch_issue_skips_invalid_entry() {
    let (env, admin, contract) = setup_env();

    let inputs = Vec::from_array(
        &env,
        [
            make_issue_input(
                Address::generate(&env),
                s(&env, "Valid"),
                s(&env, "Desc"),
                s(&env, "c1"),
                s(&env, "ipfs://1"),
                3600,
            ),
            // Invalid: zero validity duration
            make_issue_input(
                Address::generate(&env),
                s(&env, "Invalid"),
                s(&env, "Desc"),
                s(&env, "c2"),
                s(&env, "ipfs://2"),
                0,
            ),
        ],
    );

    let results = with_contract(&env, &contract, || {
        batch_issue_credentials(&env, admin.clone(), inputs)
    });

    assert_eq!(results.len(), 2);
    assert!(results.get(0).unwrap().success);
    assert!(!results.get(1).unwrap().success);
    assert_eq!(with_contract(&env, &contract, || get_credential_count(&env)), 1);
}

#[test]
fn test_batch_revoke_credentials() {
    let (env, admin, contract) = setup_env();

    let mut ids = Vec::new(&env);
    for _ in 0..5u32 {
        let id = with_contract(&env, &contract, || {
            issue_credential_with_expiration(
                &env,
                admin.clone(),
                Address::generate(&env),
                s(&env, "Title"),
                s(&env, "Desc"),
                s(&env, "c1"),
                s(&env, "ipfs://1"),
                3600,
            )
        });
        ids.push_back(id);
    }

    let results = with_contract(&env, &contract, || {
        batch_revoke_credentials(&env, admin.clone(), ids.clone())
    });

    assert_eq!(count_successes(&results), 5);
    for id in ids.iter() {
        let cred = with_contract(&env, &contract, || get_credential(&env, id));
        assert_eq!(cred.status, CredentialStatus::Revoked);
    }
}

#[test]
fn test_batch_revoke_partial_success() {
    let (env, admin, contract) = setup_env();
    let recipient = Address::generate(&env);

    let id1 = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            recipient.clone(),
            s(&env, "C1"),
            s(&env, "D1"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )
    });
    let id2 = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            recipient.clone(),
            s(&env, "C2"),
            s(&env, "D2"),
            s(&env, "c2"),
            s(&env, "ipfs://2"),
            3600,
        )
    });

    // Revoke id2 individually first.
    with_contract(&env, &contract, || {
        revoke_credential(
            &env,
            id2,
            admin.clone(),
            RevocationReason::Other,
            None,
        )
    });

    let batch_ids = Vec::from_array(&env, [id1, id2, 9999u64]);
    let results = with_contract(&env, &contract, || {
        batch_revoke_credentials(&env, admin.clone(), batch_ids)
    });

    assert_eq!(results.len(), 3);
    assert!(results.get(0).unwrap().success); // id1 revoked
    assert!(!results.get(1).unwrap().success); // id2 already revoked
    assert!(!results.get(2).unwrap().success); // 9999 not found
}

#[test]
fn test_batch_renew_extends_expiry() {
    let (env, admin, contract) = setup_env();

    let id = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            Address::generate(&env),
            s(&env, "Title"),
            s(&env, "Desc"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )
    });

    let renewals = Vec::from_array(&env, [make_renew_input(id, 31_536_000)]);
    let results = with_contract(&env, &contract, || {
        batch_renew_credentials(&env, admin.clone(), renewals)
    });

    assert_eq!(count_successes(&results), 1);

    let cred = with_contract(&env, &contract, || get_credential(&env, id));
    assert_eq!(cred.status, CredentialStatus::Active);
    assert_eq!(cred.renewal_count, 1);

    let history = with_contract(&env, &contract, || get_renewal_history(&env, id));
    assert_eq!(history.len(), 1);
}

#[test]
fn test_batch_renew_skips_revoked() {
    let (env, admin, contract) = setup_env();
    let recipient = Address::generate(&env);

    let id1 = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            recipient.clone(),
            s(&env, "C1"),
            s(&env, "D1"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )
    });
    let id2 = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            recipient.clone(),
            s(&env, "C2"),
            s(&env, "D2"),
            s(&env, "c2"),
            s(&env, "ipfs://2"),
            3600,
        )
    });

    with_contract(&env, &contract, || {
        revoke_credential(
            &env,
            id2,
            admin.clone(),
            RevocationReason::Other,
            None,
        )
    });

    let renewals = Vec::from_array(
        &env,
        [make_renew_input(id1, 7200), make_renew_input(id2, 7200)],
    );
    let results = with_contract(&env, &contract, || {
        batch_renew_credentials(&env, admin.clone(), renewals)
    });

    assert!(results.get(0).unwrap().success);
    assert!(!results.get(1).unwrap().success);
}

#[test]
#[should_panic]
fn test_batch_issue_exceeding_max_batch_size_rejected() {
    let (env, admin, contract) = setup_env();

    let mut inputs = Vec::new(&env);
    for _ in 0..101u32 {
        inputs.push_back(make_issue_input(
            Address::generate(&env),
            s(&env, "Title"),
            s(&env, "Desc"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        ));
    }

    with_contract(&env, &contract, || {
        batch_issue_credentials(&env, admin, inputs);
    });
}

#[test]
#[should_panic]
fn test_unauthorized_batch_issue_rejected() {
    let (env, _admin, contract) = setup_env();
    let unauthorized = Address::generate(&env);

    let inputs = Vec::from_array(
        &env,
        [make_issue_input(
            Address::generate(&env),
            s(&env, "Title"),
            s(&env, "Desc"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )],
    );

    with_contract(&env, &contract, || {
        batch_issue_credentials(&env, unauthorized, inputs);
    });
}

// ═══════════════════════════════════════════════════════════════════
//  Issue #320 — Revocation Registry with Timestamps
// ═══════════════════════════════════════════════════════════════════

/// A revoked credential must store its timestamp and reason on-chain.
#[test]
fn test_revocation_stores_timestamp_and_reason_on_chain() {
    let (env, admin, contract) = setup_env();
    let recipient = Address::generate(&env);

    let cred_id = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            recipient,
            s(&env, "Revokable"),
            s(&env, "Test revocation metadata"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )
    });

    let before_revoke = env.ledger().timestamp();
    with_contract(&env, &contract, || {
        revoke_credential(
            &env,
            cred_id,
            admin.clone(),
            RevocationReason::AcademicDishonesty,
            Some(s(&env, "Cheating on final exam")),
        )
    });
    let after_revoke = env.ledger().timestamp();

    let record: Option<RegistryRevocationRecord> =
        with_contract(&env, &contract, || get_revocation_history(&env, cred_id));
    assert!(record.is_some());

    let rec = record.unwrap();
    assert!(rec.timestamp >= before_revoke);
    assert!(rec.timestamp <= after_revoke);
    assert_eq!(
        rec.reason_code,
        RevocationReason::AcademicDishonesty.to_u8() as u32
    );
    assert_eq!(rec.reason_str, s(&env, "Cheating on final exam"));
    assert_eq!(rec.revoker, admin);
}

/// `verify_credential` must surface the revocation reason code, timestamp and note.
#[test]
fn test_verify_credential_reports_revocation_details() {
    let (env, admin, contract) = setup_env();
    let recipient = Address::generate(&env);

    let cred_id = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            recipient,
            s(&env, "Revokable"),
            s(&env, "Test verify revocation"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )
    });

    let revoke_time = env.ledger().timestamp();
    with_contract(&env, &contract, || {
        revoke_credential(
            &env,
            cred_id,
            admin.clone(),
            RevocationReason::DataCorrection,
            Some(s(&env, "Incorrect grade recorded")),
        )
    });

    let result = with_contract(&env, &contract, || verify_credential(&env, cred_id));
    match result {
        RegistryVerificationResult::Revoked(details) => {
            assert_eq!(
                details.reason_code,
                RevocationReason::DataCorrection.to_u8() as u32
            );
            assert_eq!(details.timestamp, revoke_time);
            assert_eq!(details.reason_str, s(&env, "Incorrect grade recorded"));
        }
        _ => panic!("Expected Revoked variant, got {:?}", result),
    }
}

/// A revoked credential must fail verification (i.e. not report Valid).
#[test]
fn test_verify_credential_revoked_fails_validation() {
    let (env, admin, contract) = setup_env();
    let recipient = Address::generate(&env);

    let cred_id = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            recipient,
            s(&env, "Revokable"),
            s(&env, "Test revoked fails"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )
    });

    with_contract(&env, &contract, || {
        revoke_credential(
            &env,
            cred_id,
            admin.clone(),
            RevocationReason::AdministrativeError,
            None,
        )
    });

    let result = with_contract(&env, &contract, || verify_credential(&env, cred_id));
    assert!(matches!(result, RegistryVerificationResult::Revoked(_)));
    assert!(!with_contract(&env, &contract, || is_credential_valid(&env, cred_id)));
}

/// Revoking an already-revoked credential must panic (revocation is irreversible).
#[test]
#[should_panic]
fn test_revoking_already_revoked_credential_panics() {
    let (env, admin, contract) = setup_env();
    let recipient = Address::generate(&env);

    let cred_id = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            recipient,
            s(&env, "Revokable"),
            s(&env, "Test double revoke"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )
    });

    with_contract(&env, &contract, || {
        revoke_credential(
            &env,
            cred_id,
            admin.clone(),
            RevocationReason::Other,
            None,
        )
    });

    // Second revocation should panic.
    with_contract(&env, &contract, || {
        revoke_credential(
            &env,
            cred_id,
            admin.clone(),
            RevocationReason::Other,
            None,
        )
    });
}

/// Distinct `None` vs explicit reason must be preserved through storage and `verify`.
#[test]
fn test_revocation_with_empty_reason_str() {
    let (env, admin, contract) = setup_env();
    let recipient = Address::generate(&env);

    let cred_id = with_contract(&env, &contract, || {
        issue_credential_with_expiration(
            &env,
            admin.clone(),
            recipient,
            s(&env, "Revokable"),
            s(&env, "Test empty reason"),
            s(&env, "c1"),
            s(&env, "ipfs://1"),
            3600,
        )
    });

    with_contract(&env, &contract, || {
        revoke_credential(
            &env,
            cred_id,
            admin.clone(),
            RevocationReason::VoluntarySurrender,
            None,
        )
    });

    let record: Option<RegistryRevocationRecord> =
        with_contract(&env, &contract, || get_revocation_history(&env, cred_id));
    assert!(record.is_some());
    let rec = record.unwrap();
    assert_eq!(rec.reason_str, s(&env, ""));
    assert_eq!(
        rec.reason_code,
        RevocationReason::VoluntarySurrender.to_u8() as u32
    );

    let result = with_contract(&env, &contract, || verify_credential(&env, cred_id));
    match result {
        RegistryVerificationResult::Revoked(details) => {
            assert_eq!(details.reason_str, s(&env, ""));
        }
        _ => panic!("Expected Revoked variant"),
    }
}
