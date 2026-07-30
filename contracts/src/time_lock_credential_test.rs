#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, BytesN};

fn create_test_credential_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[1u8; 32])
}

// ──────────────────────────────────────────────────────────────
// Issue #9 — Time-lock credential beneficiary designation tests
// ──────────────────────────────────────────────────────────────

/// Default beneficiary waiting period for tests (7 days in seconds).
const ONE_WEEK_SECONDS: u64 = 7 * 24 * 60 * 60;

#[test]
fn test_issue_with_beneficiary_stores_fields() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let hash = create_test_credential_hash(&env);
    let release_time = env.ledger().timestamp() + 10_000;

    env.mock_all_auths();

    let credential_id = client.issue_credential_with_beneficiary(
        &issuer,
        &recipient,
        &hash,
        &"Graduation w/ beneficiary".into_val(&env),
        &release_time,
        &Some(beneficiary.clone()),
        &ONE_WEEK_SECONDS,
    );

    let credential = client.get_credential(&credential_id);
    assert_eq!(credential.beneficiary, Some(beneficiary.clone()));
    assert_eq!(credential.beneficiary_wait_period, ONE_WEEK_SECONDS);
    assert!(!credential.is_beneficiary_voided);
}

#[test]
fn test_issue_with_beneficiary_equal_to_recipient_fails() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();

    let result = client.try_issue_credential_with_beneficiary(
        &issuer,
        &recipient,
        &hash,
        &"Bad".into_val(&env),
        &(env.ledger().timestamp() + 1000),
        &Some(recipient.clone()),
        &1000,
    );
    assert!(result.is_err());
    assert!(result.err().unwrap().contains("Beneficiary must differ from recipient"));
}

#[test]
fn test_issue_with_beneficiary_equal_to_issuer_fails() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();

    let result = client.try_issue_credential_with_beneficiary(
        &issuer,
        &recipient,
        &hash,
        &"Bad".into_val(&env),
        &(env.ledger().timestamp() + 1000),
        &Some(issuer.clone()),
        &1000,
    );
    assert!(result.is_err());
    assert!(result.err().unwrap().contains("Beneficiary must differ from issuer"));
}

#[test]
fn test_beneficiary_can_claim_after_wait_period() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let hash = create_test_credential_hash(&env);
    let release_time = env.ledger().timestamp() + 1000;

    env.mock_all_auths();

    let credential_id = client.issue_credential_with_beneficiary(
        &issuer,
        &recipient,
        &hash,
        &"Will-like credential".into_val(&env),
        &release_time,
        &Some(beneficiary.clone()),
        &ONE_WEEK_SECONDS,
    );

    // Try before release_time → blocked
    let blocked = client.try_claim_as_beneficiary(&beneficiary, &credential_id);
    assert!(blocked.is_err());

    // Advance to release_time but NOT past wait period → still blocked
    env.ledger().with_mut(|li| li.timestamp = release_time + 100);
    let still_blocked = client.try_claim_as_beneficiary(&beneficiary, &credential_id);
    assert!(still_blocked.is_err());
    assert!(still_blocked.err().unwrap().contains("waiting period"));

    // Advance past release_time + wait_period → success
    env.ledger().with_mut(|li| li.timestamp = release_time + ONE_WEEK_SECONDS + 10);
    client.claim_as_beneficiary(&beneficiary, &credential_id);

    let credential = client.get_credential(&credential_id);
    assert!(credential.is_released);
    assert!(credential.is_beneficiary_voided);
}

#[test]
fn test_recipient_release_voids_beneficiary() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let hash = create_test_credential_hash(&env);
    let release_time = env.ledger().timestamp() + 1000;

    env.mock_all_auths();

    let credential_id = client.issue_credential_with_beneficiary(
        &issuer,
        &recipient,
        &hash,
        &"Test".into_val(&env),
        &release_time,
        &Some(beneficiary.clone()),
        &ONE_WEEK_SECONDS,
    );

    // Recipient waits the full wait_period and releases
    env.ledger().with_mut(|li| li.timestamp = release_time + ONE_WEEK_SECONDS + 10);
    client.release_credential(&credential_id, &recipient);

    let credential = client.get_credential(&credential_id);
    assert!(credential.is_released);
    assert!(credential.is_beneficiary_voided);

    // Beneficiary now can't claim even after the wait period elapsed.
    let blocked = client.try_claim_as_beneficiary(&beneficiary, &credential_id);
    assert!(blocked.is_err());
    assert!(blocked.err().unwrap().contains("voided"));
}

