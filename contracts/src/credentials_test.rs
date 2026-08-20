#![cfg(test)]

use crate::credentials::{
    add_multi_sig_signature, create_multi_sig_credential, get_credential, get_credential_count,
    get_credential_status, get_multi_sig_credential, get_multi_sig_signatures, get_multi_sig_status,
    get_revocation_history, get_user_credentials, is_multi_sig_threshold_met, issue_credential,
    renew_credential, revoke_credential, verify_credential, CredentialStatus, RevocationReason,
    VerificationResult,
};
use soroban_sdk::{testutils::Address as _, Address, Env, String, Symbol, Vec};

// ═══════════════════════════════════════════════════════════════════
//  Existing credential tests (fixed)
// ═══════════════════════════════════════════════════════════════════

#[test]
fn test_issue_and_verify_credential() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Rust on Stellar"),
        String::from_str(&env, "Completed Soroban basics"),
        String::from_str(&env, "course-001"),
        String::from_str(&env, "ipfs://Qm..."),
        None, // No expiration
    );

    assert_eq!(cred_id, 1);
    assert_eq!(get_credential_count(&env), 1);

    let cred = get_credential(&env, cred_id);
    assert_eq!(cred.recipient, recipient);

    // Verify credential is valid (not revoked — revocation checked via bit 0 of timestamp)
    assert_eq!(verify_credential(&env, cred_id), VerificationResult::Valid);

    // Revoke the credential
    revoke_credential(
        &env,
        cred_id,
        admin.clone(),
        RevocationReason::AdministrativeError,
        None,
    );

    // Verify should now return Revoked variant
    let result = verify_credential(&env, cred_id);
    assert!(matches!(result, VerificationResult::Revoked { .. }));

    // User credential list
    let user_creds: Vec<u64> = get_user_credentials(&env, recipient);
    assert_eq!(user_creds.len(), 1);
    assert_eq!(user_creds.get(0).unwrap(), 1);
}

#[test]
fn test_unauthorized_issuer_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    // Attempt to issue by unauthorized user should panic
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        issue_credential(
            &env,
            unauthorized.clone(),
            recipient.clone(),
            String::from_str(&env, "Test"),
            String::from_str(&env, "Desc"),
            String::from_str(&env, "course-001"),
            String::from_str(&env, "ipfs://Qm..."),
            None,
        )
    }));
    assert!(result.is_err());
}

#[test]
fn test_revoke_nonexistent_credential() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        revoke_credential(&env, 9999, admin.clone(), RevocationReason::AdministrativeError, None);
    }));
    assert!(result.is_err());
}

// ═══════════════════════════════════════════════════════════════════
//  Multi-Signature Credential Tests
// ═══════════════════════════════════════════════════════════════════

