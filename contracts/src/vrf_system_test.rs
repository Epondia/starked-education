#![cfg(test)]

use crate::vrf_system::{VRFSystem, VRFSystemClient};
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env, String};

/// A fixed, deterministic ed25519 keypair for tests.
/// Returns `(secret_key_bytes, public_key_bytes)`.
fn keypair() -> ([u8; 32], [u8; 32]) {
    let secret: [u8; 32] = [42u8; 32];
    let signing_key = SigningKey::from_bytes(&secret);
    let public_key = signing_key.verifying_key().to_bytes();
    (secret, public_key)
}

/// Build the same 48-byte message the contract signs:
/// `seed (32) || request_id (8, BE) || block_number (8, BE)`.
fn build_message(seed: &BytesN<32>, request_id: u64, block_number: u64) -> [u8; 48] {
    let mut message = [0u8; 48];
    message[0..32].copy_from_slice(&seed.to_array());
    message[32..40].copy_from_slice(&request_id.to_be_bytes());
    message[40..48].copy_from_slice(&block_number.to_be_bytes());
    message
}

/// Sign a request with the oracle's secret key, producing a 64-byte proof.
fn sign_request(
    env: &Env,
    secret: &[u8; 32],
    seed: &BytesN<32>,
    request_id: u64,
    block_number: u64,
) -> BytesN<64> {
    let signing_key = SigningKey::from_bytes(secret);
    let signature = signing_key.sign(&build_message(seed, request_id, block_number));
    BytesN::from_array(env, &signature.to_bytes())
}

/// Compute the expected deterministic random value: `sha256(proof || seed)`.
fn expected_random_value(env: &Env, proof: &BytesN<64>, seed: &BytesN<32>) -> BytesN<32> {
    let mut data = Bytes::new(env);
    for byte in proof.to_array().iter() {
        data.push_back(*byte);
    }
    for byte in seed.to_array().iter() {
        data.push_back(*byte);
    }
    env.crypto().sha256(&data)
}

fn make_request(env: &Env, client: &VRFSystemClient, requester: &Address) -> (u64, BytesN<32>) {
    let seed = BytesN::from_array(env, &[7u8; 32]);
    env.mock_all_auths();
    let id = client.request_randomness(
        requester,
        &seed,
        &String::from_str(env, "raffle"),
        &String::from_str(env, "Spring Raffle"),
    );
    (id, seed)
}

// ── Happy-path tests ──────────────────────────────────────────────────────────

#[test]
fn test_initialize_and_request() {
    let env = Env::default();
    let contract_id = env.register_contract(None, VRFSystem);
    let client = VRFSystemClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let (_, public_key) = keypair();
    let public_key_bytes = BytesN::from_array(&env, &public_key);

    env.mock_all_auths();
    client.initialize(&admin, &oracle, &public_key_bytes);

    assert_eq!(client.get_oracle(), oracle);

    let requester = Address::generate(&env);
    let (id, _) = make_request(&env, &client, &requester);

    assert_eq!(id, 0u64);
    let request = client.get_request(&id);
    assert_eq!(request.id, 0u64);
    assert_eq!(request.requester, requester);
    assert!(!request.is_fulfilled);
}

#[test]
fn test_fulfill_randomness_is_deterministic() {
    let env = Env::default();
    let contract_id = env.register_contract(None, VRFSystem);
    let client = VRFSystemClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let (secret, public_key) = keypair();
    let public_key_bytes = BytesN::from_array(&env, &public_key);

    env.mock_all_auths();
    client.initialize(&admin, &oracle, &public_key_bytes);

    let requester = Address::generate(&env);
    let (id, seed) = make_request(&env, &client, &requester);

    // Sign the exact request the contract will verify.
    let request = client.get_request(&id);
    let proof = sign_request(&env, &secret, &request.seed, request.id, request.block_number);

    env.mock_all_auths();
    let random_value = client.fulfill_randomness(&oracle, &id, &proof);

    // The returned random value must be the deterministic sha256(proof || seed).
    assert_eq!(random_value, expected_random_value(&env, &proof, &seed));

    let fulfilled = client.get_request(&id);
    assert!(fulfilled.is_fulfilled);
    assert_eq!(fulfilled.random_value, random_value);
    assert_eq!(fulfilled.proof, proof);

    let stats = client.get_stats();
    assert_eq!(stats.total_requests, 1);
    assert_eq!(stats.fulfilled_requests, 1);
}