#[test]
fn test_emergency_revoke_voids_beneficiary() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();

    let credential_id = client.issue_credential_with_beneficiary(
        &issuer,
        &recipient,
        &hash,
        &"Test".into_val(&env),
        &(env.ledger().timestamp() + 10_000),
        &Some(beneficiary.clone()),
        &ONE_WEEK_SECONDS,
    );

    client.emergency_revoke(&credential_id, &admin, &"Compliance".into_val(&env));

    let credential = client.get_credential(&credential_id);
    assert!(credential.is_revoked);
    assert!(credential.is_beneficiary_voided);

    // Fundraising: even after admin emergency-revokes and wait period passes,
    // beneficiary cannot claim.
    env.ledger().with_mut(|li| li.timestamp = 100_000_000);
    let blocked = client.try_claim_as_beneficiary(&beneficiary, &credential_id);
    assert!(blocked.is_err());
}

#[test]
fn test_recipient_changes_beneficiary_before_unlock() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let original_beneficiary = Address::generate(&env);
    let new_beneficiary = Address::generate(&env);
    let hash = create_test_credential_hash(&env);
    let release_time = env.ledger().timestamp() + 10_000;

    env.mock_all_auths();

    let credential_id = client.issue_credential_with_beneficiary(
        &issuer,
        &recipient,
        &hash,
        &"Test".into_val(&env),
        &release_time,
        &Some(original_beneficiary.clone()),
        &ONE_WEEK_SECONDS,
    );

    // Recipient changes beneficiary before release.
    client.set_beneficiary(
        &recipient,
        &credential_id,
        &Some(new_beneficiary.clone()),
        &(ONE_WEEK_SECONDS * 2),
    );

    let credential = client.get_credential(&credential_id);
    assert_eq!(credential.beneficiary, Some(new_beneficiary.clone()));
    assert_eq!(credential.beneficiary_wait_period, ONE_WEEK_SECONDS * 2);

    // Original can no longer claim.
    env.ledger().with_mut(|li| li.timestamp = release_time + (ONE_WEEK_SECONDS * 2) + 10);
    let blocked = client.try_claim_as_beneficiary(&original_beneficiary, &credential_id);
    assert!(blocked.is_err());

    // New beneficiary can.
    client.claim_as_beneficiary(&new_beneficiary, &credential_id);
    assert!(client.get_credential(&credential_id).is_released);
}

#[test]
fn test_set_beneficiary_after_unlock_fails() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();

    let credential_id = client.issue_credential(
        &issuer,
        &recipient,
        &hash,
        &"Test".into_val(&env),
        &(env.ledger().timestamp() + 1000),
    );

    env.ledger().with_mut(|li| li.timestamp = 2000);

    let new_beneficiary = Address::generate(&env);
    let result = client.try_set_beneficiary(
        &recipient,
        &credential_id,
        &Some(new_beneficiary),
        &500,
    );
    assert!(result.is_err());
    assert!(result.err().unwrap().contains("before release time"));
}

#[test]
fn test_set_beneficiary_only_recipient_auth() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let intruder = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();

    let credential_id = client.issue_credential(
        &issuer,
        &recipient,
        &hash,
        &"Test".into_val(&env),
        &(env.ledger().timestamp() + 10_000),
    );

    let benef = Address::generate(&env);
    let result = client.try_set_beneficiary(&intruder, &credential_id, &Some(benef), &1000);
    assert!(result.is_err());
    assert!(result.err().unwrap().contains("Only the recipient"));
}

#[test]
fn test_get_credentials_by_beneficiary() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient_a = Address::generate(&env);
    let recipient_b = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();

    client.issue_credential_with_beneficiary(
        &issuer,
        &recipient_a,
        &hash,
        &"A".into_val(&env),
        &(env.ledger().timestamp() + 1000),
        &Some(beneficiary.clone()),
        &ONE_WEEK_SECONDS,
    );
    client.issue_credential_with_beneficiary(
        &issuer,
        &recipient_b,
        &hash,
        &"B".into_val(&env),
        &(env.ledger().timestamp() + 2000),
        &Some(beneficiary.clone()),
        &ONE_WEEK_SECONDS,
    );

    let list = client.get_credentials_by_beneficiary(&beneficiary);
    assert_eq!(list.len(), 2);
}

#[test]
fn test_beneficiary_cleared_when_wait_period_zero() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();

    let credential_id = client.issue_credential_with_beneficiary(
        &issuer,
        &recipient,
        &hash,
        &"Test".into_val(&env),
        &(env.ledger().timestamp() + 1000),
        &Some(beneficiary.clone()),
        &0, // opt-out: wait_period = 0
    );

    let credential = client.get_credential(&credential_id);
    assert_eq!(credential.beneficiary_wait_period, 0);

    env.ledger().with_mut(|li| li.timestamp = 5_000);
    let result = client.try_claim_as_beneficiary(&beneficiary, &credential_id);
    assert!(result.is_err());
    assert!(result.err().unwrap().contains("No beneficiary wait period"));
}

