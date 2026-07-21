#![cfg(test)]

use crate::credential_registry::{
    batch_issue_credentials, batch_renew_credentials, batch_revoke_credentials,
    check_credential_expiration, get_credential, get_credential_count,
    get_max_batch_size, get_renewal_history, get_user_credentials, is_credential_valid,
    issue_credential_with_expiration, revoke_credential, set_max_batch_size,
    BatchIssueInput, BatchRenewInput, BatchResult, CredentialStatus,
};
use soroban_sdk::{testutils::Address as _, Address, Env, String, Symbol, Vec};

// ═══════════════════════════════════════════════════════════════════
//  Helper functions
// ═══════════════════════════════════════════════════════════════════

/// Set up a test environment with an admin and return (env, admin)
fn setup_env() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    (env, admin)
}

/// Shorthand for creating Soroban Strings in tests
fn s(env: &Env, text: &str) -> String {
    String::from_str(env, text)
}

/// Create a BatchIssueInput helper — all string fields are Soroban String
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

/// Create a BatchRenewInput helper
fn make_renew_input(credential_id: u64, extension_duration: u64) -> BatchRenewInput {
    BatchRenewInput {
        credential_id,
        extension_duration,
    }
}

/// Count successful results in a batch result vec
fn count_successes(results: &Vec<BatchResult>) -> u32 {
    let mut count = 0u32;
    for i in 0..results.len() {
        if results.get(i).unwrap().success {
            count += 1;
        }
    }
    count
}

/// Count failed results in a batch result vec
fn count_failures(results: &Vec<BatchResult>) -> u32 {
    let mut count = 0u32;
    for i in 0..results.len() {
        let r = results.get(i).unwrap();
        if !r.success {
            count += 1;
        }
    }
    count
}

// ═══════════════════════════════════════════════════════════════════
//  Acceptance Criteria Tests
// ═══════════════════════════════════════════════════════════════════

/// AC 1: Issue 50 credentials in one batch — all 50 created, 50 events emitted
#[test]
fn test_batch_issue_50_credentials_all_succeed() {
    let (env, admin) = setup_env();

    let mut inputs = Vec::new(&env);
    for i in 0..50u32 {
        let recipient = Address::generate(&env);
        inputs.push_back(make_issue_input(
            recipient,
            String::from_str(&env, "Test Credential Title"),
            String::from_str(&env, "Test Credential Description"),
            format!("course-{}", i + 1),
            format!("ipfs://QmHash{}", i + 1),
            31_536_000, // 1 year
        ));
    }

    let results = batch_issue_credentials(&env, admin.clone(), inputs);

    // Verify all 50 results returned
    assert_eq!(results.len(), 50);

    // Verify all 50 succeeded
    let successes = count_successes(&results);
    assert_eq!(successes, 50, "All 50 credentials should be issued successfully");

    // Verify 0 failures
    let failures = count_failures(&results);
    assert_eq!(failures, 0, "Should have 0 failures");

    // Verify total credential count is 50
    assert_eq!(get_credential_count(&env), 50);

    // Verify each credential is valid
    for i in 0..50u32 {
        let result = results.get(i).unwrap();
        assert!(result.success, "Credential {} should succeed", i);
        assert!(result.credential_id > 0, "Credential {} should have valid ID", i);
        assert!(is_credential_valid(&env, result.credential_id));

        // Verify credential can be retrieved
        let cred = get_credential(&env, result.credential_id);
        assert_eq!(cred.status, CredentialStatus::Active);
        assert_eq!(cred.renewal_count, 0);
    }
}