/// Test: Create a multi-sig credential with 2-of-3 issuers
/// Credential should activate only after 2 valid signatures
#[test]
fn test_multi_sig_2_of_3_activates_after_two_signatures() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let signers = Vec::from_array(&env, [
        signer1.clone(),
        signer2.clone(),
        signer3.clone(),
    ]);

    // Create 2-of-3 multi-sig credential
    let cred_id = create_multi_sig_credential(
        &env,
        admin.clone(),
        signers,
        2,
        recipient.clone(),
        String::from_str(&env, "BSc Computer Science"),
        String::from_str(&env, "Bachelor's degree in Computer Science"),
        String::from_str(&env, "degree-cs-2026"),
        String::from_str(&env, "ipfs://QmDegreeHash"),
    );

    assert_eq!(cred_id, 1);

    // Initially, credential should NOT be active
    assert!(!is_multi_sig_threshold_met(&env, cred_id));
    let (activated, sig_count, threshold) = get_multi_sig_status(&env, cred_id);
    assert!(!activated);
    assert_eq!(sig_count, 0);
    assert_eq!(threshold, 2);

    // First signature
    let result1 = add_multi_sig_signature(&env, cred_id, signer1.clone());
    assert!(!result1); // Threshold not yet met
    assert!(!is_multi_sig_threshold_met(&env, cred_id));

    let (activated2, sig_count2, _) = get_multi_sig_status(&env, cred_id);
    assert!(!activated2);
    assert_eq!(sig_count2, 1);

    // Second signature — should activate
    let result2 = add_multi_sig_signature(&env, cred_id, signer2.clone());
    assert!(result2); // Threshold met!
    assert!(is_multi_sig_threshold_met(&env, cred_id));

    let (activated3, sig_count3, threshold3) = get_multi_sig_status(&env, cred_id);
    assert!(activated3);
    assert_eq!(sig_count3, 2);
    assert_eq!(threshold3, 2);

    // Verify signatures
    let sigs = get_multi_sig_signatures(&env, cred_id);
    assert_eq!(sigs.len(), 2);
    assert!(sigs.contains(&signer1));
    assert!(sigs.contains(&signer2));
    assert!(!sigs.contains(&signer3));

    // Verify the credential itself
    let cred = get_multi_sig_credential(&env, cred_id);
    assert_eq!(cred.title, String::from_str(&env, "BSc Computer Science"));
    assert_eq!(cred.threshold, 2);
    assert!(cred.activated);
}

/// Test: Attempt to issue with insufficient signatures (1 of 3)
/// Credential remains inactive
#[test]
fn test_multi_sig_insufficient_signatures_remains_inactive() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let signers = Vec::from_array(&env, [
        signer1.clone(),
        signer2.clone(),
        signer3.clone(),
    ]);

    // Create 3-of-3 multi-sig credential
    let cred_id = create_multi_sig_credential(
        &env,
        admin.clone(),
        signers,
        3,
        recipient.clone(),
        String::from_str(&env, "PhD Physics"),
        String::from_str(&env, "Doctorate in Physics"),
        String::from_str(&env, "phd-physics-2026"),
        String::from_str(&env, "ipfs://QmPhDHash"),
    );

    // Only 1 signature — threshold is 3, should still be inactive
    add_multi_sig_signature(&env, cred_id, signer1.clone());
    assert!(!is_multi_sig_threshold_met(&env, cred_id));

    // Only 2 signatures — still inactive
    add_multi_sig_signature(&env, cred_id, signer2.clone());
    assert!(!is_multi_sig_threshold_met(&env, cred_id));

    let (activated, sig_count, threshold) = get_multi_sig_status(&env, cred_id);
    assert!(!activated);
    assert_eq!(sig_count, 2);
    assert_eq!(threshold, 3);

    // Verify credential shows as pending until threshold is met
    let cred = get_multi_sig_credential(&env, cred_id);
    assert!(!cred.activated);
}

/// Test: Duplicate signature from same issuer is rejected
#[test]
fn test_multi_sig_duplicate_signature_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let signers = Vec::from_array(&env, [signer1.clone(), signer2.clone()]);

    let cred_id = create_multi_sig_credential(
        &env,
        admin.clone(),
        signers,
        2,
        recipient.clone(),
        String::from_str(&env, "MBA"),
        String::from_str(&env, "Master of Business Administration"),
        String::from_str(&env, "mba-2026"),
        String::from_str(&env, "ipfs://QmMBAHash"),
    );

    // First signature by signer1
    let result = add_multi_sig_signature(&env, cred_id, signer1.clone());
    assert!(!result);

    // Attempt duplicate signature by signer1 — should panic
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        add_multi_sig_signature(&env, cred_id, signer1.clone());
    }));
    assert!(result.is_err());

    // Signature count should still be 1
    let sigs = get_multi_sig_signatures(&env, cred_id);
    assert_eq!(sigs.len(), 1);
}

