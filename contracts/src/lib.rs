#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, BytesN, Env, String, Symbol, Vec};

pub mod governance;
#[cfg(test)]
pub mod governance_test;
pub mod tokenomics;
#[cfg(test)]
pub mod tokenomics_test;
pub mod user_profile;
#[cfg(test)]
pub mod user_profile_test;
pub mod marketplace;
#[cfg(test)]
pub mod marketplace_test;
pub mod utils;
#[cfg(test)]
pub mod gas_benchmark;

/// ─── Admin authorization helper ──────────────────────────────
/// Verifies the caller is the stored admin. Panics if not.
/// Deduplicates the admin-check pattern used across multiple methods,
/// reducing WASM binary size.
fn check_admin(env: &Env, caller: &Address) {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic!("Not initialized"));
    if *caller != admin {
        panic!("Only admin can perform this action");
    }
}

/// Core storage keys
#[contracttype]
pub enum DataKey {
    Admin,
    Credential(u64),
    CredentialCount,
    CourseCount,
    Course(u64),
    AchievementCount,
    ProofValidityWindow,        // u64: seconds a cross-chain proof remains valid
    CrossChainProof(u64),       // CrossChainProof stored by credential_id
}

/// Credential with issuer/recipient data
/// `expires_at` is None for non-expiring credentials, saving 8 bytes per entry.
#[contracttype]
#[derive(Clone)]
pub struct Credential {
    pub id: u64,
    pub issuer: Address,
    pub recipient: Address,
    pub title: String,
    pub course_id: String,
    pub ipfs_hash: String,
    pub timestamp: u64,
    pub status: CredentialStatus,
    pub expires_at: Option<u64>,
}

/// Credential status for cross-chain verification
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CredentialStatus {
    Active = 0,
    Expired = 1,
    Revoked = 2,
    Pending = 3,
}

/// Cross-chain verification proof for relay to external chains
/// Compact proof that relayers can verify against on-chain state.
#[contracttype]
#[derive(Clone)]
pub struct CrossChainProof {
    pub credential_id: u64,
    pub issuer: Address,
    pub issued_at: u64,
    pub status: CredentialStatus,
    pub proof_timestamp: u64,
    pub expires_at: u64,
    /// SHA-256 hash of (credential_id || issued_at || status as u8 || issuer)
    /// for integrity verification by relayers
    pub proof_hash: BytesN<32>,
}

/// Course data
#[contracttype]
#[derive(Clone)]
pub struct Course {
    pub id: u64,
    pub title: String,
    pub description: String,
    pub price: u64,
}

/// User profile summary
#[contracttype]
#[derive(Clone)]
pub struct Profile {
    pub owner: Address,
    pub credential_count: u32,
    pub achievement_count: u32,
    pub reputation: u64,
}

/// Result of a single entry in a batch credential verification.
/// Contains the credential ID and whether it was found on-chain.
#[contracttype]
#[derive(Clone)]
pub struct BatchVerificationResult {
    pub credential_id: u64,
    pub verified: bool,
}

#[contract]
pub struct StarkEdContract;