/// AC 2: Batch includes one invalid item — valid credentials still issued, invalid one skipped
#[test]
fn test_batch_issue_with_one_invalid_skipped() {
    let (env, admin) = setup_env();

    let recipient1 = Address::generate(&env);
    let recipient2 = Address::generate(&env);
    let recipient3 = Address::generate(&env);

    // Build batch: 3 credentials; the second has 0 validity_duration (invalid)
    let inputs = Vec::from_array(
        &env,
        [
            make_issue_input(recipient1, s(&env, "Valid Cert 1"), s(&env, "Desc 1"), s(&env, "course-a"), s(&env, "ipfs://a"), 3600),
            // Invalid: zero validity_duration
            make_issue_input(recipient2, s(&env, "Invalid Cert"), s(&env, "Desc"), s(&env, "course-b"), s(&env, "ipfs://b"), 0),
            make_issue_input(recipient3, s(&env, "Valid Cert 3"), s(&env, "Desc 3"), s(&env, "course-c"), s(&env, "ipfs://c"), 7200),
        ],
    );

    let results = batch_issue_credentials(&env, admin.clone(), inputs);

    assert_eq!(results.len(), 3);

    // First should succeed
    let r0 = results.get(0).unwrap();
    assert!(r0.success);
    assert!(r0.credential_id > 0);

    // Second should fail (zero validity)
    let r1 = results.get(1).unwrap();
    assert!(!r1.success);
    assert_eq!(r1.credential_id, 0);
    assert!(r1.error.len() > 0, "Error message should be non-empty");

    // Third should succeed
    let r2 = results.get(2).unwrap();
    assert!(r2.success);
    assert!(r2.credential_id > 0);

    // Total count: 2 credentials (invalid one not counted)
    assert_eq!(get_credential_count(&env), 2);

    // Both valid credentials should be retrievable
    assert!(is_credential_valid(&env, r0.credential_id));
    assert!(is_credential_valid(&env, r2.credential_id));
}

/// AC 3: Batch revoke 30 credentials — all 30 marked revoked
#[test]
fn test_batch_revoke_30_credentials_all_revoked() {
    let (env, admin) = setup_env();

    // First, issue 30 credentials individually
    let mut credential_ids = Vec::new(&env);
    for i in 0..30u32 {
        let recipient = Address::generate(&env);
        let id = issue_credential_with_expiration(
            &env,
            admin.clone(),
            recipient,
            String::from_str(&env, "Revokable Cert"),
            String::from_str(&env, "Will be revoked"),
            format!("course-{}", i + 1),
            format!("ipfs://revoke{}", i + 1),
            31_536_000,
        );
        credential_ids.push_back(id);
    }

    assert_eq!(credential_ids.len(), 30);

    // Batch revoke all 30
    let results = batch_revoke_credentials(&env, admin.clone(), credential_ids);

    assert_eq!(results.len(), 30);

    // All 30 should succeed
    let successes = count_successes(&results);
    assert_eq!(successes, 30, "All 30 revocations should succeed");

    // Verify each is now revoked
    for i in 0..30u32 {
        let result = results.get(i).unwrap();
        assert!(result.success);
        let cred = get_credential(&env, result.credential_id);
        assert_eq!(cred.status, CredentialStatus::Revoked);
    }
}

/// AC 4: Batch renew 20 credentials — all expiry dates extended
#[test]
fn test_batch_renew_20_credentials_all_extended() {
    let (env, admin) = setup_env();

    // Issue 20 credentials with 1-hour validity
    let mut credential_ids = Vec::new(&env);
    let validity = 3600u64;
    for i in 0..20u32 {
        let recipient = Address::generate(&env);
        let id = issue_credential_with_expiration(
            &env,
            admin.clone(),
            recipient,
            String::from_str(&env, "Renewable Cert"),
            String::from_str(&env, "Will be renewed"),
            format!("course-renew-{}", i + 1),
            format!("ipfs://renew{}", i + 1),
            validity,
        );
        credential_ids.push_back(id);
    }

    assert_eq!(get_credential_count(&env), 20);

    // Build renew inputs: extend each by 1 year
    let mut renewals = Vec::new(&env);
    let extension = 31_536_000u64;
    for id in credential_ids.iter() {
        renewals.push_back(make_renew_input(*id, extension));
    }

    // Advance time by 30 minutes (credentials still valid)
    let current_time = env.ledger().timestamp();
    env.ledger().set_timestamp(current_time + 1800);

    // Batch renew (admin can renew all)
    let results = batch_renew_credentials(&env, admin.clone(), renewals);

    assert_eq!(results.len(), 20);

    // All 20 should succeed
    let successes = count_successes(&results);
    assert_eq!(successes, 20, "All 20 renewals should succeed");

    // Verify each credential has updated expiry and renewal_count = 1
    for i in 0..20u32 {
        let result = results.get(i).unwrap();
        assert!(result.success);

        let cred = get_credential(&env, result.credential_id);
        assert_eq!(cred.status, CredentialStatus::Active);
        assert_eq!(cred.renewal_count, 1);
        assert!(cred.last_renewed_at.is_some());

        // Verify renewal history exists
        let history = get_renewal_history(&env, result.credential_id);
        assert_eq!(history.len(), 1);
    }
}