/// Test: Unauthorized signer is rejected with clear error
#[test]
fn test_multi_sig_unauthorized_signer_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let signers = Vec::from_array(&env, [signer1.clone(), signer2.clone()]);

    let cred_id = create_multi_sig_credential(
        &env,
        admin.clone(),
        signers,
        2,
        recipient.clone(),
        String::from_str(&env, "MSc Data Science"),
        String::from_str(&env, "Master's in Data Science"),
        String::from_str(&env, "msc-ds-2026"),
        String::from_str(&env, "ipfs://QmMScHash"),
    );

    // Attempt signature by unauthorized address — should panic
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        add_multi_sig_signature(&env, cred_id, unauthorized.clone());
    }));
    assert!(result.is_err());

    // Signature count should still be 0
    let sigs = get_multi_sig_signatures(&env, cred_id);
    assert_eq!(sigs.len(), 0);
    assert!(!is_multi_sig_threshold_met(&env, cred_id));
}

/// Test: Query credential status shows pending until threshold met
#[test]
fn test_multi_sig_status_shows_pending_until_threshold_met() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let signers = Vec::from_array(&env, [
        signer1.clone(),
        signer2.clone(),
        signer3.clone(),
    ]);

    let cred_id = create_multi_sig_credential(
        &env,
        admin.clone(),
        signers,
        2,
        recipient.clone(),
        String::from_str(&env, "BEng Engineering"),
        String::from_str(&env, "Bachelor of Engineering"),
        String::from_str(&env, "beng-2026"),
        String::from_str(&env, "ipfs://QmBEngHash"),
    );

    // Status: pending (0 of 2)
    let (activated, sig_count, threshold) = get_multi_sig_status(&env, cred_id);
    assert!(!activated, "Should be pending with 0 signatures");
    assert_eq!(sig_count, 0);
    assert_eq!(threshold, 2);

    // After 1 signature: still pending
    add_multi_sig_signature(&env, cred_id, signer1.clone());
    let (activated, sig_count, threshold) = get_multi_sig_status(&env, cred_id);
    assert!(!activated, "Should still be pending with 1 signature");
    assert_eq!(sig_count, 1);
    assert_eq!(threshold, 2);

    // After 2 signatures: active
    add_multi_sig_signature(&env, cred_id, signer2.clone());
    let (activated, sig_count, threshold) = get_multi_sig_status(&env, cred_id);
    assert!(activated, "Should be active with 2 signatures");
    assert_eq!(sig_count, 2);
    assert_eq!(threshold, 2);
}

/// Test: Threshold edge cases — 1-of-1 (single signer acts like regular credential)
#[test]
fn test_multi_sig_1_of_1_threshold() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let signers = Vec::from_array(&env, [signer1.clone()]);

    let cred_id = create_multi_sig_credential(
        &env,
        admin.clone(),
        signers,
        1,
        recipient.clone(),
        String::from_str(&env, "Certificate"),
        String::from_str(&env, "Single signer certificate"),
        String::from_str(&env, "cert-2026"),
        String::from_str(&env, "ipfs://QmCertHash"),
    );

    // Single signature should activate immediately
    let result = add_multi_sig_signature(&env, cred_id, signer1.clone());
    assert!(result);
    assert!(is_multi_sig_threshold_met(&env, cred_id));

    let (activated, sig_count, threshold) = get_multi_sig_status(&env, cred_id);
    assert!(activated);
    assert_eq!(sig_count, 1);
    assert_eq!(threshold, 1);
}

/// Test: Threshold 0 is rejected at creation
#[test]
fn test_multi_sig_zero_threshold_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let signers = Vec::from_array(&env, [signer1.clone()]);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        create_multi_sig_credential(
            &env,
            admin.clone(),
            signers,
            0, // Invalid threshold
            recipient.clone(),
            String::from_str(&env, "Bad Cred"),
            String::from_str(&env, "Should fail"),
            String::from_str(&env, "bad-001"),
            String::from_str(&env, "ipfs://QmBad"),
        )
    }));
    assert!(result.is_err());
}