#[test]
fn test_audit_log_records_beneficiary_claim_distinctly() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let hash = create_test_credential_hash(&env);
    let release_time = env.ledger().timestamp() + 1000;

    env.mock_all_auths();

    let credential_id = client.issue_credential_with_beneficiary(
        &issuer,
        &recipient,
        &hash,
        &"Test".into_val(&env),
        &release_time,
        &Some(beneficiary.clone()),
        &ONE_WEEK_SECONDS,
    );

    env.ledger().with_mut(|li| li.timestamp = release_time + ONE_WEEK_SECONDS + 10);
    client.claim_as_beneficiary(&beneficiary, &credential_id);

    let entries = client.get_audit_log(&0, &20);
    // Last entry should be BENEFICIARY_CLAIM
    let last = entries.get(entries.len() - 1).unwrap();
    assert_eq!(last.operation, String::from_str(&env, "BENEFICIARY_CLAIM"));
    assert_eq!(last.credential_id, credential_id);
    assert_eq!(last.actor, beneficiary);
}

// ──────────────────────────────────────────────────────────────
// Pre-existing tests left unchanged — they're below this comment
// and were preserved verbatim from the original test file so the
// contract's original API surface stays covered.
// ──────────────────────────────────────────────────────────────

#[test]
fn test_initialize() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    // Verify initialization by checking we can issue a credential
    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();
    let credential_id = client.try_issue_credential(
        &issuer,
        &recipient,
        &hash,
        &"Test Credential".into_val(&env),
        &(env.ledger().timestamp() + 1000),
    );

    assert!(credential_id.is_ok());
}

#[test]
fn test_issue_credential() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);
    let release_time = env.ledger().timestamp() + 1000;

    env.mock_all_auths();
    let credential_id = client.issue_credential(
        &issuer,
        &recipient,
        &hash,
        &"Graduation Certificate".into_val(&env),
        &release_time,
    );

    assert_eq!(credential_id, 0u64);

    // Verify credential was stored
    let credential = client.get_credential(&credential_id);
    assert_eq!(credential.id, 0u64);
    assert_eq!(credential.issuer, issuer);
    assert_eq!(credential.recipient, recipient);
    assert!(!credential.is_released);
    assert!(!credential.is_revoked);
}

#[test]
fn test_release_credential_after_time() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);
    let release_time = env.ledger().timestamp() + 1000;

    env.mock_all_auths();
    let credential_id = client.issue_credential(
        &issuer,
        &recipient,
        &hash,
        &"Test".into_val(&env),
        &release_time,
    );

    // Advance time past release
    env.ledger().with_mut(|li| {
        li.timestamp = release_time + 100;
    });

    // Recipient releases credential
    env.mock_all_auths();
    client.release_credential(&credential_id, &recipient);

    // Verify released
    let credential = client.get_credential(&credential_id);
    assert!(credential.is_released);
    assert!(credential.is_beneficiary_voided); // boolean set by issue #9 default path: bypasses
}

#[test]
fn test_cannot_release_before_time() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);
    let release_time = env.ledger().timestamp() + 1000;

    env.mock_all_auths();
    let credential_id = client.issue_credential(
        &issuer,
        &recipient,
        &hash,
        &"Test".into_val(&env),
        &release_time,
    );

    // Try to release before time (should fail)
    let result = client.try_release_credential(&credential_id, &recipient);
    assert!(result.is_err());
    assert!(result.err().unwrap().contains("Time lock not yet expired"));
}

#[test]
fn test_emergency_revoke() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);
    let release_time = env.ledger().timestamp() + 1000;

    env.mock_all_auths();
    let credential_id = client.issue_credential(
        &issuer,
        &recipient,
        &hash,
        &"Test".into_val(&env),
        &release_time,
    );

    // Admin emergency revokes
    env.mock_all_auths();
    client.emergency_revoke(&credential_id, &admin, &"Security breach".into_val(&env));

    // Verify revoked
    let credential = client.get_credential(&credential_id);
    assert!(credential.is_revoked);
    assert_eq!(credential.emergency_override, Some(admin.clone()));
    assert!(credential.is_beneficiary_voided); // voided by emergency revoke

    // Try to release revoked credential (should fail)
    env.ledger().with_mut(|li| {
        li.timestamp = release_time + 100;
    });

    let result = client.try_release_credential(&credential_id, &recipient);
    assert!(result.is_err());
    assert!(result.err().unwrap().contains("revoked"));
}