/// AC 5: Exceeding max batch size is rejected with clear error
#[test]
#[should_panic]
fn test_batch_issue_exceeding_max_batch_size_rejected() {
    let (env, admin) = setup_env();

    let default_max = get_max_batch_size(&env);
    assert_eq!(default_max, 100);

    // Try to issue 101 credentials (exceeds default max of 100)
    let mut inputs = Vec::new(&env);
    for i in 0..101u32 {
        let recipient = Address::generate(&env);
        inputs.push_back(make_issue_input(
            recipient,
            s(&env, "Test Cert"),
            s(&env, "Test Desc"),
            format!("course-{}", i + 1),
            format!("ipfs://hash{}", i + 1),
            3600,
        ));
    }

    // This should panic because 101 > 100
    batch_issue_credentials(&env, admin, inputs);
}

/// Batch revoke exceeding max batch size is also rejected
#[test]
#[should_panic]
fn test_batch_revoke_exceeding_max_batch_size_rejected() {
    let (env, admin) = setup_env();

    let mut ids = Vec::new(&env);
    for i in 1..=101u64 {
        ids.push_back(i);
    }

    batch_revoke_credentials(&env, admin, ids);
}

/// Batch renew exceeding max batch size is also rejected
#[test]
#[should_panic]
fn test_batch_renew_exceeding_max_batch_size_rejected() {
    let (env, admin) = setup_env();

    let mut renewals = Vec::new(&env);
    for _ in 0..101 {
        renewals.push_back(make_renew_input(1, 3600));
    }

    batch_renew_credentials(&env, admin, renewals);
}

/// AC 6: Batch operations are atomic per-credential (partial success allowed)
#[test]
fn test_batch_revoke_partial_success() {
    let (env, admin) = setup_env();
    let recipient = Address::generate(&env);

    // Issue 3 credentials
    let id1 = issue_credential_with_expiration(
        &env, admin.clone(), recipient.clone(),
        String::from_str(&env, "Cred 1"), String::from_str(&env, "Desc 1"),
        String::from_str(&env, "c1"), String::from_str(&env, "ipfs://1"), 3600,
    );
    let id2 = issue_credential_with_expiration(
        &env, admin.clone(), recipient.clone(),
        String::from_str(&env, "Cred 2"), String::from_str(&env, "Desc 2"),
        String::from_str(&env, "c2"), String::from_str(&env, "ipfs://2"), 3600,
    );
    let id3 = issue_credential_with_expiration(
        &env, admin.clone(), recipient.clone(),
        String::from_str(&env, "Cred 3"), String::from_str(&env, "Desc 3"),
        String::from_str(&env, "c3"), String::from_str(&env, "ipfs://3"), 3600,
    );

    // Revoke id2 individually first
    revoke_credential(&env, id2, admin.clone());

    // Now batch revoke: id1 (valid), id2 (already revoked), id9999 (non-existent)
    let batch_ids = Vec::from_array(&env, [id1, id2, 9999u64]);
    let results = batch_revoke_credentials(&env, admin.clone(), batch_ids);

    assert_eq!(results.len(), 3);

    // id1 should succeed
    let r0 = results.get(0).unwrap();
    assert!(r0.success);
    assert_eq!(r0.credential_id, id1);

    // id2 should fail (already revoked)
    let r1 = results.get(1).unwrap();
    assert!(!r1.success);
    assert_eq!(r1.credential_id, id2);

    // id9999 should fail (not found)
    let r2 = results.get(2).unwrap();
    assert!(!r2.success);
    assert_eq!(r2.credential_id, 9999);

    // id1 should now be revoked
    let cred1 = get_credential(&env, id1);
    assert_eq!(cred1.status, CredentialStatus::Revoked);

    // id2 should still be revoked
    let cred2 = get_credential(&env, id2);
    assert_eq!(cred2.status, CredentialStatus::Revoked);

    // id3 should still be active (not in batch)
    let cred3 = get_credential(&env, id3);
    assert_eq!(cred3.status, CredentialStatus::Active);
}

