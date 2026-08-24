//! # StarkEd Core Contract
//!
//! Root entry point for the StarkEd on-chain system deployed on Stellar /
//! Soroban.  Exposes [`StarkEdContract`] which aggregates credential
//! issuance, course management, cross-chain credential verification, and
//! dynamic NFT achievement badges.
//!
//! ## Sub-modules
//!
//! | Module | Purpose |
//! |---|---|
//! | [`governance`] | On-chain voting, proposals, and scholarship disbursement |
//! | [`tokenomics`] | Reward-token minting, staking, and quadratic voting |
//! | [`user_profile`] | User profiles and achievement tracking |
//! | [`dynamic_nft`] | Dynamic NFT achievement badge lifecycle |
//! | [`dynamic_fees`] | Dynamic fee computation |
//! | [`marketplace`] | Course marketplace |
//! | [`credential_registry`] | Extended credential registry |
//! | [`pause`] | Emergency pause / circuit-breaker |
//! | [`utils`] | Shared storage helpers and formatting utilities |

#![no_std]
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Bytes, BytesN, Env, String, Symbol, Vec,
};
use crate::dynamic_nft::{DynamicNFT, CertificateTier, RarityTier, BadgeUpgradeRecord};

pub mod credential_registry;
#[cfg(test)]
pub mod credential_registry_test;
#[cfg(test)]
pub mod gas_benchmark;
pub mod dynamic_nft;
pub mod governance;
#[cfg(test)]
pub mod dynamic_nft_test;
#[cfg(test)]
pub mod governance_test;
pub mod dynamic_fees;
#[cfg(test)]
pub mod dynamic_fees_test;
pub mod marketplace;
#[cfg(test)]
pub mod marketplace_test;
pub mod pause;
pub mod tokenomics;
#[cfg(test)]
pub mod tokenomics_test;
pub mod user_profile;
#[cfg(test)]
pub mod user_profile_test;
pub mod utils;
pub mod events;

use crate::governance::{Governance, Role};

/// ─── Admin authorization helper ──────────────────────────────
/// Verifies the caller holds the Admin role. Panics if not.
/// Deduplicates the admin-check pattern used across multiple methods,
/// reducing WASM binary size.
///
/// # Panics
///
/// - `"Not initialized"` — contract has not been initialised.
/// - `"Only admin can perform this action"` — `*caller` ≠ admin.
fn check_admin(env: &Env, caller: &Address) {
    if !Governance::has_role(env, caller, Role::Admin) {
        panic!("Only admin can perform this action");
    }
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

/// Top-level storage keys for [`StarkEdContract`].
#[contracttype]
pub enum DataKey {
    /// Address of the contract administrator.
    Admin,
    /// [`Credential`] struct keyed by credential ID.
    Credential(u64),
    /// Running total of issued credentials.
    CredentialCount,
    /// Running total of created courses.
    CourseCount,
    /// [`Course`] struct keyed by course ID.
    Course(u64),
    /// Global achievement counter.
    AchievementCount,
    /// Seconds a cross-chain proof remains valid after generation.
    ProofValidityWindow,
    /// [`CrossChainProof`] keyed by credential ID.
    CrossChainProof(u64),
}

// ─── Core types ───────────────────────────────────────────────────────────────

/// An on-chain credential issued to a learner upon course completion.
///
/// `expires_at` is `None` for non-expiring credentials, saving 8 bytes per
/// entry compared to always storing a default timestamp.
#[contracttype]
#[derive(Clone)]
pub struct Credential {
    /// Auto-incremented unique identifier (1-based).
    pub id: u64,
    /// Address of the issuing administrator.
    pub issuer: Address,
    /// Address of the learner who received the credential.
    pub recipient: Address,
    /// Human-readable credential title.
    pub title: String,
    /// Off-chain course identifier.
    pub course_id: String,
    /// IPFS CID pointing to the full credential document.
    pub ipfs_hash: String,
    /// Ledger timestamp when the credential was issued.
    pub timestamp: u64,
    /// Current lifecycle status of the credential.
    pub status: CredentialStatus,
    /// Optional expiry timestamp.  `None` means the credential never expires.
    pub expires_at: Option<u64>,
}

/// Lifecycle status for cross-chain credential verification.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CredentialStatus {
    /// Credential is currently valid.
    Active = 0,
    /// Credential has passed its `expires_at` timestamp.
    Expired = 1,
    /// Credential has been explicitly revoked by the admin.
    Revoked = 2,
    /// Credential has been created but not yet activated.
    Pending = 3,
}

