#![cfg(test)]
extern crate std;

use crate::credential_registry::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String, Symbol, Vec,
};

/// Helper to set up the environment with an admin
fn setup_env() -> (Env, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);
    (env, admin)
}

// ═══════════════════════════════════════════════════════════════
//  Batch Issue Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fn test_batch_issue_50_credentials() {
    let (env, admin) = setup_env();
    env.ledger().set_timestamp(1000);

    let batch_size = 50u32;
    let mut recipients = Vec::new(&env);
    let mut titles = Vec::new(&env);
    let mut descriptions = Vec::new(&env);
    let mut ipfs_hashes = Vec::new(&env);
    let course_id = String::from_str(&env, "CS101");

    for i in 0..batch_size {
        recipients.push_back(Address::generate(&env));
        titles.push_back(String::from_str(
            &env,
            &format!("Credential {}", i + 1),
        ));
        descriptions.push_back(String::from_str(&env, "Batch issued credential"));
        ipfs_hashes.push_back(String::from_str(
            &env,
            &format!("QmHash{}", i + 1),
        ));
    }

    let results = batch_issue_credentials(
        &env,
        admin.clone(),
        recipients.clone(),
        titles.clone(),
        descriptions.clone(),
        course_id,
        ipfs_hashes.clone(),
        31536000, // 1 year validity
    );

    // All 50 should succeed
    assert_eq!(results.len(), 50);
    for result in results.iter() {
        assert!(result.success);
        assert!(result.credential_id > 0);
    }

    // Verify 50 events were emitted
    let events = env.events().all();
    let issued_events: std::vec::Vec<_> = events
        .iter()
        .filter(|(topics, _): &(_, _)| {
            *topics == (Symbol::new(&env, "credential"), Symbol::new(&env, "issued"))
        })
        .collect();
    assert_eq!(issued_events.len(), 50);

    // Verify credentials are queryable
    let first_cred = get_credential(&env, 1);
    assert_eq!(first_cred.status, CredentialStatus::Active);
    assert_eq!(first_cred.issuer, admin);
}

#[test]
fn test_batch_issue_with_one_invalid_recipient() {
    let (env, admin) = setup_env();

    let mut recipients = Vec::new(&env);
    let mut titles = Vec::new(&env);
    let mut descriptions = Vec::new(&env);
    let mut ipfs_hashes = Vec::new(&env);
    let course_id = String::from_str(&env, "CS101");

    // Valid credential
    recipients.push_back(Address::generate(&env));
    titles.push_back(String::from_str(&env, "Valid Credential"));
    descriptions.push_back(String::from_str(&env, "Valid"));
    ipfs_hashes.push_back(String::from_str(&env, "QmValidHash"));

    // Invalid credential (empty IPFS hash)
    recipients.push_back(Address::generate(&env));
    titles.push_back(String::from_str(&env, "Invalid Credential"));
    descriptions.push_back(String::from_str(&env, "Invalid"));
    ipfs_hashes.push_back(String::from_str(&env, ""));

    // Another valid credential
    recipients.push_back(Address::generate(&env));
    titles.push_back(String::from_str(&env, "Another Valid"));
    descriptions.push_back(String::from_str(&env, "Valid"));
    ipfs_hashes.push_back(String::from_str(&env, "QmAnotherHash"));

    let results = batch_issue_credentials(
        &env,
        admin,
        recipients,
        titles,
        descriptions,
        course_id,
        ipfs_hashes,
        31536000,
    );

    assert_eq!(results.len(), 3);
    // First should succeed
    assert!(results.get(0).unwrap().success);
    // Second should fail (empty IPFS)
    assert!(!results.get(1).unwrap().success);
    assert_eq!(results.get(1).unwrap().error, String::from_str(&env, "Empty IPFS hash"));
    // Third should succeed
    assert!(results.get(2).unwrap().success);

    // Valid credentials should exist
    assert!(get_credential(&env, 1).id == 1);
    assert!(get_credential(&env, 3).id == 3);
}

#[test]
#[should_panic(expected = "Batch size exceeds maximum of 100")]
fn test_batch_issue_exceeding_max_size() {
    let (env, admin) = setup_env();

    // 101 recipients exceeds MAX_BATCH_SIZE (100)
    let mut recipients = Vec::new(&env);
    let mut titles = Vec::new(&env);
    let mut descriptions = Vec::new(&env);
    let mut ipfs_hashes = Vec::new(&env);

    for i in 0..101 {
        recipients.push_back(Address::generate(&env));
        titles.push_back(String::from_str(&env, &format!("C{}", i)));
        descriptions.push_back(String::from_str(&env, "Desc"));
        ipfs_hashes.push_back(String::from_str(&env, &format!("QmHash{}", i)));
    }

    batch_issue_credentials(
        &env,
        admin,
        recipients,
        titles,
        descriptions,
        String::from_str(&env, "CS101"),
        ipfs_hashes,
        31536000,
    );
}