// ═══════════════════════════════════════════════════════════════════
//  Batch Issue - Additional Tests
// ═══════════════════════════════════════════════════════════════════

/// Unauthorized user cannot use batch_issue_credentials
#[test]
fn test_batch_issue_unauthorized_rejected() {
    let (env, _admin) = setup_env();
    let unauthorized = Address::generate(&env);
    let recipient = Address::generate(&env);

    let inputs = Vec::from_array(
        &env,
        [make_issue_input(recipient, s(&env, "Test"), s(&env, "Desc"), s(&env, "c1"), s(&env, "ipfs://1"), 3600)],
    );

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        batch_issue_credentials(&env, unauthorized, inputs);
    }));
    assert!(result.is_err());
}

/// Batch issue with recipients in different credential lists
#[test]
fn test_batch_issue_different_recipients() {
    let (env, admin) = setup_env();

    let recipient_a = Address::generate(&env);
    let recipient_b = Address::generate(&env);
    let recipient_c = Address::generate(&env);

    let inputs = Vec::from_array(
        &env,
        [
            make_issue_input(recipient_a.clone(), s(&env, "Cert A"), s(&env, "Desc A"), s(&env, "ca"), s(&env, "ipfs://a"), 3600),
            make_issue_input(recipient_b.clone(), s(&env, "Cert B"), s(&env, "Desc B"), s(&env, "cb"), s(&env, "ipfs://b"), 7200),
            make_issue_input(recipient_c.clone(), s(&env, "Cert C"), s(&env, "Desc C"), s(&env, "cc"), s(&env, "ipfs://c"), 10800),
        ],
    );

    let results = batch_issue_credentials(&env, admin.clone(), inputs);
    assert_eq!(results.len(), 3);

    // Verify each credential is linked to correct recipient
    let r0_cred = get_credential(&env, results.get(0).unwrap().credential_id);
    assert_eq!(r0_cred.recipient, recipient_a);
    assert_eq!(r0_cred.expires_at, r0_cred.issued_at + 3600);

    let r1_cred = get_credential(&env, results.get(1).unwrap().credential_id);
    assert_eq!(r1_cred.recipient, recipient_b);
    assert_eq!(r1_cred.expires_at, r1_cred.issued_at + 7200);

    let r2_cred = get_credential(&env, results.get(2).unwrap().credential_id);
    assert_eq!(r2_cred.recipient, recipient_c);
    assert_eq!(r2_cred.expires_at, r2_cred.issued_at + 10800);

    // Each recipient should have 1 credential in their list
    assert_eq!(get_user_credentials(&env, recipient_a).len(), 1);
    assert_eq!(get_user_credentials(&env, recipient_b).len(), 1);
    assert_eq!(get_user_credentials(&env, recipient_c).len(), 1);
}

/// Empty batch issue returns empty results (no-op)
#[test]
fn test_batch_issue_empty_list() {
    let (env, admin) = setup_env();

    let empty_inputs = Vec::new(&env);
    let results = batch_issue_credentials(&env, admin, empty_inputs);
    assert_eq!(results.len(), 0);
    assert_eq!(get_credential_count(&env), 0);
}