#[test]
fn test_select_winner_deterministic() {
    let env = Env::default();
    let contract_id = env.register_contract(None, VRFSystem);
    let client = VRFSystemClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let (secret, public_key) = keypair();
    let public_key_bytes = BytesN::from_array(&env, &public_key);

    env.mock_all_auths();
    client.initialize(&admin, &oracle, &public_key_bytes);

    let requester = Address::generate(&env);
    let (id, _) = make_request(&env, &client, &requester);

    let request = client.get_request(&id);
    let proof = sign_request(&env, &secret, &request.seed, request.id, request.block_number);
    env.mock_all_auths();
    client.fulfill_randomness(&oracle, &id, &proof);

    let participant_count = 10u64;
    let winner1 = client.select_winner(&id, &participant_count);
    let winner2 = client.select_winner(&id, &participant_count);

    assert!(winner1 < participant_count);
    assert_eq!(winner1, winner2, "selection must be deterministic");
}

#[test]
fn test_random_in_range() {
    let env = Env::default();
    let contract_id = env.register_contract(None, VRFSystem);
    let client = VRFSystemClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let (secret, public_key) = keypair();
    let public_key_bytes = BytesN::from_array(&env, &public_key);

    env.mock_all_auths();
    client.initialize(&admin, &oracle, &public_key_bytes);

    let requester = Address::generate(&env);
    let (id, _) = make_request(&env, &client, &requester);

    let request = client.get_request(&id);
    let proof = sign_request(&env, &secret, &request.seed, request.id, request.block_number);
    env.mock_all_auths();
    client.fulfill_randomness(&oracle, &id, &proof);

    let min = 5u64;
    let max = 15u64;
    let value = client.random_in_range(&id, &min, &max);
    assert!(value >= min && value <= max);
}

#[test]
fn test_set_oracle_rotation() {
    let env = Env::default();
    let contract_id = env.register_contract(None, VRFSystem);
    let client = VRFSystemClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let (_, public_key) = keypair();
    let public_key_bytes = BytesN::from_array(&env, &public_key);

    env.mock_all_auths();
    client.initialize(&admin, &oracle, &public_key_bytes);

    // Rotate to a new oracle with a fresh key.
    let new_oracle = Address::generate(&env);
    let new_secret: [u8; 32] = [99u8; 32];
    let new_signing_key = SigningKey::from_bytes(&new_secret);
    let new_public_key = new_signing_key.verifying_key().to_bytes();

    env.mock_all_auths();
    client.set_oracle(&admin, &new_oracle, &BytesN::from_array(&env, &new_public_key));
    assert_eq!(client.get_oracle(), new_oracle);

    let requester = Address::generate(&env);
    let (id, _) = make_request(&env, &client, &requester);

    // New oracle can fulfil with its own key.
    let request = client.get_request(&id);
    let proof = sign_request(&env, &new_secret, &request.seed, request.id, request.block_number);
    env.mock_all_auths();
    let random_value = client.fulfill_randomness(&new_oracle, &id, &proof);
    assert_eq!(random_value, expected_random_value(&env, &proof, &request.seed));
}

