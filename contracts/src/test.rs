#![cfg(test)]

use crate::{StarkEdContract, StarkEdContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);

    client.initialize(&admin);

    assert_eq!(client.get_admin(), admin);
    assert_eq!(client.get_credential_count(), 0);
    assert_eq!(client.get_course_count(), 0);
}

#[test]
#[should_panic(expected = "Contract already initialized")]
fn test_initialize_twice_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    client.initialize(&admin);
}

#[test]
fn test_issue_and_get_credential() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    let cred_id = client.issue_credential(
        &admin,
        &recipient,
        &String::from_str(&env, "Blockchain 101"),
        &String::from_str(&env, "course_1"),
        &String::from_str(&env, "QmTestHash"),
    );

    assert_eq!(cred_id, 1);
    assert_eq!(client.get_credential_count(), 1);

    let cred = client.get_credential(&cred_id);
    assert_eq!(cred.id, 1);
    assert_eq!(cred.issuer, admin);
    assert_eq!(cred.recipient, recipient);
    assert_eq!(cred.title, String::from_str(&env, "Blockchain 101"));
    assert_eq!(cred.course_id, String::from_str(&env, "course_1"));
    assert_eq!(cred.ipfs_hash, String::from_str(&env, "QmTestHash"));
}

#[test]
fn test_verify_credential() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    assert!(!client.verify_credential(&1));

    let cred_id = client.issue_credential(
        &admin,
        &recipient,
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "course"),
        &String::from_str(&env, "QmHash"),
    );

    assert!(client.verify_credential(&cred_id));
    assert!(!client.verify_credential(&(cred_id + 1)));
}

#[test]
#[should_panic(expected = "Credential not found")]
fn test_get_nonexistent_credential_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    client.get_credential(&999);
}

#[test]
fn test_create_and_get_course() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    let course_id = client.create_course(
        &admin,
        &String::from_str(&env, "Rust Programming"),
        &String::from_str(&env, "Learn Rust for smart contracts"),
        &100_000_000,
    );

    assert_eq!(course_id, 1);
    assert_eq!(client.get_course_count(), 1);

    let course = client.get_course(&course_id);
    assert_eq!(course.id, 1);
    assert_eq!(course.title, String::from_str(&env, "Rust Programming"));
    assert_eq!(course.price, 100_000_000);
}

#[test]
#[should_panic(expected = "Course not found")]
fn test_get_nonexistent_course_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    client.get_course(&999);
}

#[test]
#[should_panic(expected = "Not initialized")]
fn test_get_admin_before_init_panics() {
    let env = Env::default();
    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);

    client.get_admin();
}

#[test]
fn test_multiple_credentials() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    let id1 = client.issue_credential(
        &admin,
        &alice,
        &String::from_str(&env, "Course A"),
        &String::from_str(&env, "course_a"),
        &String::from_str(&env, "QmA"),
    );
    let id2 = client.issue_credential(
        &admin,
        &bob,
        &String::from_str(&env, "Course B"),
        &String::from_str(&env, "course_b"),
        &String::from_str(&env, "QmB"),
    );
    let id3 = client.issue_credential(
        &admin,
        &alice,
        &String::from_str(&env, "Course C"),
        &String::from_str(&env, "course_c"),
        &String::from_str(&env, "QmC"),
    );

    assert_eq!(client.get_credential_count(), 3);

    assert!(client.verify_credential(&id1));
    assert!(client.verify_credential(&id2));
    assert!(client.verify_credential(&id3));

    let cred1 = client.get_credential(&id1);
    assert_eq!(cred1.recipient, alice);

    let cred2 = client.get_credential(&id2);
    assert_eq!(cred2.recipient, bob);
}

#[test]
fn test_multiple_courses() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    let c1 = client.create_course(
        &admin,
        &String::from_str(&env, "Course 1"),
        &String::from_str(&env, "Description 1"),
        &50_000_000,
    );
    let c2 = client.create_course(
        &admin,
        &String::from_str(&env, "Course 2"),
        &String::from_str(&env, "Description 2"),
        &75_000_000,
    );

    assert_eq!(client.get_course_count(), 2);

    let course1 = client.get_course(&c1);
    assert_eq!(course1.price, 50_000_000);

    let course2 = client.get_course(&c2);
    assert_eq!(course2.price, 75_000_000);
}