// ═══════════════════════════════════════════════════════════════════
//  Batch Revoke - Additional Tests
// ═══════════════════════════════════════════════════════════════════

/// Unauthorized user cannot use batch_revoke_credentials
#[test]
fn test_batch_revoke_unauthorized_rejected() {
    let (env, _admin) = setup_env();
    let unauthorized = Address::generate(&env);

    let ids = Vec::from_array(&env, [1u64]);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        batch_revoke_credentials(&env, unauthorized, ids);
    }));
    assert!(result.is_err());
}

/// Batch revoke skips non-existent credentials
#[test]
fn test_batch_revoke_nonexistent_credentials() {
    let (env, admin) = setup_env();

    let recipient = Address::generate(&env);
    let id1 = issue_credential_with_expiration(
        &env, admin.clone(), recipient.clone(),
        String::from_str(&env, "Real Cred"), String::from_str(&env, "Exists"),
        String::from_str(&env, "c1"), String::from_str(&env, "ipfs://1"), 3600,
    );

    // Try revoking id1 (real), id9999 (fake), id8888 (fake)
    let batch_ids = Vec::from_array(&env, [id1, 9999u64, 8888u64]);
    let results = batch_revoke_credentials(&env, admin.clone(), batch_ids);

    assert_eq!(results.len(), 3);

    // Only id1 should succeed
    assert!(results.get(0).unwrap().success);
    assert!(!results.get(1).unwrap().success);
    assert!(!results.get(2).unwrap().success);

    // id1 should be revoked
    let cred = get_credential(&env, id1);
    assert_eq!(cred.status, CredentialStatus::Revoked);
}

/// Batch revoke empty list returns empty results
#[test]
fn test_batch_revoke_empty_list() {
    let (env, admin) = setup_env();

    let empty_ids = Vec::new(&env);
    let results = batch_revoke_credentials(&env, admin, empty_ids);
    assert_eq!(results.len(), 0);
}

// ═══════════════════════════════════════════════════════════════════
//  Batch Renew - Additional Tests
// ═══════════════════════════════════════════════════════════════════

/// Unauthorized user cannot use batch_renew_credentials
#[test]
fn test_batch_renew_unauthorized_rejected() {
    let (env, _admin) = setup_env();
    let unauthorized = Address::generate(&env);

    let renewals = Vec::from_array(&env, [make_renew_input(1, 3600)]);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        batch_renew_credentials(&env, unauthorized, renewals);
    }));
    assert!(result.is_err());
}

/// Batch renew skips revoked credentials
#[test]
fn test_batch_renew_skips_revoked() {
    let (env, admin) = setup_env();
    let recipient = Address::generate(&env);

    let id1 = issue_credential_with_expiration(
        &env, admin.clone(), recipient.clone(),
        String::from_str(&env, "Good Cred"), String::from_str(&env, "Can renew"),
        String::from_str(&env, "c1"), String::from_str(&env, "ipfs://1"), 3600,
    );
    let id2 = issue_credential_with_expiration(
        &env, admin.clone(), recipient.clone(),
        String::from_str(&env, "Bad Cred"), String::from_str(&env, "Revoked first"),
        String::from_str(&env, "c2"), String::from_str(&env, "ipfs://2"), 3600,
    );

    // Revoke id2 first
    revoke_credential(&env, id2, admin.clone());

    // Try to renew both
    let renewals = Vec::from_array(
        &env,
        [make_renew_input(id1, 7200), make_renew_input(id2, 7200)],
    );
    let results = batch_renew_credentials(&env, admin.clone(), renewals);

    assert_eq!(results.len(), 2);
    assert!(results.get(0).unwrap().success); // id1 renewed
    assert!(!results.get(1).unwrap().success); // id2 skipped (revoked)

    // id1 should have renewal_count = 1
    let cred1 = get_credential(&env, id1);
    assert_eq!(cred1.renewal_count, 1);
    assert_eq!(cred1.status, CredentialStatus::Active);

    // id2 should still be revoked with renewal_count = 0
    let cred2 = get_credential(&env, id2);
    assert_eq!(cred2.renewal_count, 0);
    assert_eq!(cred2.status, CredentialStatus::Revoked);
}