/// Compact cross-chain verification proof for relay to external chains.
///
/// Relayers can verify the [`proof_hash`][CrossChainProof::proof_hash]
/// against on-chain state without fetching the full [`Credential`].
#[contracttype]
#[derive(Clone)]
pub struct CrossChainProof {
    /// ID of the credential this proof covers.
    pub credential_id: u64,
    /// Address that issued the underlying credential.
    pub issuer: Address,
    /// Ledger timestamp when the credential was originally issued.
    pub issued_at: u64,
    /// Status of the credential at proof-generation time.
    pub status: CredentialStatus,
    /// Ledger timestamp when this proof was generated.
    pub proof_timestamp: u64,
    /// Ledger timestamp after which this proof must no longer be trusted.
    pub expires_at: u64,
    /// SHA-256 hash of `(credential_id ‖ issued_at ‖ status as u8 ‖ issuer)`
    /// for integrity verification by relayers.
    pub proof_hash: BytesN<32>,
}

/// An on-chain course record.
#[contracttype]
#[derive(Clone)]
pub struct Course {
    /// Auto-incremented unique identifier (1-based).
    pub id: u64,
    /// Display title of the course.
    pub title: String,
    /// Short description of the course content.
    pub description: String,
    /// Enrollment price in platform token units.
    pub price: u64,
}

/// Lightweight on-chain profile summary (full data lives in [`user_profile`]).
#[contracttype]
#[derive(Clone)]
pub struct Profile {
    /// Address that owns this profile.
    pub owner: Address,
    /// Number of credentials held.
    pub credential_count: u32,
    /// Number of achievements earned.
    pub achievement_count: u32,
    /// Cumulative reputation score.
    pub reputation: u64,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

/// The root StarkEd smart contract.
///
/// Aggregates credential issuance, course management, cross-chain
/// verification proofs, and dynamic NFT achievement badges.
///
/// # Deployment workflow
///
/// 1. Deploy this contract; call `initialize(admin)` once.
/// 2. Use `create_course` to register courses.
/// 3. Use `issue_credential` to award learners.
/// 4. Use `generate_credential_proof` to produce cross-chain relay proofs.
/// 5. Use `mint_dynamic_nft` and `evolve_nft` for badge management.
#[contract]
pub struct StarkEdContract;

#[contractimpl]
impl StarkEdContract {
    /// Initialise the contract and set the admin address.
    ///
    /// Must be called exactly once immediately after deployment.  Counters
    /// are set to zero and the default proof validity window is set to
    /// 3 600 seconds (1 hour).
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `admin` – Address that will have exclusive admin authority.
    ///
    /// # Panics
    ///
    /// Panics with `"Contract already initialized"` if called more than once.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::CredentialCount, &0u64);
        env.storage().instance().set(&DataKey::CourseCount, &0u64);
        env.storage()
            .instance()
            .set(&DataKey::AchievementCount, &0u64);
        // Default proof validity window: 1 hour (3600 seconds)
        env.storage()
            .instance()
            .set(&DataKey::ProofValidityWindow, &3600u64);
        // Grant Admin role to the initial admin so it can assign other roles.
        Governance::grant_role(&env, admin.clone(), Role::Admin, admin);
    }