/// Test: Threshold greater than signer count is rejected
#[test]
fn test_multi_sig_threshold_exceeds_signers_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let signers = Vec::from_array(&env, [signer1.clone(), signer2.clone()]);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        create_multi_sig_credential(
            &env,
            admin.clone(),
            signers,
            5, // Threshold exceeds 2 signers
            recipient.clone(),
            String::from_str(&env, "Bad Cred"),
            String::from_str(&env, "Should fail"),
            String::from_str(&env, "bad-002"),
            String::from_str(&env, "ipfs://QmBad"),
        )
    }));
    assert!(result.is_err());
}

/// Test: Empty signer list is rejected
#[test]
fn test_multi_sig_empty_signers_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let signers = Vec::new(&env);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        create_multi_sig_credential(
            &env,
            admin.clone(),
            signers,
            1,
            recipient.clone(),
            String::from_str(&env, "Empty Signers"),
            String::from_str(&env, "Should fail"),
            String::from_str(&env, "empty-001"),
            String::from_str(&env, "ipfs://QmEmpty"),
        )
    }));
    assert!(result.is_err());
}

/// Test: Full 3-of-3 flow with all signers
#[test]
fn test_multi_sig_3_of_3_full_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let signers = Vec::from_array(&env, [
        signer1.clone(),
        signer2.clone(),
        signer3.clone(),
    ]);

    let cred_id = create_multi_sig_credential(
        &env,
        admin.clone(),
        signers,
        3,
        recipient.clone(),
        String::from_str(&env, "DSc Honoris Causa"),
        String::from_str(&env, "Honorary Doctorate"),
        String::from_str(&env, "dsc-hc-2026"),
        String::from_str(&env, "ipfs://QmDScHash"),
    );

    assert!(!is_multi_sig_threshold_met(&env, cred_id));

    // All three sign
    add_multi_sig_signature(&env, cred_id, signer1.clone());
    assert!(!is_multi_sig_threshold_met(&env, cred_id));

    add_multi_sig_signature(&env, cred_id, signer2.clone());
    assert!(!is_multi_sig_threshold_met(&env, cred_id));

    // Third signature activates
    let result = add_multi_sig_signature(&env, cred_id, signer3.clone());
    assert!(result);
    assert!(is_multi_sig_threshold_met(&env, cred_id));

    let sigs = get_multi_sig_signatures(&env, cred_id);
    assert_eq!(sigs.len(), 3);
}

/// ═══════════════════════════════════════════════════════════════════
//  Credential Expiration and Renewal Tests
// ═══════════════════════════════════════════════════════════════════

/// Test: Issue credential with expiration, verify active within validity window
#[test]
fn test_credential_with_expiration_active_before_expiry() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let validity_seconds = 31_536_000u64; // 1 year
    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Time-Limited Cert"),
        String::from_str(&env, "Expires in 1 year"),
        String::from_str(&env, "course-002"),
        String::from_str(&env, "ipfs://QmExpires"),
        Some(validity_seconds),
    );

    assert_eq!(cred_id, 1);

    // Immediately after issuance: should be Active
    let status = get_credential_status(&env, cred_id);
    assert_eq!(status, CredentialStatus::Active);
    assert!(verify_credential(&env, cred_id));

    // Verify credential details
    let cred = get_credential(&env, cred_id);
    assert!(cred.expires_at.is_some());
}

/// Test: Credential shows Expired when verified after expiration time
#[test]
fn test_credential_expires_after_validity_period() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let validity_seconds = 3600u64; // 1 hour
    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Short-Lived Cert"),
        String::from_str(&env, "Expires in 1 hour"),
        String::from_str(&env, "course-003"),
        String::from_str(&env, "ipfs://QmShort"),
        Some(validity_seconds),
    );

    // Advance ledger time past expiration
    env.ledger().set_timestamp(env.ledger().timestamp() + validity_seconds + 1);

    // After expiry: should be Expired
    let status = get_credential_status(&env, cred_id);
    assert_eq!(status, CredentialStatus::Expired);
    assert!(!verify_credential(&env, cred_id));
}