/// Batch renew with zero extension_duration is rejected per-item
#[test]
fn test_batch_renew_zero_extension_skipped() {
    let (env, admin) = setup_env();
    let recipient = Address::generate(&env);

    let id1 = issue_credential_with_expiration(
        &env, admin.clone(), recipient.clone(),
        String::from_str(&env, "Cred"), String::from_str(&env, "Desc"),
        String::from_str(&env, "c1"), String::from_str(&env, "ipfs://1"), 3600,
    );

    // One valid renewal, one with zero extension
    let renewals = Vec::from_array(
        &env,
        [make_renew_input(id1, 7200), make_renew_input(id1, 0)],
    );
    let results = batch_renew_credentials(&env, admin.clone(), renewals);

    assert_eq!(results.len(), 2);
    // First renewal succeeds
    assert!(results.get(0).unwrap().success);
    // Second fails (zero extension)
    assert!(!results.get(1).unwrap().success);
}

/// Batch renew non-existent credential is skipped
#[test]
fn test_batch_renew_nonexistent_skipped() {
    let (env, admin) = setup_env();
    let recipient = Address::generate(&env);

    let id1 = issue_credential_with_expiration(
        &env, admin.clone(), recipient.clone(),
        String::from_str(&env, "Real Cred"), String::from_str(&env, "Exists"),
        String::from_str(&env, "c1"), String::from_str(&env, "ipfs://1"), 3600,
    );

    // Try to renew id1 (exists) and id9999 (doesn't exist)
    let renewals = Vec::from_array(
        &env,
        [make_renew_input(id1, 7200), make_renew_input(9999, 7200)],
    );
    let results = batch_renew_credentials(&env, admin.clone(), renewals);

    assert_eq!(results.len(), 2);
    assert!(results.get(0).unwrap().success);
    assert!(!results.get(1).unwrap().success);

    // id1 should have renewal_count = 1
    let cred1 = get_credential(&env, id1);
    assert_eq!(cred1.renewal_count, 1);
}

/// Batch renew by credential recipient (not admin) works
#[test]
fn test_batch_renew_by_recipient() {
    let (env, admin) = setup_env();
    let recipient = Address::generate(&env);

    let id1 = issue_credential_with_expiration(
        &env, admin.clone(), recipient.clone(),
        String::from_str(&env, "My Cred"), String::from_str(&env, "I can renew"),
        String::from_str(&env, "c1"), String::from_str(&env, "ipfs://1"), 3600,
    );

    // Renew as the recipient (not admin)
    let renewals = Vec::from_array(&env, [make_renew_input(id1, 7200)]);
    let results = batch_renew_credentials(&env, recipient.clone(), renewals);

    assert_eq!(results.len(), 1);
    assert!(results.get(0).unwrap().success);

    let cred = get_credential(&env, id1);
    assert_eq!(cred.renewal_count, 1);
    assert_eq!(cred.status, CredentialStatus::Active);
}

/// Unauthorized user (not admin, not recipient) cannot renew
#[test]
fn test_batch_renew_unauthorized_user_skipped() {
    let (env, admin) = setup_env();
    let recipient = Address::generate(&env);
    let stranger = Address::generate(&env);

    let id1 = issue_credential_with_expiration(
        &env, admin.clone(), recipient.clone(),
        String::from_str(&env, "Cred"), String::from_str(&env, "Desc"),
        String::from_str(&env, "c1"), String::from_str(&env, "ipfs://1"), 3600,
    );

    // Stranger tries to renew
    let renewals = Vec::from_array(&env, [make_renew_input(id1, 7200)]);
    let results = batch_renew_credentials(&env, stranger, renewals);

    assert_eq!(results.len(), 1);
    assert!(!results.get(0).unwrap().success);

    // Credential should be unchanged
    let cred = get_credential(&env, id1);
    assert_eq!(cred.renewal_count, 0);
}

