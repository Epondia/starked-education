//! Verifiable Random Function (VRF) system for StarkEd.
//!
//! Provides fair, transparent, and tamper-proof randomness for awards and
//! raffles (winner selection), exam question generation, seat assignments, and
//! proctoring randomization.
//!
//! A trusted VRF oracle holds an ed25519 keypair; its public key is registered
//! on-chain at initialization. To fulfil a request the oracle signs a canonical
//! message (`seed || request_id || block_number`) and submits the 64-byte
//! ed25519 signature as the proof. Fulfillment verifies the proof, derives a
//! deterministic random value as `sha256(proof || seed)`, and blocks replay
//! because the proof binds the exact request tuple.

use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env, String};

/// A randomness request awaiting (or already filled by) the VRF oracle.
#[contracttype]
#[derive(Clone, Debug)]
pub struct VRFRequest {
    pub id: u64,
    pub requester: Address,
    /// Caller-supplied seed; the oracle signs (seed || id || block_number).
    pub seed: BytesN<32>,
    /// Short label for the request (e.g. "award", "raffle").
    pub purpose: String,
    /// Free-form context (e.g. "Math Exam 101").
    pub context: String,
    /// Ledger sequence at request time, bound into the signed message.
    pub block_number: u64,
    /// Ledger timestamp at request time.
    pub created_at: u64,
    pub is_fulfilled: bool,
    /// Deterministic 32-byte random value derived from the verified proof.
    /// Zero-filled until the request is fulfilled.
    pub random_value: BytesN<32>,
    /// The verified ed25519 proof (64-byte signature).
    /// Zero-filled until the request is fulfilled.
    pub proof: BytesN<64>,
}

/// Aggregated counters surfaced via `get_stats`.
#[contracttype]
#[derive(Clone, Debug)]
pub struct VRFStats {
    pub total_requests: u64,
    pub fulfilled_requests: u64,
}

#[contracttype]
pub enum VRFKey {
    Admin,
    Oracle,
    OraclePublicKey,
    Request(u64),
    RequestCount,
    FulfilledCount,
}

#[contract]
pub struct VRFSystem;

#[contractimpl]
impl VRFSystem {
    /// Initialize the VRF system with an admin and a single trusted oracle.
    ///
    /// `oracle_public_key` is the oracle's ed25519 public key (32 bytes). Proofs
    /// submitted on fulfillment are verified against this key.
    pub fn initialize(
        env: Env,
        admin: Address,
        oracle: Address,
        oracle_public_key: BytesN<32>,
    ) {
        admin.require_auth();
        if env.storage().instance().has(&VRFKey::Admin) {
            panic!("VRF: already initialized");
        }
        env.storage().instance().set(&VRFKey::Admin, &admin);
        env.storage().instance().set(&VRFKey::Oracle, &oracle);
        env.storage()
            .instance()
            .set(&VRFKey::OraclePublicKey, &oracle_public_key);
        env.storage().instance().set(&VRFKey::RequestCount, &0u64);
        env.storage().instance().set(&VRFKey::FulfilledCount, &0u64);
    }

    /// Rotate the trusted oracle and its public key. Admin only.
    pub fn set_oracle(
        env: Env,
        admin: Address,
        oracle: Address,
        oracle_public_key: BytesN<32>,
    ) {
        admin.require_auth();
        Self::check_admin(&env, &admin);
        env.storage().instance().set(&VRFKey::Oracle, &oracle);
        env.storage()
            .instance()
            .set(&VRFKey::OraclePublicKey, &oracle_public_key);
        env.events().publish(
            (symbol_short!("vrf"), symbol_short!("oracle")),
            oracle,
        );
    }

    /// Create a new randomness request. Returns the request id.
    ///
    /// The requester supplies a seed that the oracle will sign. Using a fresh,
    /// unpredictable seed per request prevents the requester from being able to
    /// bias the final selection.
    pub fn request_randomness(
        env: Env,
        requester: Address,
        seed: BytesN<32>,
        purpose: String,
        context: String,
    ) -> u64 {
        requester.require_auth();

        let id: u64 = env
            .storage()
            .instance()
            .get(&VRFKey::RequestCount)
            .unwrap_or(0);

        let request = VRFRequest {
            id,
            requester: requester.clone(),
            seed,
            purpose: purpose.clone(),
            context,
            block_number: env.ledger().sequence() as u64,
            created_at: env.ledger().timestamp(),
            is_fulfilled: false,
            random_value: BytesN::from_array(&env, &[0u8; 32]),
            proof: BytesN::from_array(&env, &[0u8; 64]),
        };

        env.storage()
            .instance()
            .set(&VRFKey::Request(id), &request);
        env.storage().instance().set(&VRFKey::RequestCount, &(id + 1));

        env.events().publish(
            (symbol_short!("vrf"), symbol_short!("requested")),
            (id, requester, purpose),
        );

        id
    }