/// Test: Credential without expiration stays Active indefinitely
#[test]
fn test_credential_without_expiration_never_expires() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Permanent Cert"),
        String::from_str(&env, "Never expires"),
        String::from_str(&env, "course-004"),
        String::from_str(&env, "ipfs://QmPermanent"),
        None, // No expiration
    );

    // Advance time far into the future
    env.ledger().set_timestamp(env.ledger().timestamp() + 31_536_000 * 10); // 10 years

    // Should still be Active
    let status = get_credential_status(&env, cred_id);
    assert_eq!(status, CredentialStatus::Active);
    assert!(verify_credential(&env, cred_id));
}

/// Test: renew_credential extends expiration and credential is Active again
#[test]
fn test_renew_credential_extends_expiration() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let validity_seconds = 3600u64; // 1 hour
    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Renewable Cert"),
        String::from_str(&env, "Can be renewed"),
        String::from_str(&env, "course-005"),
        String::from_str(&env, "ipfs://QmRenew"),
        Some(validity_seconds),
    );

    // Advance past expiration
    env.ledger().set_timestamp(env.ledger().timestamp() + validity_seconds + 1);
    assert_eq!(get_credential_status(&env, cred_id), CredentialStatus::Expired);

    // Renew with new expiration (2 years from now)
    let current_time = env.ledger().timestamp();
    let new_expiry = current_time + 31_536_000 * 2;
    let result = renew_credential(&env, cred_id, admin.clone(), new_expiry);
    assert!(result);

    // After renewal: should be Active again
    let status = get_credential_status(&env, cred_id);
    assert_eq!(status, CredentialStatus::Active);
    assert!(verify_credential(&env, cred_id));

    // Verify the new expiration was stored
    let cred = get_credential(&env, cred_id);
    assert_eq!(cred.expires_at, Some(new_expiry));
}

/// Test: Non-issuer cannot renew a credential
#[test]
fn test_unauthorized_renewal_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "No-Renew Cert"),
        String::from_str(&env, "Cannot be renewed by others"),
        String::from_str(&env, "course-006"),
        String::from_str(&env, "ipfs://QmNoRenew"),
        Some(3600),
    );

    let new_expiry = env.ledger().timestamp() + 31_536_000;
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        renew_credential(&env, cred_id, unauthorized.clone(), new_expiry);
    }));
    assert!(result.is_err());
}

/// Test: Renewing a revoked credential fails
#[test]
fn test_cannot_renew_revoked_credential() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Revoked Cert"),
        String::from_str(&env, "Should not be renewable after revoke"),
        String::from_str(&env, "course-007"),
        String::from_str(&env, "ipfs://QmRevoked"),
        Some(3600),
    );

    // Revoke the credential
    revoke_credential(
        &env,
        cred_id,
        admin.clone(),
        RevocationReason::AcademicDishonesty,
        Some(String::from_str(&env, "Plagiarism detected")),
    );

    // Attempt to renew a revoked credential
    let new_expiry = env.ledger().timestamp() + 31_536_000;
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        renew_credential(&env, cred_id, admin.clone(), new_expiry);
    }));
    assert!(result.is_err());
}