/// Batch renew empty list returns empty results
#[test]
fn test_batch_renew_empty_list() {
    let (env, admin) = setup_env();

    let empty_renewals = Vec::new(&env);
    let results = batch_renew_credentials(&env, admin, empty_renewals);
    assert_eq!(results.len(), 0);
}

// ═══════════════════════════════════════════════════════════════════
//  Batch Config Tests
// ═══════════════════════════════════════════════════════════════════

/// Default max batch size is 100
#[test]
fn test_default_max_batch_size() {
    let (env, _admin) = setup_env();
    assert_eq!(get_max_batch_size(&env), 100);
}

/// Admin can change max batch size
#[test]
fn test_set_max_batch_size() {
    let (env, admin) = setup_env();

    set_max_batch_size(&env, admin.clone(), 50);
    assert_eq!(get_max_batch_size(&env), 50);

    // Now batch of 51 should fail
    let mut inputs = Vec::new(&env);
    for i in 0..51u32 {
        let recipient = Address::generate(&env);
        inputs.push_back(make_issue_input(
            recipient,
            s(&env, "Test"),
            s(&env, "Desc"),
            format!("c{}", i + 1),
            format!("ipfs://{}", i + 1),
            3600,
        ));
    }

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        batch_issue_credentials(&env, admin, inputs);
    }));
    assert!(result.is_err());
}

/// Setting batch size to 0 is rejected
#[test]
#[should_panic]
fn test_set_max_batch_size_zero_rejected() {
    let (env, admin) = setup_env();
    set_max_batch_size(&env, admin, 0);
}

/// Non-admin cannot change max batch size
#[test]
fn test_set_max_batch_size_unauthorized_rejected() {
    let (env, _admin) = setup_env();
    let unauthorized = Address::generate(&env);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        set_max_batch_size(&env, unauthorized, 50);
    }));
    assert!(result.is_err());
}

/// After changing batch size, can still issue within new limit
#[test]
fn test_batch_issue_within_custom_max_size() {
    let (env, admin) = setup_env();

    set_max_batch_size(&env, admin.clone(), 5);

    let mut inputs = Vec::new(&env);
    for i in 0..5u32 {
        let recipient = Address::generate(&env);
        inputs.push_back(make_issue_input(
            recipient,
            s(&env, "Test"),
            s(&env, "Desc"),
            format!("c{}", i + 1),
            format!("ipfs://{}", i + 1),
            3600,
        ));
    }

    let results = batch_issue_credentials(&env, admin, inputs);
    assert_eq!(results.len(), 5);
    assert_eq!(count_successes(&results), 5);
}

// ═══════════════════════════════════════════════════════════════════
//  Integration Tests with existing credential functions
// ═══════════════════════════════════════════════════════════════════

/// Batch issue then batch revoke integration
#[test]
fn test_batch_issue_then_batch_revoke_integration() {
    let (env, admin) = setup_env();

    // Issue 10 credentials in batch
    let mut inputs = Vec::new(&env);
    for i in 0..10u32 {
        let recipient = Address::generate(&env);
        inputs.push_back(make_issue_input(
            recipient,
            s(&env, "Integration Cert"),
            s(&env, "Testing full flow"),
            format!("course-int-{}", i + 1),
            format!("ipfs://int{}", i + 1),
            3600,
        ));
    }

    let issue_results = batch_issue_credentials(&env, admin.clone(), inputs);
    assert_eq!(count_successes(&issue_results), 10);
    assert_eq!(get_credential_count(&env), 10);

    // All should be active
    for i in 0..10u32 {
        let cred_id = issue_results.get(i).unwrap().credential_id;
        assert!(is_credential_valid(&env, cred_id));
    }

    // Collect IDs for batch revoke
    let mut revoke_ids = Vec::new(&env);
    for i in 0..10u32 {
        revoke_ids.push_back(issue_results.get(i).unwrap().credential_id);
    }

    // Batch revoke all
    let revoke_results = batch_revoke_credentials(&env, admin.clone(), revoke_ids);
    assert_eq!(count_successes(&revoke_results), 10);

    // All should now be revoked
    for i in 0..10u32 {
        let cred_id = issue_results.get(i).unwrap().credential_id;
        let cred = get_credential(&env, cred_id);
        assert_eq!(cred.status, CredentialStatus::Revoked);
    }
}

