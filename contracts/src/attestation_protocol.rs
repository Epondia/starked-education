#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, BytesN, Env, Map, String, Symbol, Vec, 
    panic_with_error, log
};

/// Attestation status enumeration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AttestationStatus {
    Pending = 0,
    Verified = 1,
    Disputed = 2,
    Revoked = 3,
    Expired = 4,
}

/// Verifier reputation tier
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ReputationTier {
    Unverified = 0,
    Bronze = 1,
    Silver = 2,
    Gold = 3,
    Platinum = 4,
}

/// Attestation record with cryptographic proof
#[contracttype]
#[derive(Clone)]
pub struct Attestation {
    pub id: u64,
    pub credential_id: u64,
    pub verifier: Address,
    pub attestation_hash: BytesN<32>,
    pub timestamp: u64,
    pub expires_at: u64,
    pub status: AttestationStatus,
    pub weight: u32,
    pub metadata_hash: String,
    pub zk_proof_hash: Option<BytesN<32>>,
}

/// Verifier profile with reputation scoring
#[contracttype]
#[derive(Clone)]
pub struct VerifierProfile {
    pub address: Address,
    pub institution: String,
    pub reputation_score: u64,
    pub total_attestations: u32,
    pub successful_attestations: u32,
    pub disputed_attestations: u32,
    pub stake_amount: i128,
    pub tier: ReputationTier,
    pub registered_at: u64,
    pub last_active: u64,
    pub is_active: bool,
}

/// Dispute record for challenge mechanism
#[contracttype]
#[derive(Clone)]
pub struct Dispute {
    pub id: u64,
    pub attestation_id: u64,
    pub challenger: Address,
    pub reason: String,
    pub evidence_hash: BytesN<32>,
    pub stake_amount: i128,
    pub created_at: u64,
    pub resolved_at: Option<u64>,
    pub resolution: Option<DisputeResolution>,
    pub votes_for: u32,
    pub votes_against: u32,
}

/// Dispute resolution outcome
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DisputeResolution {
    AttestationValid = 0,
    AttestationInvalid = 1,
    Inconclusive = 2,
}

/// Cross-institution recognition record
#[contracttype]
#[derive(Clone)]
pub struct InstitutionRecognition {
    pub institution_a: Address,
    pub institution_b: Address,
    pub recognition_level: u32,
    pub established_at: u64,
    pub mutual: bool,
}

/// Attestation analytics data
#[contracttype]
#[derive(Clone)]
pub struct AttestationAnalytics {
    pub credential_id: u64,
    pub total_attestations: u32,
    pub verified_count: u32,
    pub disputed_count: u32,
    pub revoked_count: u32,
    pub average_verification_time: u64,
    pub last_attestation_at: u64,
}

// ═══════════════════════════════════════════════════════════════
// Cross-Chain Attestation Extension
// ═══════════════════════════════════════════════════════════════

/// Cross-chain attestation record for verifying credentials
/// from external chains via relayers.
#[contracttype]
#[derive(Clone)]
pub struct CrossChainAttestation {
    pub id: u64,
    /// The original chain where the credential was issued
    pub source_chain_id: String,
    /// Address of the relayer who bridged the proof
    pub relayer: Address,
    /// Hash of the original cross-chain proof
    pub proof_hash: BytesN<32>,
    /// Credential ID from the source chain
    pub source_credential_id: u64,
    /// Issuer address from the source chain (encoded as Bytes)
    pub source_issuer: BytesN<32>,
    /// Timestamp when the credential was originally issued
    pub source_issued_at: u64,
    /// Status reported by the relayer
    pub reported_status: CrossChainAttestationStatus,
    /// When the attestation was created on this chain
    pub attested_at: u64,
    /// When this attestation expires
    pub expires_at: u64,
    /// Whether this attestation has been verified locally
    pub verified: bool,
    /// Optional dispute reference
    pub dispute_id: Option<u64>,
}

/// Status for cross-chain attestation records
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CrossChainAttestationStatus {
    /// Credential is active on the source chain
    Active = 0,
    /// Credential has expired on the source chain
    Expired = 1,
    /// Credential has been revoked on the source chain
    Revoked = 2,
    /// Status unknown — relay verification pending
    Unknown = 3,
}

/// Cross-chain attestation storage keys
#[contracttype]
pub enum CrossChainAttestationKey {
    Attestation(u64),              // attestation_id -> CrossChainAttestation
    AttestationsByRelayer(Address), // relayer -> Vec<u64>
    AttestationCount,               // u64
    RelayerRegistration(Address),   // relayer -> RelayerProfile
}

/// Relayer profile for cross-chain attestation relayers
#[contracttype]
#[derive(Clone)]
pub struct RelayerProfile {
    pub address: Address,
    pub supported_chains: Vec<String>,
    pub stake_amount: i128,
    pub total_attestations: u32,
    pub successful_attestations: u32,
    pub failed_attestations: u32,
    pub reputation_score: u64,
    pub registered_at: u64,
    pub last_active: u64,
    pub is_active: bool,
}