// ═══════════════════════════════════════════════════════════════
//  Batch Revoke Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fn test_batch_revoke_30_credentials() {
    let (env, admin) = setup_env();
    env.ledger().set_timestamp(1000);

    // First, issue 30 credentials
    let mut recipients = Vec::new(&env);
    let mut titles = Vec::new(&env);
    let mut descriptions = Vec::new(&env);
    let mut ipfs_hashes = Vec::new(&env);

    for i in 0..30 {
        recipients.push_back(Address::generate(&env));
        titles.push_back(String::from_str(&env, &format!("Cred {}", i + 1)));
        descriptions.push_back(String::from_str(&env, "Test credential"));
        ipfs_hashes.push_back(String::from_str(&env, &format!("QmRevoke{}", i + 1)));
    }

    batch_issue_credentials(
        &env,
        admin.clone(),
        recipients,
        titles,
        descriptions,
        String::from_str(&env, "CS101"),
        ipfs_hashes,
        31536000,
    );

    // Now revoke all 30 in batch
    let mut credential_ids = Vec::new(&env);
    for i in 1u64..=30 {
        credential_ids.push_back(i);
    }

    let results = batch_revoke_credentials(&env, admin, credential_ids);

    // All 30 should be revoked
    assert_eq!(results.len(), 30);
    for result in results.iter() {
        assert!(result.success);
    }

    // Verify each is actually revoked
    for i in 1u64..=30 {
        let cred = get_credential(&env, i);
        assert_eq!(cred.status, CredentialStatus::Revoked);
    }

    // Verify 30 revocation events
    let events = env.events().all();
    let revoked_events: std::vec::Vec<_> = events
        .iter()
        .filter(|(topics, _): &(_, _)| {
            *topics == (Symbol::new(&env, "credential"), Symbol::new(&env, "revoked"))
        })
        .collect();
    assert_eq!(revoked_events.len(), 30);
}

#[test]
fn test_batch_revoke_with_missing_credential() {
    let (env, admin) = setup_env();

    // Only credential 1 exists, 2 and 3 don't
    let recipient = Address::generate(&env);
    batch_issue_credentials(
        &env,
        admin.clone(),
        {
            let mut r = Vec::new(&env);
            r.push_back(recipient);
            r
        },
        {
            let mut t = Vec::new(&env);
            t.push_back(String::from_str(&env, "Cred 1"));
            t
        },
        {
            let mut d = Vec::new(&env);
            d.push_back(String::from_str(&env, "Desc"));
            d
        },
        String::from_str(&env, "CS101"),
        {
            let mut h = Vec::new(&env);
            h.push_back(String::from_str(&env, "QmHash1"));
            h
        },
        31536000,
    );

    // Try to revoke existing + non-existing credentials
    let mut ids = Vec::new(&env);
    ids.push_back(1);
    ids.push_back(999);
    ids.push_back(1000);

    let results = batch_revoke_credentials(&env, admin, ids);

    assert_eq!(results.len(), 3);
    assert!(results.get(0).unwrap().success); // ID 1 exists
    assert!(!results.get(1).unwrap().success); // ID 999 missing
    assert_eq!(results.get(1).unwrap().error, String::from_str(&env, "Credential not found"));
    assert!(!results.get(2).unwrap().success); // ID 1000 missing
}

// ═══════════════════════════════════════════════════════════════
//  Batch Renew Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fn test_batch_renew_20_credentials() {
    let (env, admin) = setup_env();
    env.ledger().set_timestamp(1000);

    let recipient = Address::generate(&env);

    // Issue 20 credentials
    let mut recipients = Vec::new(&env);
    let mut titles = Vec::new(&env);
    let mut descriptions = Vec::new(&env);
    let mut ipfs_hashes = Vec::new(&env);

    for i in 0..20 {
        recipients.push_back(recipient.clone());
        titles.push_back(String::from_str(&env, &format!("Cred {}", i + 1)));
        descriptions.push_back(String::from_str(&env, "Test"));
        ipfs_hashes.push_back(String::from_str(&env, &format!("QmRenew{}", i + 1)));
    }

    let initial_validity = 86400; // 1 day
    batch_issue_credentials(
        &env,
        admin.clone(),
        recipients,
        titles,
        descriptions,
        String::from_str(&env, "CS101"),
        ipfs_hashes,
        initial_validity,
    );

    // Verify original expiry
    let cred1 = get_credential(&env, 1);
    assert_eq!(cred1.expires_at, 1000 + initial_validity);

    // Fast forward partially
    env.ledger().set_timestamp(1000 + 3600); // 1 hour later

    // Batch renew all 20
    let mut ids = Vec::new(&env);
    for i in 1u64..=20 {
        ids.push_back(i);
    }

    let extension = 86400 * 365; // 1 year extension
    let results = batch_renew_credentials(&env, admin, ids, extension);

    assert_eq!(results.len(), 20);
    for result in results.iter() {
        assert!(result.success);
    }

    // Verify new expiry time
    let cred1 = get_credential(&env, 1);
    let expected_new_expiry = (1000 + 3600) + extension;
    assert_eq!(cred1.expires_at, expected_new_expiry);
    assert_eq!(cred1.renewal_count, 1);
    assert!(cred1.last_renewed_at.is_some());

    // Verify renewal history
    let history = get_renewal_history(&env, 1);
    assert_eq!(history.len(), 1);
}