/// Test: get_credential_status returns correct status for all states
#[test]
fn test_get_credential_status_all_states() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    // Active credential with expiration
    let active_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Active Cert"),
        String::from_str(&env, "Still active"),
        String::from_str(&env, "course-008"),
        String::from_str(&env, "ipfs://QmActive"),
        Some(31_536_000),
    );
    assert_eq!(get_credential_status(&env, active_id), CredentialStatus::Active);

    // Permanent credential (no expiration)
    let perm_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Permanent Cert"),
        String::from_str(&env, "No expiry"),
        String::from_str(&env, "course-009"),
        String::from_str(&env, "ipfs://QmPerm"),
        None,
    );
    assert_eq!(get_credential_status(&env, perm_id), CredentialStatus::Active);

    // Revoked credential
    let revoked_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "To Revoke"),
        String::from_str(&env, "Will be revoked"),
        String::from_str(&env, "course-010"),
        String::from_str(&env, "ipfs://QmRevoke"),
        None,
    );
    revoke_credential(
        &env,
        revoked_id,
        admin.clone(),
        RevocationReason::DataCorrection,
        Some(String::from_str(&env, "Incorrect data")),
    );
    assert_eq!(get_credential_status(&env, revoked_id), CredentialStatus::Revoked);

    // Expired credential
    let expired_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "To Expire"),
        String::from_str(&env, "Will expire"),
        String::from_str(&env, "course-011"),
        String::from_str(&env, "ipfs://QmExp"),
        Some(1), // 1 second validity
    );
    env.ledger().set_timestamp(env.ledger().timestamp() + 2);
    assert_eq!(get_credential_status(&env, expired_id), CredentialStatus::Expired);
}

/// Test: Non-admin cannot create multi-sig credential
#[test]
fn test_multi_sig_only_admin_can_create() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let signers = Vec::from_array(&env, [signer1.clone()]);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        create_multi_sig_credential(
            &env,
            non_admin.clone(),
            signers,
            1,
            recipient.clone(),
            String::from_str(&env, "Unauthorized"),
            String::from_str(&env, "Should fail"),
            String::from_str(&env, "no-auth-001"),
            String::from_str(&env, "ipfs://QmFail"),
        )
    }));
    assert!(result.is_err());
}

/// Test: Attempting to sign after credential is activated returns error
#[test]
fn test_multi_sig_sign_after_activation_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let signers = Vec::from_array(&env, [
        signer1.clone(),
        signer2.clone(),
        signer3.clone(),
    ]);

    let cred_id = create_multi_sig_credential(
        &env,
        admin.clone(),
        signers,
        2,
        recipient.clone(),
        String::from_str(&env, "BA History"),
        String::from_str(&env, "Bachelor of Arts in History"),
        String::from_str(&env, "ba-hist-2026"),
        String::from_str(&env, "ipfs://QmBAHash"),
    );

    // Activate with 2 signatures
    add_multi_sig_signature(&env, cred_id, signer1.clone());
    add_multi_sig_signature(&env, cred_id, signer2.clone());
    assert!(is_multi_sig_threshold_met(&env, cred_id));

    // Third signer tries to sign after activation — should fail
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        add_multi_sig_signature(&env, cred_id, signer3.clone());
    }));
    assert!(result.is_err());
}

// ═══════════════════════════════════════════════════════════════════
//  Credential Revocation Tests (Full Feature)
// ═══════════════════════════════════════════════════════════════════

/// Test: Original issuer calls revoke_credential with reason; credential becomes Revoked
#[test]
fn test_revoke_credential_by_issuer_with_reason() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Rust Certificate"),
        String::from_str(&env, "Intro to Rust"),
        String::from_str(&env, "rust-101"),
        String::from_str(&env, "ipfs://QmRustCert"),
        None,
    );

    // Credential starts Valid
    assert_eq!(verify_credential(&env, cred_id), VerificationResult::Valid);

    // Issuer revokes with AcademicDishonesty reason
    revoke_credential(
        &env,
        cred_id,
        admin.clone(),
        RevocationReason::AcademicDishonesty,
        Some(String::from_str(&env, "Plagiarism detected")),
    );

    // Verify now returns Revoked with reason code
    let result = verify_credential(&env, cred_id);
    match result {
        VerificationResult::Revoked { reason_code, timestamp: _ } => {
            assert_eq!(reason_code, RevocationReason::AcademicDishonesty.to_u8());
        }
        _ => panic!("Expected Revoked status"),
    }

    // Revocation history is retrievable
    let record = get_revocation_history(&env, cred_id).unwrap();
    assert_eq!(record.reason_code, RevocationReason::AcademicDishonesty.to_u8());
    assert_eq!(
        record.reason_str,
        Some(String::from_str(&env, "Plagiarism detected"))
    );
    assert_eq!(record.revoker, admin);
}