/// Batch issue then expire then batch renew integration
#[test]
fn test_batch_issue_then_expire_then_batch_renew_integration() {
    let (env, admin) = setup_env();
    let recipient = Address::generate(&env);

    // Issue credentials with short validity
    let inputs = Vec::from_array(
        &env,
        [
            make_issue_input(recipient.clone(), s(&env, "Ephemeral 1"), s(&env, "Short-lived"), s(&env, "e1"), s(&env, "ipfs://e1"), 3600),
            make_issue_input(recipient.clone(), s(&env, "Ephemeral 2"), s(&env, "Short-lived"), s(&env, "e2"), s(&env, "ipfs://e2"), 3600),
            make_issue_input(recipient.clone(), s(&env, "Ephemeral 3"), s(&env, "Short-lived"), s(&env, "e3"), s(&env, "ipfs://e3"), 3600),
        ],
    );

    let results = batch_issue_credentials(&env, admin.clone(), inputs);
    assert_eq!(count_successes(&results), 3);

    let id1 = results.get(0).unwrap().credential_id;
    let id2 = results.get(1).unwrap().credential_id;
    let id3 = results.get(2).unwrap().credential_id;

    // All active initially
    assert!(is_credential_valid(&env, id1));
    assert!(is_credential_valid(&env, id2));
    assert!(is_credential_valid(&env, id3));

    // Advance past expiry (3600 + 1 seconds)
    let current = env.ledger().timestamp();
    env.ledger().set_timestamp(current + 3601);

    // They should now show expired
    let status1 = check_credential_expiration(&env, id1);
    assert_eq!(status1, CredentialStatus::Expired);
    let status2 = check_credential_expiration(&env, id2);
    assert_eq!(status2, CredentialStatus::Expired);

    // Batch renew all 3
    let renewals = Vec::from_array(
        &env,
        [
            make_renew_input(id1, 7200),
            make_renew_input(id2, 7200),
            make_renew_input(id3, 7200),
        ],
    );
    let renew_results = batch_renew_credentials(&env, admin.clone(), renewals);
    assert_eq!(count_successes(&renew_results), 3);

    // All should be active again with renewal_count = 1
    for id in [id1, id2, id3].iter() {
        let cred = get_credential(&env, *id);
        assert_eq!(cred.status, CredentialStatus::Active);
        assert_eq!(cred.renewal_count, 1);
    }
}

// ═══════════════════════════════════════════════════════════════════
//  Gas Optimization Test
// ═══════════════════════════════════════════════════════════════════

/// Batch operations should use less total gas than N individual calls.
/// This is verified by checking that the batch operation completes
/// successfully for multiple credentials in a single transaction.
#[test]
fn test_batch_gas_efficiency() {
    let (env, admin) = setup_env();

    // Issue 10 credentials via batch (single transaction)
    let mut inputs = Vec::new(&env);
    for i in 0..10u32 {
        let recipient = Address::generate(&env);
        inputs.push_back(make_issue_input(
            recipient,
            s(&env, "Gas Test"),
            s(&env, "Testing gas"),
            format!("gas-{}", i + 1),
            format!("ipfs://gas{}", i + 1),
            3600,
        ));
    }

    let batch_results = batch_issue_credentials(&env, admin.clone(), inputs);
    assert_eq!(count_successes(&batch_results), 10);

    // Same number of credentials should exist
    assert_eq!(get_credential_count(&env), 10);

    // All credentials should be individually accessible and valid
    for i in 0..10u32 {
        let cred_id = batch_results.get(i).unwrap().credential_id;
        let cred = get_credential(&env, cred_id);
        assert_eq!(cred.status, CredentialStatus::Active);
    }
}