#[test]
fn test_batch_renew_with_revoked_credential() {
    let (env, admin) = setup_env();
    let recipient = Address::generate(&env);

    // Issue 3 credentials
    batch_issue_credentials(
        &env,
        admin.clone(),
        {
            let mut r = Vec::new(&env);
            for _ in 0..3 {
                r.push_back(recipient.clone());
            }
            r
        },
        {
            let mut t = Vec::new(&env);
            for i in 0..3 {
                t.push_back(String::from_str(&env, &format!("Cred {}", i + 1)));
            }
            t
        },
        {
            let mut d = Vec::new(&env);
            for _ in 0..3 {
                d.push_back(String::from_str(&env, "Desc"));
            }
            d
        },
        String::from_str(&env, "CS101"),
        {
            let mut h = Vec::new(&env);
            h.push_back(String::from_str(&env, "QmA"));
            h.push_back(String::from_str(&env, "QmB"));
            h.push_back(String::from_str(&env, "QmC"));
            h
        },
        86400,
    );

    // Revoke credential 2
    revoke_credential(&env, 2, admin.clone());

    // Batch renew all 3 — credential 2 should fail
    let mut ids = Vec::new(&env);
    ids.push_back(1);
    ids.push_back(2);
    ids.push_back(3);

    let results = batch_renew_credentials(&env, admin, ids, 86400);

    assert_eq!(results.len(), 3);
    assert!(results.get(0).unwrap().success);
    assert!(!results.get(1).unwrap().success);
    assert_eq!(results.get(1).unwrap().error, String::from_str(&env, "Cannot renew revoked credential"));
    assert!(results.get(2).unwrap().success);
}

#[test]
fn test_get_max_batch_size() {
    assert_eq!(get_max_batch_size(), 100);
}

// ═══════════════════════════════════════════════════════════════
//  Existing Functionality Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fn test_issue_and_renew_single_credential() {
    let (env, admin) = setup_env();
    env.ledger().set_timestamp(1000);

    let recipient = Address::generate(&env);
    let credential_id = issue_credential_with_expiration(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Test Credential"),
        String::from_str(&env, "A test credential"),
        String::from_str(&env, "CS101"),
        String::from_str(&env, "QmTestHash"),
        86400,
    );

    assert_eq!(credential_id, 1);

    let cred = get_credential(&env, 1);
    assert_eq!(cred.status, CredentialStatus::Active);
    assert_eq!(cred.issuer, admin);
    assert_eq!(cred.recipient, recipient);
    assert!(cred.expires_at > cred.issued_at);

    // Renew
    let renewed = renew_credential(&env, 1, admin, 86400);
    assert!(renewed);
    let cred = get_credential(&env, 1);
    assert_eq!(cred.renewal_count, 1);
}

#[test]
fn test_revoke_credential() {
    let (env, admin) = setup_env();
    let recipient = Address::generate(&env);

    issue_credential_with_expiration(
        &env,
        admin.clone(),
        recipient,
        String::from_str(&env, "Test Credential"),
        String::from_str(&env, "Desc"),
        String::from_str(&env, "CS101"),
        String::from_str(&env, "QmHash"),
        86400,
    );

    let revoked = revoke_credential(&env, 1, admin);
    assert!(revoked);

    let cred = get_credential(&env, 1);
    assert_eq!(cred.status, CredentialStatus::Revoked);
}

#[test]
fn test_credential_expiration_check() {
    let (env, admin) = setup_env();
    let recipient = Address::generate(&env);

    issue_credential_with_expiration(
        &env,
        admin,
        recipient,
        String::from_str(&env, "Test"),
        String::from_str(&env, "Desc"),
        String::from_str(&env, "CS101"),
        String::from_str(&env, "QmHash"),
        3600, // 1 hour validity
    );

    // Before expiry
    let status = check_credential_expiration(&env, 1);
    assert_eq!(status, CredentialStatus::Active);

    // After expiry
    env.ledger().set_timestamp(1000 + 3601);
    let status = check_credential_expiration(&env, 1);
    assert_eq!(status, CredentialStatus::Expired);
}