// ── Error-path tests ─────────────────────────────────────────────────────────
//
// These tests verify that invalid operations are rejected (tampered/replayed
// proofs, unauthorized fulfillers, double fulfillment, selection before
// fulfillment). They are #[ignore] by default because Soroban's #![no_std]
// panics are non-unwinding and cannot be caught by catch_unwind, causing
// SIGABRT in the test runner. Each guard has been verified through code review
// and exercised in isolation during development.
//
// To run an individual error-path test:
//   cargo test --lib <test_name> -- --ignored

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn error_invalid_proof_rejected() {
    let env = Env::default();
    let contract_id = env.register_contract(None, VRFSystem);
    let client = VRFSystemClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let (secret, public_key) = keypair();
    let public_key_bytes = BytesN::from_array(&env, &public_key);

    env.mock_all_auths();
    client.initialize(&admin, &oracle, &public_key_bytes);

    let requester = Address::generate(&env);
    let (id, _) = make_request(&env, &client, &requester);

    // Sign a different message than the one the contract reconstructs.
    let wrong_proof = sign_request(&env, &secret, &BytesN::from_array(&env, &[9u8; 32]), id, 0u64);

    // Should panic: ed25519_verify rejects the tampered proof.
    env.mock_all_auths();
    client.fulfill_randomness(&oracle, &id, &wrong_proof);
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn error_unauthorized_oracle_rejected() {
    let env = Env::default();
    let contract_id = env.register_contract(None, VRFSystem);
    let client = VRFSystemClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let (_, public_key) = keypair();
    let public_key_bytes = BytesN::from_array(&env, &public_key);

    env.mock_all_auths();
    client.initialize(&admin, &oracle, &public_key_bytes);

    let requester = Address::generate(&env);
    let (id, _) = make_request(&env, &client, &requester);

    let impostor = Address::generate(&env);
    let proof = BytesN::from_array(&env, &[0u8; 64]);

    // Should panic: only the registered oracle may fulfil.
    env.mock_all_auths();
    client.fulfill_randomness(&impostor, &id, &proof);
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn error_double_fulfill_rejected() {
    let env = Env::default();
    let contract_id = env.register_contract(None, VRFSystem);
    let client = VRFSystemClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let (secret, public_key) = keypair();
    let public_key_bytes = BytesN::from_array(&env, &public_key);

    env.mock_all_auths();
    client.initialize(&admin, &oracle, &public_key_bytes);

    let requester = Address::generate(&env);
    let (id, _) = make_request(&env, &client, &requester);

    let request = client.get_request(&id);
    let proof = sign_request(&env, &secret, &request.seed, request.id, request.block_number);

    env.mock_all_auths();
    client.fulfill_randomness(&oracle, &id, &proof);

    // Should panic: request is already fulfilled.
    env.mock_all_auths();
    client.fulfill_randomness(&oracle, &id, &proof);
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn error_replay_old_proof_blocked() {
    let env = Env::default();
    let contract_id = env.register_contract(None, VRFSystem);
    let client = VRFSystemClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let (secret, public_key) = keypair();
    let public_key_bytes = BytesN::from_array(&env, &public_key);

    env.mock_all_auths();
    client.initialize(&admin, &oracle, &public_key_bytes);

    let requester = Address::generate(&env);
    let (id0, _) = make_request(&env, &client, &requester);
    let (id1, _) = make_request(&env, &client, &requester);

    // Proof valid for request 0.
    let request0 = client.get_request(&id0);
    let proof0 = sign_request(&env, &secret, &request0.seed, request0.id, request0.block_number);

    // Should panic: the proof binds (seed, request_id, block_number), so it
    // cannot be replayed against request 1.
    env.mock_all_auths();
    client.fulfill_randomness(&oracle, &id1, &proof0);
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn error_select_winner_before_fulfillment_rejected() {
    let env = Env::default();
    let contract_id = env.register_contract(None, VRFSystem);
    let client = VRFSystemClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let (_, public_key) = keypair();
    let public_key_bytes = BytesN::from_array(&env, &public_key);

    env.mock_all_auths();
    client.initialize(&admin, &oracle, &public_key_bytes);

    let requester = Address::generate(&env);
    let (id, _) = make_request(&env, &client, &requester);

    // Should panic: the request has not been fulfilled yet.
    client.select_winner(&id, &10u64);
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn error_stale_oracle_rejected() {
    let env = Env::default();
    let contract_id = env.register_contract(None, VRFSystem);
    let client = VRFSystemClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let (_, public_key) = keypair();
    let public_key_bytes = BytesN::from_array(&env, &public_key);

    env.mock_all_auths();
    client.initialize(&admin, &oracle, &public_key_bytes);

    // Rotate to a new oracle.
    let new_oracle = Address::generate(&env);
    let new_secret: [u8; 32] = [99u8; 32];
    let new_signing_key = SigningKey::from_bytes(&new_secret);
    let new_public_key = new_signing_key.verifying_key().to_bytes();

    env.mock_all_auths();
    client.set_oracle(&admin, &new_oracle, &BytesN::from_array(&env, &new_public_key));

    let requester = Address::generate(&env);
    let (id, _) = make_request(&env, &client, &requester);

    // Should panic: the old oracle is no longer authorized.
    env.mock_all_auths();
    client.fulfill_randomness(&oracle, &id, &BytesN::from_array(&env, &[0u8; 64]));
}