    /// Issue a new on-chain credential to a learner.
    ///
    /// Only the admin may call this function.  `expires_at` defaults to
    /// `None` (no expiration), saving 8 bytes of storage per credential.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `issuer` – Caller; must be the admin address.
    /// - `recipient` – Learner address receiving the credential.
    /// - `title` – Human-readable credential title.
    /// - `course_id` – Identifier of the completed course.
    /// - `ipfs_hash` – IPFS CID of the full credential document.
    ///
    /// # Returns
    ///
    /// The newly assigned credential ID (`u64`, 1-based).
    ///
    /// # Panics
    ///
    /// - `"Not initialized"` — contract not yet initialised.
    /// - `"Only admin can perform this action"` — `issuer` ≠ admin.
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

    /// Retrieve a credential by its ID.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `credential_id` – 1-based ID returned by `issue_credential`.
    ///
    /// # Returns
    ///
    /// The [`Credential`] struct.
    ///
    /// # Panics
    ///
    /// Panics with `"Credential not found"` if the ID does not exist.
    pub fn get_credential(env: Env, credential_id: u64) -> Credential {
        env.storage()
            .instance()
            .get(&DataKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"))
    }

    /// Check whether a credential ID exists on-chain.
    ///
    /// Lightweight existence check — does not load the full struct.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `credential_id` – ID to check.
    ///
    /// # Returns
    ///
    /// `true` if the credential exists; `false` otherwise.
    pub fn verify_credential(env: Env, credential_id: u64) -> bool {
        env.storage()
            .instance()
            .has(&DataKey::Credential(credential_id))
    }

    /// Create a new course record on-chain.
    ///
    /// Only the admin may call this function.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `instructor` – Caller; must be the admin address.
    /// - `title` – Display name of the course.
    /// - `description` – Short description.
    /// - `price` – Enrollment price in platform token units.
    ///
    /// # Returns
    ///
    /// The newly assigned course ID (`u64`, 1-based).
    ///
    /// # Panics
    ///
    /// - `"Not initialized"` — contract not yet initialised.
    /// - `"Only admin can perform this action"` — `instructor` ≠ admin.
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

    /// Retrieve a course by its ID.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `course_id` – 1-based ID returned by `create_course`.
    ///
    /// # Returns
    ///
    /// The [`Course`] struct.
    ///
    /// # Panics
    ///
    /// Panics with `"Course not found"` if the ID does not exist.
    pub fn get_course(env: Env, course_id: u64) -> Course {
        env.storage()
            .instance()
            .get(&DataKey::Course(course_id))
            .unwrap_or_else(|| panic!("Course not found"))
    }

    /// Return the total number of credentials issued.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    ///
    /// # Returns
    ///
    /// Credential count (`u64`).  Returns `0` before any credentials are
    /// issued.
    pub fn get_credential_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::CredentialCount)
            .unwrap_or(0)
    }

    /// Return the total number of courses created.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    ///
    /// # Returns
    ///
    /// Course count (`u64`).  Returns `0` before any courses are created.
    pub fn get_course_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::CourseCount)
            .unwrap_or(0)
    }

    /// Return the admin address.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    ///
    /// # Returns
    ///
    /// The admin [`Address`].
    ///
    /// # Panics
    ///
    /// Panics with `"Not initialized"` if called before `initialize`.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("Not initialized"))
    }

    // ─── Role-Based Access Control (RBAC) ──────────────────────────

    /// Grant a protocol role to an address. Only callable by an existing Admin.
    /// Role 0 = Admin, 1 = Issuer, 2 = Verifier.
    pub fn grant_role(env: Env, admin: Address, role_discriminant: u32, grantee: Address) {
        let role = Role::from_u32(role_discriminant);
        Governance::grant_role(&env, admin, role, grantee);
    }

    /// Revoke a protocol role from an address. Only callable by an existing Admin.
    /// The last Admin cannot be revoked.
    pub fn revoke_role(env: Env, admin: Address, role_discriminant: u32, target: Address) {
        let role = Role::from_u32(role_discriminant);
        Governance::revoke_role(&env, admin, role, target);
    }

    /// Check whether an address holds a given role.
    pub fn has_role(env: Env, addr: Address, role_discriminant: u32) -> bool {
        let role = Role::from_u32(role_discriminant);
        Governance::has_role(&env, &addr, role)
    }

    /// Get the number of addresses that hold a given role.
    pub fn get_role_member_count(env: Env, role_discriminant: u32) -> u32 {
        let role = Role::from_u32(role_discriminant);
        Governance::get_role_member_count(&env, role)
    }

    // ─── Cross-Chain Credential Verification Relay ──────────────

    /// Compute an integrity hash for a cross-chain proof.
    ///
    /// Hash = SHA-256(`credential_id` ‖ `issued_at` ‖ `status as u8` ‖ `issuer XDR`)
    ///
    /// Private helper; called by `generate_credential_proof` and
    /// `verify_cross_chain_proof`.
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

    /// Set the validity window (seconds) for cross-chain proofs.
    ///
    /// Only callable by the admin.  Emits a `(relay, validity_window_updated)`
    /// event.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `admin` – Admin address; must sign the transaction.
    /// - `window_seconds` – New validity duration in seconds.  Must be > 0.
    ///
    /// # Panics
    ///
    /// - `"Not initialized"` / `"Only admin can perform this action"` —
    ///   `admin` is not the stored admin.
    /// - `"Validity window must be greater than zero"` — `window_seconds == 0`.
    pub fn set_proof_validity_window(env: Env, admin: Address, window_seconds: u64) {
        admin.require_auth();
        check_admin(&env, &admin);
        if window_seconds == 0 {
            panic!("Validity window must be greater than zero");
        }
        env.storage()
            .instance()
            .set(&DataKey::ProofValidityWindow, &window_seconds);

        env.events().publish(
            (
                Symbol::new(&env, "relay"),
                Symbol::new(&env, "validity_window_updated"),
            ),
            window_seconds,
        );
    }

    /// Return the current proof validity window in seconds.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    ///
    /// # Returns
    ///
    /// Validity window (`u64`).  Defaults to `3 600` if not explicitly set.
    pub fn get_proof_validity_window(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::ProofValidityWindow)
            .unwrap_or(3600)
    }

    /// Generate a compact cross-chain verification proof for a credential.
    ///
    /// Stores the proof on-chain and emits a `(relay, proof_generated)` event
    /// that off-chain relayers can detect.  The proof includes:
    /// - Credential ID, issuance timestamp, revocation status, and issuer.
    /// - A SHA-256 integrity hash for tamper detection.
    /// - An `expires_at` timestamp = `now + validity_window`.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `credential_id` – ID of the credential to prove.
    /// - `relayer` – Address requesting the proof; must sign the transaction.
    ///
    /// # Returns
    ///
    /// The generated [`CrossChainProof`].
    ///
    /// # Panics
    ///
    /// Panics with `"Credential not found"` if `credential_id` does not exist.
    pub fn generate_credential_proof(
        env: Env,
        credential_id: u64,
        relayer: Address,
    ) -> CrossChainProof {
        relayer.require_auth();

        // Fetch the credential
        let credential: Credential = env
            .storage()
            .instance()
            .get(&DataKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"));

        // Get the validity window
        let validity_window: u64 = env
            .storage()
            .instance()
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
        env.storage()
            .instance()
            .set(&DataKey::CrossChainProof(credential_id), &proof);

        // Emit cross-chain relay event for off-chain relayers
        env.events().publish(
            (
                Symbol::new(&env, "relay"),
                Symbol::new(&env, "proof_generated"),
            ),
            (proof.clone(), relayer),
        );

        proof
    }

    /// Verify a cross-chain proof against on-chain credential state.
    ///
    /// Runs five sequential checks:
    /// 1. Proof has not expired (`current_time < proof.expires_at`).
    /// 2. Credential still exists on-chain.
    /// 3. Credential is not revoked.
    /// 4. Proof hash matches a freshly computed hash.
    /// 5. Proof status matches the current on-chain credential status.
    ///
    /// Emits a specific event for each failure case to assist relayer
    /// debugging.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `proof` – The [`CrossChainProof`] to verify.
    ///
    /// # Returns
    ///
    /// `true` if all checks pass; `false` otherwise.
    pub fn verify_cross_chain_proof(env: Env, proof: CrossChainProof) -> bool {
        let current_time = env.ledger().timestamp();

        // Check 1: Proof has not expired
        if current_time >= proof.expires_at {
            env.events().publish(
                (
                    Symbol::new(&env, "relay"),
                    Symbol::new(&env, "proof_expired"),
                ),
                (proof.credential_id, current_time),
            );
            return false;
        }

        // Check 2: Credential exists
        let credential: Credential = match env
            .storage()
            .instance()
            .get(&DataKey::Credential(proof.credential_id))
        {
            Some(c) => c,
            None => {
                env.events().publish(
                    (
                        Symbol::new(&env, "relay"),
                        Symbol::new(&env, "credential_not_found"),
                    ),
                    proof.credential_id,
                );
                return false;
            }
        };

        // Check 3: Credential is not revoked
        if credential.status == CredentialStatus::Revoked {
            env.events().publish(
                (
                    Symbol::new(&env, "relay"),
                    Symbol::new(&env, "credential_revoked"),
                ),
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
                (
                    Symbol::new(&env, "relay"),
                    Symbol::new(&env, "proof_hash_mismatch"),
                ),
                proof.credential_id,
            );
            return false;
        }

        // Check 5: Proof status matches credential status
        if proof.status != credential.status {
            env.events().publish(
                (
                    Symbol::new(&env, "relay"),
                    Symbol::new(&env, "status_mismatch"),
                ),
                (
                    proof.credential_id,
                    proof.status.clone(),
                    credential.status.clone(),
                ),
            );
            return false;
        }

        // All checks passed — proof is valid
        env.events().publish(
            (
                Symbol::new(&env, "relay"),
                Symbol::new(&env, "proof_verified"),
            ),
            (proof.credential_id, current_time),
        );

        true
    }

    /// Retrieve a previously generated cross-chain proof.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `credential_id` – Credential whose proof to retrieve.
    ///
    /// # Returns
    ///
    /// The stored [`CrossChainProof`].
    ///
    /// # Panics
    ///
    /// Panics with `"No cross-chain proof found for this credential"` if no
    /// proof has been generated for the given credential ID.
    pub fn get_cross_chain_proof(env: Env, credential_id: u64) -> CrossChainProof {
        env.storage()
            .instance()
            .get(&DataKey::CrossChainProof(credential_id))
            .unwrap_or_else(|| panic!("No cross-chain proof found for this credential"))
    }

    /// Revoke a credential, setting its status to [`CredentialStatus::Revoked`].
    ///
    /// Also removes any existing cross-chain proof for that credential so
    /// relayers immediately see it as invalid.  Emits a
    /// `(credential, revoked)` event.
    ///
    /// Only callable by the admin.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `admin` – Admin address; must sign the transaction.
    /// - `credential_id` – ID of the credential to revoke.
    ///
    /// # Panics
    ///
    /// - `"Not initialized"` / `"Only admin can perform this action"` —
    ///   `admin` ≠ stored admin.
    /// - `"Credential not found"` — `credential_id` does not exist.
    pub fn revoke_credential(env: Env, admin: Address, credential_id: u64) {
        admin.require_auth();
        check_admin(&env, &admin);

        let mut credential: Credential = env
            .storage()
            .instance()
            .get(&DataKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"));

        credential.status = CredentialStatus::Revoked;
        env.storage()
            .instance()
            .set(&DataKey::Credential(credential_id), &credential);

        // Invalidate any existing cross-chain proof
        if env
            .storage()
            .instance()
            .has(&DataKey::CrossChainProof(credential_id))
        {
            env.storage()
                .instance()
                .remove(&DataKey::CrossChainProof(credential_id));
        }

        env.events().publish(
            (
                Symbol::new(&env, "credential"),
                Symbol::new(&env, "revoked"),
            ),
            credential_id,
        );
    }

    // ─── Dynamic NFT achievement badges ───────────────────────────────────────

    /// Mint a dynamic NFT achievement badge.
    ///
    /// `creator` must be the contract admin (the badge issuer).  Mirrors the
    /// admin address into the `dynamic_nft` module's own storage key so its
    /// issuer gate works for on-chain callers.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `creator` – Admin address that will be the badge issuer.
    /// - `recipient` – Address that will receive the minted badge.
    /// - `base_uri` – Base URI for badge metadata (e.g. an IPFS gateway URL).
    /// - `initial_metadata` – Initial metadata IPFS CID for the badge.
    ///
    /// # Returns
    ///
    /// The newly minted badge token ID (`u64`).
    pub fn mint_dynamic_nft(
        env: Env,
        creator: Address,
        recipient: Address,
        base_uri: String,
        initial_metadata: String,
    ) -> u64 {
        // Mirror the contract admin into the dynamic-NFT module's own storage
        // key so its issuer gate (`creator == admin`) works for on-chain
        // callers. The module predates this entry point and reads a plain
        // "admin" symbol from instance storage.
        if !env.storage().instance().has(&Symbol::new(&env, "admin")) {
            let admin: Address = env
                .storage()
                .instance()
                .get(&DataKey::Admin)
                .unwrap_or_else(|| panic!("Not initialized"));
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "admin"), &admin);
        }
        crate::dynamic_nft::mint_dynamic_nft(
            &env, creator, recipient, base_uri, initial_metadata,
        )
    }

    /// Read a badge's full state by token ID.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `token_id` – ID of the badge to retrieve.
    ///
    /// # Returns
    ///
    /// The `DynamicNFT` struct for the badge.
    pub fn get_nft(env: Env, token_id: u64) -> DynamicNFT {
        crate::dynamic_nft::get_nft(&env, token_id)
    }

    /// Unlock an achievement on a badge, earning XP and possibly triggering
    /// evolution. Returns `false` if the achievement is already unlocked.
    pub fn evolve_nft(
        env: Env,
        token_id: u64,
        achievement_id: u64,
        new_metadata: String,
    ) -> bool {
        crate::dynamic_nft::evolve_nft(&env, token_id, achievement_id, new_metadata)
    }

    /// Fuse two badges owned by the same address into a single evolved badge.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `token1_id` – First badge to fuse.
    /// - `token2_id` – Second badge to fuse.
    /// - `recipient` – Address that will receive the new fused badge.
    ///
    /// # Returns
    ///
    /// The token ID of the newly created fused badge.
    pub fn fuse_nfts(env: Env, token1_id: u64, token2_id: u64, recipient: Address) -> u64 {
        crate::dynamic_nft::fuse_nfts(&env, token1_id, token2_id, recipient)
    }

    /// Transfer a badge to a new owner.
    ///
    /// The current owner must authorise the transaction.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `from` – Current owner address.
    /// - `to` – New owner address.
    /// - `token_id` – Badge to transfer.
    pub fn transfer_nft(env: Env, from: Address, to: Address, token_id: u64) {
        crate::dynamic_nft::transfer_nft(&env, from, to, token_id)
    }

    /// Return the list of badge IDs owned by an address.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `owner` – Address to query.
    ///
    /// # Returns
    ///
    /// A [`Vec<u64>`] of token IDs owned by `owner`.
    pub fn get_owner_tokens(env: Env, owner: Address) -> Vec<u64> {
        crate::dynamic_nft::get_owner_tokens(&env, owner)
    }

    /// Return the total number of badge IDs ever minted (monotonic counter).
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    ///
    /// # Returns
    ///
    /// Total minted supply (`u64`).
    pub fn get_total_supply(env: Env) -> u64 {
        crate::dynamic_nft::get_total_supply(&env)
    }

    /// Return the full metadata URI for a badge (`base_uri/metadata_ipfs`).
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `token_id` – Badge to query.
    ///
    /// # Returns
    ///
    /// The combined metadata URI as a Soroban [`String`].
    pub fn token_uri(env: Env, token_id: u64) -> String {
        crate::dynamic_nft::token_uri(&env, token_id)
    }

    /// Check whether a badge with the given ID exists.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `token_id` – Badge ID to check.
    ///
    /// # Returns
    ///
    /// `true` if the badge exists; `false` otherwise.
    pub fn nft_exists(env: Env, token_id: u64) -> bool {
        crate::dynamic_nft::nft_exists(&env, token_id)
    }

    /// Return the owner address of a badge.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `token_id` – Badge to query.
    ///
    /// # Returns
    ///
    /// The owner [`Address`].
    pub fn owner_of(env: Env, token_id: u64) -> Address {
        crate::dynamic_nft::owner_of(&env, token_id)
    }

    /// Return the number of badges owned by an address.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `owner` – Address to query.
    ///
    /// # Returns
    ///
    /// Badge count (`u64`).
    pub fn balance_of(env: Env, owner: Address) -> u64 {
        crate::dynamic_nft::balance_of(&env, owner)
    }

    /// Burn a Basic badge and mint an Advanced certificate badge in its
    /// place, preserving achievements/XP/evolution history.
    pub fn upgrade_nft(
        env: Env,
        owner: Address,
        token_id: u64,
        new_metadata: String,
        certificate_title: String,
    ) -> u64 {
        crate::dynamic_nft::upgrade_nft(&env, owner, token_id, new_metadata, certificate_title)
    }

    /// Return the certificate tier (`Basic` or `Advanced`) of a badge.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `token_id` – Badge to query.
    ///
    /// # Returns
    ///
    /// The `CertificateTier` of the badge.
    pub fn get_nft_tier(env: Env, token_id: u64) -> CertificateTier {
        crate::dynamic_nft::get_nft_tier(&env, token_id)
    }

    /// Upgrade a badge's metadata and rarity in place.
    ///
    /// Preserves token ID, owner, and progress (achievements/XP/evolution
    /// history).  Only the original issuer may upgrade the badge.  Every
    /// upgrade is appended to the badge's auditable, append-only history.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `issuer` – Original issuer address; must sign the transaction.
    /// - `token_id` – Badge to upgrade.
    /// - `new_metadata` – New metadata IPFS CID.
    /// - `new_rarity` – New rarity tier for the badge.
    ///
    /// # Returns
    ///
    /// `true` on success.
    pub fn upgrade_badge_metadata(
        env: Env,
        issuer: Address,
        token_id: u64,
        new_metadata: String,
        new_rarity: RarityTier,
    ) -> bool {
        crate::dynamic_nft::upgrade_badge_metadata(
            &env, issuer, token_id, new_metadata, new_rarity,
        )
    }

    /// Return a badge's append-only metadata/rarity upgrade history.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `token_id` – Badge to query.
    ///
    /// # Returns
    ///
    /// A [`Vec`] of [`BadgeUpgradeRecord`] entries, oldest first.
    pub fn get_badge_upgrade_history(env: Env, token_id: u64) -> Vec<BadgeUpgradeRecord> {
        crate::dynamic_nft::get_badge_upgrade_history(&env, token_id)
    }
}