    /// Fulfil a randomness request with an ed25519 proof.
    ///
    /// Returns the deterministic 32-byte random value. Only the registered
    /// oracle may fulfil. An invalid proof causes the transaction to abort
    /// (rejected) and leaves the request untouched.
    pub fn fulfill_randomness(
        env: Env,
        oracle: Address,
        request_id: u64,
        proof: BytesN<64>,
    ) -> BytesN<32> {
        oracle.require_auth();

        let expected_oracle: Address = env
            .storage()
            .instance()
            .get(&VRFKey::Oracle)
            .unwrap_or_else(|| panic!("VRF: not initialized"));
        if oracle != expected_oracle {
            panic!("VRF: unauthorized oracle");
        }

        let mut request: VRFRequest = env
            .storage()
            .instance()
            .get(&VRFKey::Request(request_id))
            .unwrap_or_else(|| panic!("VRF: request not found"));
        if request.is_fulfilled {
            panic!("VRF: request already fulfilled");
        }

        let public_key: BytesN<32> = env
            .storage()
            .instance()
            .get(&VRFKey::OraclePublicKey)
            .unwrap_or_else(|| panic!("VRF: oracle public key missing"));

        // Reconstruct the exact message the oracle signed and verify the proof.
        // `ed25519_verify` panics on an invalid signature, which rejects the
        // transaction before any state is written.
        let message = Self::build_vrf_message(&env, &request.seed, request.id, request.block_number);
        env.crypto().ed25519_verify(&public_key, &message, &proof);

        let random_value = Self::derive_random_value(&env, &proof, &request.seed);

        request.is_fulfilled = true;
        request.random_value = random_value.clone();
        request.proof = proof;
        env.storage()
            .instance()
            .set(&VRFKey::Request(request_id), &request);

        let fulfilled: u64 = env
            .storage()
            .instance()
            .get(&VRFKey::FulfilledCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&VRFKey::FulfilledCount, &(fulfilled + 1));

        env.events().publish(
            (symbol_short!("vrf"), symbol_short!("fulfilled")),
            (request_id, random_value.clone()),
        );

        random_value
    }

    /// Deterministically select a winner index in `[0, participant_count)` from
    /// a fulfilled request's verified randomness.
    pub fn select_winner(
        env: Env,
        request_id: u64,
        participant_count: u64,
    ) -> u64 {
        if participant_count == 0 {
            panic!("VRF: participant_count must be > 0");
        }
        let request = Self::get_fulfilled_request(&env, request_id);
        let random = Self::bytesn_to_u64(&request.random_value);
        random % participant_count
    }

    /// Deterministically derive a number in `[min, max]` (inclusive) from a
    /// fulfilled request's verified randomness.
    pub fn random_in_range(
        env: Env,
        request_id: u64,
        min: u64,
        max: u64,
    ) -> u64 {
        if max < min {
            panic!("VRF: max must be >= min");
        }
        let request = Self::get_fulfilled_request(&env, request_id);
        let random = Self::bytesn_to_u64(&request.random_value);
        let span = max - min + 1;
        min + (random % span)
    }

    /// Read a request by id.
    pub fn get_request(env: Env, request_id: u64) -> VRFRequest {
        env.storage()
            .instance()
            .get::<_, VRFRequest>(&VRFKey::Request(request_id))
            .unwrap_or_else(|| panic!("VRF: request not found"))
    }

    /// Read the currently registered oracle address.
    pub fn get_oracle(env: Env) -> Address {
        env.storage()
            .instance()
            .get::<_, Address>(&VRFKey::Oracle)
            .unwrap_or_else(|| panic!("VRF: not initialized"))
    }

    /// Read aggregated request/fulfillment counters.
    pub fn get_stats(env: Env) -> VRFStats {
        VRFStats {
            total_requests: env
                .storage()
                .instance()
                .get(&VRFKey::RequestCount)
                .unwrap_or(0),
            fulfilled_requests: env
                .storage()
                .instance()
                .get(&VRFKey::FulfilledCount)
                .unwrap_or(0),
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    fn check_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get::<_, Address>(&VRFKey::Admin)
            .unwrap_or_else(|| panic!("VRF: not initialized"));
        if caller != &admin {
            panic!("VRF: only admin can perform this action");
        }
    }

    fn get_fulfilled_request(env: &Env, request_id: u64) -> VRFRequest {
        let request: VRFRequest = env
            .storage()
            .instance()
            .get::<_, VRFRequest>(&VRFKey::Request(request_id))
            .unwrap_or_else(|| panic!("VRF: request not found"));
        if !request.is_fulfilled {
            panic!("VRF: request not fulfilled");
        }
        request
    }

    /// Build the canonical 48-byte message the oracle signs:
    /// `seed (32) || request_id (8, BE) || block_number (8, BE)`.
    fn build_vrf_message(
        env: &Env,
        seed: &BytesN<32>,
        request_id: u64,
        block_number: u64,
    ) -> Bytes {
        let mut message = Bytes::new(env);
        for byte in seed.to_array().iter() {
            message.push_back(*byte);
        }
        for byte in request_id.to_be_bytes().iter() {
            message.push_back(*byte);
        }
        for byte in block_number.to_be_bytes().iter() {
            message.push_back(*byte);
        }
        message
    }

    /// Derive the deterministic 32-byte random value from the verified proof:
    /// `sha256(proof || seed)`.
    fn derive_random_value(env: &Env, proof: &BytesN<64>, seed: &BytesN<32>) -> BytesN<32> {
        let mut data = Bytes::new(env);
        for byte in proof.to_array().iter() {
            data.push_back(*byte);
        }
        for byte in seed.to_array().iter() {
            data.push_back(*byte);
        }
        env.crypto().sha256(&data)
    }

    /// Interpret the leading 8 bytes of a 32-byte random value as big-endian u64.
    fn bytesn_to_u64(random: &BytesN<32>) -> u64 {
        let array = random.to_array();
        let mut buf = [0u8; 8];
        buf.copy_from_slice(&array[0..8]);
        u64::from_be_bytes(buf)
    }
}