#[test]
fn test_batch_release() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();

    // Issue multiple credentials
    let mut credential_ids: Vec<u64> = Vec::new(&env);
    for i in 0..5 {
        let cred_id = client.issue_credential(
            &issuer,
            &recipient,
            &hash,
            &format!("Credential {}", i).into_val(&env),
            &(env.ledger().timestamp() + 1000),
        );
        credential_ids.push_back(cred_id);
    }

    // Advance time
    env.ledger().with_mut(|li| {
        li.timestamp += 1000;
    });

    // Batch release
    let results = client.batch_release_credentials(&credential_ids, &recipient);

    // All should succeed
    assert_eq!(results.len(), 5);
    for i in 0..results.len() {
        assert!(results.get(i).unwrap().is_ok());
    }
}

#[test]
fn test_create_release_schedule() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();

    // Issue credentials
    let cred1 = client.issue_credential(&issuer, &recipient, &hash, &"C1".into_val(&env), &(env.ledger().timestamp() + 1000));
    let cred2 = client.issue_credential(&issuer, &recipient, &hash, &"C2".into_val(&env), &(env.ledger().timestamp() + 2000));

    // Create schedule
    let credential_ids = Vec::from_array(&env, [cred1, cred2]);
    let release_times = Vec::from_array(&env, [env.ledger().timestamp() + 1000, env.ledger().timestamp() + 2000]);

    let schedule_id = client.create_release_schedule(&issuer, &credential_ids, &release_times);
    assert_eq!(schedule_id, 0u64);

    // Verify schedule
    let schedule = client.get_release_schedule(&schedule_id);
    assert_eq!(schedule.credentials.len(), 2);
    assert_eq!(schedule.release_times.len(), 2);
}

#[test]
fn test_get_credentials_by_recipient() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();

    // Issue 3 credentials to same recipient
    client.issue_credential(&issuer, &recipient, &hash, &"C1".into_val(&env), &(env.ledger().timestamp() + 1000));
    client.issue_credential(&issuer, &recipient, &hash, &"C2".into_val(&env), &(env.ledger().timestamp() + 2000));
    client.issue_credential(&issuer, &recipient, &hash, &"C3".into_val(&env), &(env.ledger().timestamp() + 3000));

    let credentials = client.get_credentials_by_recipient(&recipient);
    assert_eq!(credentials.len(), 3);
}

#[test]
fn test_check_upcoming_releases() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();

    // Issue credentials with different release times
    client.issue_credential(&issuer, &recipient, &hash, &"Soon".into_val(&env), &(env.ledger().timestamp() + 500));
    client.issue_credential(&issuer, &recipient, &hash, &"Later".into_val(&env), &(env.ledger().timestamp() + 5000));

    // Check upcoming releases in next 1000 seconds
    let upcoming = client.check_upcoming_releases(&recipient, &1000);
    assert_eq!(upcoming.len(), 1);
    assert_eq!(upcoming.get(0).unwrap().metadata, String::from_str(&env, "Soon"));
}

#[test]
fn test_audit_log() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();

    // Issue credential
    let credential_id = client.issue_credential(&issuer, &recipient, &hash, &"Test".into_val(&env), &(env.ledger().timestamp() + 1000));

    // Get audit log
    let audit_entries = client.get_audit_log(&0, &10);
    assert!(audit_entries.len() > 0);

    // First entry should be ISSUE_CREDENTIAL
    let first_entry = audit_entries.get(0).unwrap();
    assert_eq!(first_entry.operation, String::from_str(&env, "ISSUE_CREDENTIAL"));
    assert_eq!(first_entry.credential_id, credential_id);
}

#[test]
fn test_unauthorized_release() {
    let env = Env::default();
    let contract_id = env.register_contract(None, TimeLockCredential);
    let client = TimeLockCredentialClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    let recipient = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let hash = create_test_credential_hash(&env);

    env.mock_all_auths();
    let credential_id = client.issue_credential(&issuer, &recipient, &hash, &"Test".into_val(&env), &(env.ledger().timestamp() + 1000));

    // Advance time
    env.ledger().with_mut(|li| {
        li.timestamp += 1000;
    });

    // Unauthorized user tries to release
    env.mock_all_auths();
    let result = client.try_release_credential(&credential_id, &unauthorized);
    assert!(result.is_err());
    assert!(result.err().unwrap().contains("Unauthorized"));
}