/// Create a cross-chain attestation record from a relayed proof.
/// Called by registered relayers to bridge credentials from external chains.
pub fn create_cross_chain_attestation(
    env: &Env,
    relayer: Address,
    source_chain_id: String,
    proof_hash: BytesN<32>,
    source_credential_id: u64,
    source_issuer: BytesN<32>,
    source_issued_at: u64,
    reported_status: CrossChainAttestationStatus,
    validity_duration: u64,
) -> u64 {
    relayer.require_auth();

    // Check that relayer is registered
    let relayer_profile: RelayerProfile = env
        .storage()
        .instance()
        .get(&CrossChainAttestationKey::RelayerRegistration(relayer.clone()))
        .unwrap_or_else(|| panic!("Relayer not registered"));

    if !relayer_profile.is_active {
        panic!("Relayer is not active");
    }

    // Verify the relayer supports this source chain
    if !relayer_profile.supported_chains.contains(&source_chain_id) {
        panic!("Relayer does not support this source chain");
    }

    let attestation_id: u64 = env
        .storage()
        .instance()
        .get(&CrossChainAttestationKey::AttestationCount)
        .unwrap_or(0)
        + 1;

    let current_time = env.ledger().timestamp();

    let attestation = CrossChainAttestation {
        id: attestation_id,
        source_chain_id,
        relayer: relayer.clone(),
        proof_hash,
        source_credential_id,
        source_issuer,
        source_issued_at,
        reported_status,
        attested_at: current_time,
        expires_at: current_time + validity_duration,
        verified: false,
        dispute_id: None,
    };

    // Store the attestation
    env.storage().instance().set(
        &CrossChainAttestationKey::Attestation(attestation_id),
        &attestation,
    );

    // Update attestation count
    env.storage()
        .instance()
        .set(&CrossChainAttestationKey::AttestationCount, &attestation_id);

    // Add to relayer's attestation list
    let mut relayer_attestations: Vec<u64> = env
        .storage()
        .instance()
        .get(&CrossChainAttestationKey::AttestationsByRelayer(relayer.clone()))
        .unwrap_or_else(|| Vec::new(env));
    relayer_attestations.push_back(attestation_id);
    env.storage().instance().set(
        &CrossChainAttestationKey::AttestationsByRelayer(relayer.clone()),
        &relayer_attestations,
    );

    // Update relayer stats
    let mut updated_profile = relayer_profile;
    updated_profile.total_attestations += 1;
    updated_profile.last_active = current_time;
    env.storage().instance().set(
        &CrossChainAttestationKey::RelayerRegistration(relayer.clone()),
        &updated_profile,
    );

    // Emit cross-chain attestation event
    env.events().publish(
        (Symbol::new(env, "relay"), Symbol::new(env, "cross_chain_attested")),
        (
            attestation_id,
            source_credential_id,
            source_chain_id,
            relayer,
        ),
    );

    attestation_id
}

/// Verify a cross-chain attestation after the local credential has been validated.
pub fn verify_cross_chain_attestation(
    env: &Env,
    attestation_id: u64,
    verifier: Address,
) -> bool {
    verifier.require_auth();

    let mut attestation: CrossChainAttestation = env
        .storage()
        .instance()
        .get(&CrossChainAttestationKey::Attestation(attestation_id))
        .unwrap_or_else(|| panic!("Attestation not found"));

    let current_time = env.ledger().timestamp();

    // Check attestation hasn't expired
    if current_time >= attestation.expires_at {
        panic!("Attestation has expired");
    }

    // Mark as verified
    attestation.verified = true;
    env.storage().instance().set(
        &CrossChainAttestationKey::Attestation(attestation_id),
        &attestation,
    );

    // Update relayer stats — increment successful attestations
    let mut relayer_profile: RelayerProfile = env
        .storage()
        .instance()
        .get(&CrossChainAttestationKey::RelayerRegistration(attestation.relayer.clone()))
        .unwrap_or_else(|| panic!("Relayer profile not found"));
    relayer_profile.successful_attestations += 1;
    relayer_profile.reputation_score += 10;
    env.storage().instance().set(
        &CrossChainAttestationKey::RelayerRegistration(attestation.relayer.clone()),
        &relayer_profile,
    );

    env.events().publish(
        (Symbol::new(env, "relay"), Symbol::new(env, "attestation_verified")),
        (attestation_id, verifier),
    );

    true
}

/// Register a relayer for cross-chain attestation duties.
pub fn register_relayer(
    env: &Env,
    relayer: Address,
    supported_chains: Vec<String>,
    stake_amount: i128,
) {
    relayer.require_auth();

    if env
        .storage()
        .instance()
        .has(&CrossChainAttestationKey::RelayerRegistration(relayer.clone()))
    {
        panic!("Relayer already registered");
    }

    let profile = RelayerProfile {
        address: relayer.clone(),
        supported_chains,
        stake_amount,
        total_attestations: 0,
        successful_attestations: 0,
        failed_attestations: 0,
        reputation_score: 100,
        registered_at: env.ledger().timestamp(),
        last_active: env.ledger().timestamp(),
        is_active: true,
    };

    env.storage().instance().set(
        &CrossChainAttestationKey::RelayerRegistration(relayer.clone()),
        &profile,
    );

    env.events().publish(
        (Symbol::new(env, "relay"), Symbol::new(env, "relayer_registered")),
        (relayer, supported_chains),
    );
}

/// Get a cross-chain attestation by ID.
pub fn get_cross_chain_attestation(
    env: &Env,
    attestation_id: u64,
) -> CrossChainAttestation {
    env.storage()
        .instance()
        .get(&CrossChainAttestationKey::Attestation(attestation_id))
        .unwrap_or_else(|| panic!("Attestation not found"))
}