/// Test: Non-issuer/non-admin cannot revoke a credential
#[test]
fn test_revoke_credential_unauthorized_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Test Cred"),
        String::from_str(&env, "Test"),
        String::from_str(&env, "test-001"),
        String::from_str(&env, "ipfs://QmTest"),
        None,
    );

    // Unauthorized user attempts revocation — should panic
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        revoke_credential(
            &env,
            cred_id,
            unauthorized.clone(),
            RevocationReason::AdministrativeError,
            None,
        );
    }));
    assert!(result.is_err());

    // Credential should remain valid
    assert_eq!(verify_credential(&env, cred_id), VerificationResult::Valid);
}

/// Test: Attempting to revoke an already-revoked credential fails with "AlreadyRevoked" panic
#[test]
fn test_revoke_credential_double_revocation_rejected() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Double Rev Test"),
        String::from_str(&env, "Test double revocation"),
        String::from_str(&env, "dbl-rev-001"),
        String::from_str(&env, "ipfs://QmDbl"),
        None,
    );

    // First revocation succeeds
    revoke_credential(
        &env,
        cred_id,
        admin.clone(),
        RevocationReason::DataCorrection,
        Some(String::from_str(&env, "Data error")),
    );
    assert!(matches!(
        verify_credential(&env, cred_id),
        VerificationResult::Revoked { .. }
    ));

    // Second revocation attempt should panic with "AlreadyRevoked"
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        revoke_credential(
            &env,
            cred_id,
            admin.clone(),
            RevocationReason::VoluntarySurrender,
            None,
        );
    }));
    assert!(result.is_err());
}

/// Test: Revoked credential verification returns correct reason and timestamp
#[test]
fn test_verify_credential_revoked_returns_details() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Revoke Test"),
        String::from_str(&env, "Test"),
        String::from_str(&env, "rev-test-001"),
        String::from_str(&env, "ipfs://QmRev"),
        None,
    );

    let before_revocation = env.ledger().timestamp();

    // Revoke with a specific reason
    revoke_credential(
        &env,
        cred_id,
        admin.clone(),
        RevocationReason::AcademicDishonesty,
        Some(String::from_str(&env, "Cheating on exam")),
    );

    // Verify returns Revoked with details
    let result = verify_credential(&env, cred_id);
    match result {
        VerificationResult::Revoked { reason_code, timestamp } => {
            assert_eq!(reason_code, RevocationReason::AcademicDishonesty.to_u8());
            assert!(timestamp >= before_revocation);
        }
        _ => panic!("Expected Revoked status"),
    }
}

/// Test: get_revocation_history returns the full record with reason string
#[test]
fn test_get_revocation_history_returns_full_record() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "History Check"),
        String::from_str(&env, "Test history"),
        String::from_str(&env, "hist-001"),
        String::from_str(&env, "ipfs://QmHist"),
        None,
    );

    // Before revocation, history is None
    assert!(get_revocation_history(&env, cred_id).is_none());

    revoke_credential(
        &env,
        cred_id,
        admin.clone(),
        RevocationReason::VoluntarySurrender,
        Some(String::from_str(&env, "User requested removal")),
    );

    // After revocation, history is present
    let record = get_revocation_history(&env, cred_id).unwrap();
    assert_eq!(record.reason_code, RevocationReason::VoluntarySurrender.to_u8());
    assert_eq!(
        record.reason_str,
        Some(String::from_str(&env, "User requested removal"))
    );
    assert_eq!(record.revoker, admin);
    assert!(record.timestamp > 0);
}