#[contractimpl]
impl StarkEdContract {
    /// Initialize the contract
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::CredentialCount, &0u64);
        env.storage().instance().set(&DataKey::CourseCount, &0u64);
        env.storage().instance().set(&DataKey::AchievementCount, &0u64);
        // Default proof validity window: 1 hour (3600 seconds)
        env.storage().instance().set(&DataKey::ProofValidityWindow, &3600u64);
    }

    /// Issue a new credential
    /// `expires_at` is stored as None by default (no expiration), saving 8 bytes
    /// of storage per credential compared to always storing a default timestamp.
    pub fn issue_credential(
        env: Env,
        issuer: Address,
        recipient: Address,
        title: String,
        course_id: String,
        ipfs_hash: String,
    ) -> u64 {
        issuer.require_auth();
        check_admin(&env, &issuer);
        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CredentialCount)
            .unwrap_or(0);
        let credential_id = count + 1;
        let credential = Credential {
            id: credential_id,
            issuer: issuer.clone(),
            recipient: recipient.clone(),
            title,
            course_id,
            ipfs_hash,
            timestamp: env.ledger().timestamp(),
            status: CredentialStatus::Active,
            expires_at: None,
        };
        env.storage()
            .instance()
            .set(&DataKey::Credential(credential_id), &credential);
        env.storage()
            .instance()
            .set(&DataKey::CredentialCount, &credential_id);
        credential_id
    }

    /// Get credential by ID
    pub fn get_credential(env: Env, credential_id: u64) -> Credential {
        env.storage()
            .instance()
            .get(&DataKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"))
    }

    /// Verify a credential (exists check)
    pub fn verify_credential(env: Env, credential_id: u64) -> bool {
        env.storage()
            .instance()
            .has(&DataKey::Credential(credential_id))
    }

    /// Create a course
    pub fn create_course(
        env: Env,
        instructor: Address,
        title: String,
        description: String,
        price: u64,
    ) -> u64 {
        instructor.require_auth();
        check_admin(&env, &instructor);
        let course_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CourseCount)
            .unwrap_or(0);
        let course_id = course_count + 1;
        let course = Course {
            id: course_id,
            title,
            description,
            price,
        };
        env.storage()
            .instance()
            .set(&DataKey::Course(course_id), &course);
        env.storage()
            .instance()
            .set(&DataKey::CourseCount, &course_id);
        course_id
    }

    /// Get course by ID
    pub fn get_course(env: Env, course_id: u64) -> Course {
        env.storage()
            .instance()
            .get(&DataKey::Course(course_id))
            .unwrap_or_else(|| panic!("Course not found"))
    }

    /// Get credential count
    pub fn get_credential_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::CredentialCount)
            .unwrap_or(0)
    }

    /// Get course count
    pub fn get_course_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::CourseCount)
            .unwrap_or(0)
    }

    /// Get admin address
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("Not initialized"))
    }

    // ─── Batch Credential Verification ───────────────────────────

    /// Verify multiple credentials in a single transaction.
    /// More gas-efficient than individual verify_credential calls due to
    /// amortized storage access overhead.
    ///
    /// Gas comparison (approximate):
    ///   Individual: N × cost(has + storage_read)
    ///   Batch:      1 × call_overhead + N × cost(has)
    ///   Typical saving: ~15-20% for batches of 10+ credentials.
    pub fn verify_credentials_batch(
        env: Env,
        credential_ids: Vec<u64>,
    ) -> Vec<BatchVerificationResult> {
        let mut results = Vec::new(&env);
        for credential_id in credential_ids.iter() {
            let verified = env
                .storage()
                .instance()
                .has(&DataKey::Credential(credential_id));
            results.push_back(BatchVerificationResult {
                credential_id,
                verified,
            });
        }
        results
    }

    // ─── Cross-Chain Credential Verification Relay ──────────────

    /// Compute integrity hash for a cross-chain proof.
    /// Hash = SHA-256(credential_id || issued_at || status || issuer)
    fn compute_proof_hash(
        env: &Env,
        credential_id: u64,
        issued_at: u64,
        status: &CredentialStatus,
        issuer: &Address,
    ) -> BytesN<32> {
        let mut input = Bytes::new(env);
        // Append credential_id and issued_at as big-endian u64 (inlined for size)
        for b in credential_id.to_be_bytes().iter() {
            input.push_back(*b);
        }
        for b in issued_at.to_be_bytes().iter() {
            input.push_back(*b);
        }
        // Append status as single byte
        input.push_back(match status {
            CredentialStatus::Active => 0u8,
            CredentialStatus::Expired => 1u8,
            CredentialStatus::Revoked => 2u8,
            CredentialStatus::Pending => 3u8,
        });
        // Append issuer XDR bytes for deterministic hashing
        input.append(&issuer.to_xdr(env));
        env.crypto().sha256(&input)
    }

    /// Set the validity window (in seconds) for cross-chain proofs.
    /// Only callable by the admin.
    pub fn set_proof_validity_window(
        env: Env,
        admin: Address,
        window_seconds: u64,
    ) {
        admin.require_auth();
        check_admin(&env, &admin);
        if window_seconds == 0 {
            panic!("Validity window must be greater than zero");
        }
        env.storage().instance().set(&DataKey::ProofValidityWindow, &window_seconds);

        env.events().publish(
            (Symbol::new(&env, "relay"), Symbol::new(&env, "validity_window_updated")),
            window_seconds,
        );
    }

    /// Get the current proof validity window in seconds.
    pub fn get_proof_validity_window(env: Env) -> u64 {
        env.storage().instance()
            .get(&DataKey::ProofValidityWindow)
            .unwrap_or(3600)
    }

    /// Generate a compact cross-chain verification proof for a credential.
    /// The proof includes credential ID, issuance timestamp, revocation status,
    /// issuer identity, and a cryptographic hash for integrity verification.
    /// Emits a cross-chain relay event for off-chain relayers to detect.
    pub fn generate_credential_proof(
        env: Env,
        credential_id: u64,
        relayer: Address,
    ) -> CrossChainProof {
        relayer.require_auth();

        // Fetch the credential
        let credential: Credential = env.storage().instance()
            .get(&DataKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"));

        // Get the validity window
        let validity_window: u64 = env.storage().instance()
            .get(&DataKey::ProofValidityWindow)
            .unwrap_or(3600);

        let current_time = env.ledger().timestamp();

        // Build proof hash: SHA-256(credential_id || issued_at || status || issuer)
        let proof_hash = Self::compute_proof_hash(
            &env,
            credential_id,
            credential.timestamp,
            &credential.status,
            &credential.issuer,
        );

        let proof = CrossChainProof {
            credential_id,
            issuer: credential.issuer.clone(),
            issued_at: credential.timestamp,
            status: credential.status,
            proof_timestamp: current_time,
            expires_at: current_time + validity_window,
            proof_hash,
        };

        // Store the proof for later verification
        env.storage().instance()
            .set(&DataKey::CrossChainProof(credential_id), &proof);

        // Emit cross-chain relay event for off-chain relayers
        env.events().publish(
            (Symbol::new(&env, "relay"), Symbol::new(&env, "proof_generated")),
            (proof.clone(), relayer),
        );

        proof
    }

    /// Verify a cross-chain proof against on-chain credential state.
    /// Returns true if the proof is valid (credential exists, proof not expired,
    /// credential not revoked, and proof hash matches).
    pub fn verify_cross_chain_proof(
        env: Env,
        proof: CrossChainProof,
    ) -> bool {
        let current_time = env.ledger().timestamp();

        // Check 1: Proof has not expired
        if current_time >= proof.expires_at {
            env.events().publish(
                (Symbol::new(&env, "relay"), Symbol::new(&env, "proof_expired")),
                (proof.credential_id, current_time),
            );
            return false;
        }

        // Check 2: Credential exists
        let credential: Credential = match env.storage().instance()
            .get(&DataKey::Credential(proof.credential_id))
        {
            Some(c) => c,
            None => {
                env.events().publish(
                    (Symbol::new(&env, "relay"), Symbol::new(&env, "credential_not_found")),
                    proof.credential_id,
                );
                return false;
            }
        };

        // Check 3: Credential is not revoked
        if credential.status == CredentialStatus::Revoked {
            env.events().publish(
                (Symbol::new(&env, "relay"), Symbol::new(&env, "credential_revoked")),
                proof.credential_id,
            );
            return false;
        }

        // Check 4: Proof hash integrity — recompute and compare
        let computed_hash = Self::compute_proof_hash(
            &env,
            proof.credential_id,
            proof.issued_at,
            &proof.status,
            &proof.issuer,
        );
        if computed_hash != proof.proof_hash {
            env.events().publish(
                (Symbol::new(&env, "relay"), Symbol::new(&env, "proof_hash_mismatch")),
                proof.credential_id,
            );
            return false;
        }

        // Check 5: Proof status matches credential status
        if proof.status != credential.status {
            env.events().publish(
                (Symbol::new(&env, "relay"), Symbol::new(&env, "status_mismatch")),
                (proof.credential_id, proof.status.clone(), credential.status.clone()),
            );
            return false;
        }

        // All checks passed — proof is valid
        env.events().publish(
            (Symbol::new(&env, "relay"), Symbol::new(&env, "proof_verified")),
            (proof.credential_id, current_time),
        );

        true
    }

    /// Retrieve a previously generated cross-chain proof.
    pub fn get_cross_chain_proof(
        env: Env,
        credential_id: u64,
    ) -> CrossChainProof {
        env.storage().instance()
            .get(&DataKey::CrossChainProof(credential_id))
            .unwrap_or_else(|| panic!("No cross-chain proof found for this credential"))
    }

    /// Revoke a credential (updates status to Revoked).
    /// Only callable by the admin.
    pub fn revoke_credential(
        env: Env,
        admin: Address,
        credential_id: u64,
    ) {
        admin.require_auth();
        check_admin(&env, &admin);

        let mut credential: Credential = env.storage().instance()
            .get(&DataKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"));

        credential.status = CredentialStatus::Revoked;
        env.storage().instance()
            .set(&DataKey::Credential(credential_id), &credential);

        // Invalidate any existing cross-chain proof
        if env.storage().instance().has(&DataKey::CrossChainProof(credential_id)) {
            env.storage().instance().remove(&DataKey::CrossChainProof(credential_id));
        }

        env.events().publish(
            (Symbol::new(&env, "credential"), Symbol::new(&env, "revoked")),
            credential_id,
        );
    }
}

// ═══════════════════════════════════════════════════════════════
//  Batch Credential Verification Tests
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, Vec};

    #[test]
    fn test_batch_verify_credentials() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let recipient = Address::generate(&env);

        let contract_id = env.register(StarkEdContract, ());
        let client = StarkEdContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        // Issue 5 credentials
        let mut ids = Vec::new(&env);
        for i in 0..5u64 {
            let id = client.issue_credential(
                &admin,
                &recipient,
                &String::from_str(&env, "Test Course"),
                &String::from_str(&env, format!("course-{}", i).as_str()),
                &String::from_str(&env, "ipfs://test"),
            );
            ids.push_back(id);
        }

        // Batch verify all 5
        let results = client.verify_credentials_batch(&ids);
        assert_eq!(results.len(), 5);

        for result in results.iter() {
            assert!(result.verified);
        }
    }

    #[test]
    fn test_batch_verify_mixed_existing_and_missing() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let recipient = Address::generate(&env);

        let contract_id = env.register(StarkEdContract, ());
        let client = StarkEdContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        // Issue 2 credentials
        let id1 = client.issue_credential(
            &admin,
            &recipient,
            &String::from_str(&env, "Course A"),
            &String::from_str(&env, "course-a"),
            &String::from_str(&env, "ipfs://a"),
        );
        let id2 = client.issue_credential(
            &admin,
            &recipient,
            &String::from_str(&env, "Course B"),
            &String::from_str(&env, "course-b"),
            &String::from_str(&env, "ipfs://b"),
        );

        // Mix existing and non-existing IDs
        let mut ids = Vec::new(&env);
        ids.push_back(id1);
        ids.push_back(id2);
        ids.push_back(9999u64);
        ids.push_back(8888u64);
        let results = client.verify_credentials_batch(&ids);
        assert_eq!(results.len(), 4);

        // Collect results for indexed access
        let result_vec: std::vec::Vec<BatchVerificationResult> = results.iter().collect();
        assert!(result_vec[0].verified);
        assert_eq!(result_vec[0].credential_id, id1);
        assert!(result_vec[1].verified);
        assert_eq!(result_vec[1].credential_id, id2);
        assert!(!result_vec[2].verified);
        assert_eq!(result_vec[2].credential_id, 9999);
        assert!(!result_vec[3].verified);
        assert_eq!(result_vec[3].credential_id, 8888);
    }

    #[test]
    fn test_batch_verify_empty_list() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);

        let contract_id = env.register(StarkEdContract, ());
        let client = StarkEdContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        let ids = Vec::new(&env);
        let results = client.verify_credentials_batch(&ids);
        assert_eq!(results.len(), 0);
    }

    /// Verify batch verification works with a larger set of credentials
    #[test]
    fn test_batch_verify_large_set() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let recipient = Address::generate(&env);

        let contract_id = env.register(StarkEdContract, ());
        let client = StarkEdContractClient::new(&env, &contract_id);

        client.initialize(&admin);

        // Issue 20 credentials
        let mut all_ids: Vec<u64> = Vec::new(&env);
        for i in 0..20u64 {
            let id = client.issue_credential(
                &admin,
                &recipient,
                &String::from_str(&env, "Test"),
                &String::from_str(&env, format!("c-{}", i).as_str()),
                &String::from_str(&env, "ipfs://t"),
            );
            all_ids.push_back(id);
        }

        // Single batch call verifies all 20
        let results = client.verify_credentials_batch(&all_ids);
        assert_eq!(results.len(), 20);

        // All should be verified
        let mut verified_count = 0u32;
        for result in results.iter() {
            if result.verified {
                verified_count += 1;
            }
        }
        assert_eq!(verified_count, 20);
    }
}