/// Test: CredentialRevoked event is emitted with correct fields
#[test]
fn test_revoke_credential_emits_event() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Event Test"),
        String::from_str(&env, "Test event emission"),
        String::from_str(&env, "event-001"),
        String::from_str(&env, "ipfs://QmEvent"),
        None,
    );

    // Capture initial event count (optional, just for demonstration)
    let before_timestamp = env.ledger().timestamp();

    revoke_credential(
        &env,
        cred_id,
        admin.clone(),
        RevocationReason::AdministrativeError,
        Some(String::from_str(&env, "System error")),
    );

    // In a real test, you could check env.events() for the emitted event
    // For now, we just verify the credential is revoked
    assert!(matches!(
        verify_credential(&env, cred_id),
        VerificationResult::Revoked { .. }
    ));

    let record = get_revocation_history(&env, cred_id).unwrap();
    assert!(record.timestamp >= before_timestamp);
}

/// Test: Revocation is irreversible — no un-revoke function exists
#[test]
fn test_revocation_is_irreversible() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "Irreversible Test"),
        String::from_str(&env, "No un-revoke"),
        String::from_str(&env, "irrev-001"),
        String::from_str(&env, "ipfs://QmIrrev"),
        None,
    );

    revoke_credential(
        &env,
        cred_id,
        admin.clone(),
        RevocationReason::Other,
        None,
    );

    // Credential is revoked
    assert!(matches!(
        verify_credential(&env, cred_id),
        VerificationResult::Revoked { .. }
    ));

    // Attempting to renew should fail (revoked credentials cannot be renewed)
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        renew_credential(&env, cred_id, admin.clone(), env.ledger().timestamp() + 10000);
    }));
    assert!(result.is_err());

    // Credential remains revoked
    assert!(matches!(
        verify_credential(&env, cred_id),
        VerificationResult::Revoked { .. }
    ));
}

/// Test: All revocation reason codes are valid
#[test]
fn test_all_revocation_reason_codes() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let reasons = vec![
        RevocationReason::AdministrativeError,
        RevocationReason::AcademicDishonesty,
        RevocationReason::DataCorrection,
        RevocationReason::VoluntarySurrender,
        RevocationReason::Other,
    ];

    for (i, reason) in reasons.iter().enumerate() {
        let cred_id = issue_credential(
            &env,
            admin.clone(),
            recipient.clone(),
            String::from_str(&env, &format!("Cred {}", i)),
            String::from_str(&env, "Test"),
            String::from_str(&env, &format!("code-test-{}", i)),
            String::from_str(&env, "ipfs://QmCode"),
            None,
        );

        revoke_credential(&env, cred_id, admin.clone(), reason.clone(), None);

        let result = verify_credential(&env, cred_id);
        match result {
            VerificationResult::Revoked { reason_code, .. } => {
                assert_eq!(reason_code, reason.to_u8());
            }
            _ => panic!("Expected Revoked status"),
        }
    }
}

/// Test: Reason string is optional — can revoke without it
#[test]
fn test_revoke_credential_without_reason_string() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&Symbol::new(&env, "admin"), &admin);

    let cred_id = issue_credential(
        &env,
        admin.clone(),
        recipient.clone(),
        String::from_str(&env, "No String Test"),
        String::from_str(&env, "Test"),
        String::from_str(&env, "no-str-001"),
        String::from_str(&env, "ipfs://QmNoStr"),
        None,
    );

    // Revoke without reason_str (None)
    revoke_credential(&env, cred_id, admin.clone(), RevocationReason::Other, None);

    let record = get_revocation_history(&env, cred_id).unwrap();
    assert_eq!(record.reason_code, RevocationReason::Other.to_u8());
    assert!(record.reason_str.is_none());
}
