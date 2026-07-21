#![cfg(test)]

use crate::user_profile::{
    Achievement, PrivacyLevel, UserProfileContract, UserProfileContractClient,
};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_create_profile() {
    let env = Env::default();
    let contract_id = env.register_contract(None, UserProfileContract);
    let client = UserProfileContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    let username = String::from_str(&env, "testuser");
    let email = Some(String::from_str(&env, "test@example.com"));
    let bio = Some(String::from_str(&env, "Test bio"));
    let avatar_url = Some(String::from_str(&env, "https://example.com/avatar.jpg"));
    let privacy_level = PrivacyLevel::Public;

    env.mock_all_auths();

    let profile = client.create_or_update_profile(
        &user, &username, &email, &bio, &avatar_url, &privacy_level,
    );

    assert_eq!(profile.owner, user);
    assert_eq!(profile.username, username);
    assert_eq!(profile.credential_count, 0u32);
    assert_eq!(profile.achievement_count, 0u32);
    assert_eq!(profile.reputation, 0u64);
}

#[test]
fn test_get_profile() {
    let env = Env::default();
    let contract_id = env.register_contract(None, UserProfileContract);
    let client = UserProfileContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    let username = String::from_str(&env, "testuser");
    let email = Some(String::from_str(&env, "test@example.com"));
    let privacy_level = PrivacyLevel::Public;

    env.mock_all_auths();
    client.create_or_update_profile(&user, &username, &email, &None, &None, &privacy_level);

    let retrieved_profile = client.get_profile(&user);
    assert!(retrieved_profile.is_some());
    assert_eq!(retrieved_profile.unwrap().username, username);
}

#[test]
fn test_get_profile_by_username() {
    let env = Env::default();
    let contract_id = env.register_contract(None, UserProfileContract);
    let client = UserProfileContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    let username = String::from_str(&env, "uniqueuser");
    let privacy_level = PrivacyLevel::Public;

    env.mock_all_auths();
    client.create_or_update_profile(&user, &username, &None, &None, &None, &privacy_level);

    let retrieved_profile = client.get_profile_by_username(&username);
    assert!(retrieved_profile.is_some());
    let profile = retrieved_profile.unwrap();
    assert_eq!(profile.username, username);
    assert_eq!(profile.owner, user);
}

#[test]
fn test_add_achievement() {
    let env = Env::default();
    let contract_id = env.register_contract(None, UserProfileContract);
    let client = UserProfileContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    let username = String::from_str(&env, "testuser");
    let privacy_level = PrivacyLevel::Public;

    env.mock_all_auths();
    client.create_or_update_profile(&user, &username, &None, &None, &None, &privacy_level);

    let achievement_title = String::from_str(&env, "First Achievement");
    let achievement_description = String::from_str(&env, "Completed first milestone");
    let badge_url = Some(String::from_str(&env, "https://example.com/badge.png"));

    let achievement_id = client.add_achievement(
        &user, &achievement_title, &achievement_description, &badge_url, &0u32,
    );
    assert!(achievement_id > 0);

    let achievement = client.get_achievement(&achievement_id).unwrap();
    assert_eq!(achievement.user, user);
    assert_eq!(achievement.title, achievement_title);
    assert_eq!(achievement.tier, 0u32);
    assert_eq!(achievement.weight, 1u32);
}

#[test]
fn test_get_user_achievements() {
    let env = Env::default();
    let contract_id = env.register_contract(None, UserProfileContract);
    let client = UserProfileContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    let username = String::from_str(&env, "testuser");
    let privacy_level = PrivacyLevel::Public;

    env.mock_all_auths();
    client.create_or_update_profile(&user, &username, &None, &None, &None, &privacy_level);

    let title1 = String::from_str(&env, "First");
    let desc1 = String::from_str(&env, "First milestone");
    let title2 = String::from_str(&env, "Second");
    let desc2 = String::from_str(&env, "Second milestone");

    let id1 = client.add_achievement(&user, &title1, &desc1, &None, &0u32);
    let id2 = client.add_achievement(&user, &title2, &desc2, &None, &0u32);

    let achievements = client.get_user_achievements(&user);
    assert_eq!(achievements.len(), 2);
}

#[test]
fn test_verify_achievement() {
    let env = Env::default();
    let contract_id = env.register_contract(None, UserProfileContract);
    let client = UserProfileContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);
    let admin = Address::generate(&env);

    let username = String::from_str(&env, "testuser");
    let privacy_level = PrivacyLevel::Public;

    env.mock_all_auths();
    client.create_or_update_profile(&user, &username, &None, &None, &None, &privacy_level);

    let title = String::from_str(&env, "Unverified Achievement");
    let desc = String::from_str(&env, "Needs verification");

    let achievement_id = client.add_achievement(&user, &title, &desc, &None, &0u32);

    let achievement = client.get_achievement(&achievement_id).unwrap();
    assert_eq!((achievement.timestamp & 1u64) != 0, false);

    env.mock_all_auths();
    let result = client.verify_achievement(&admin, &achievement_id);
    assert_eq!(result, true);

    let achievement = client.get_achievement(&achievement_id).unwrap();
    assert_eq!((achievement.timestamp & 1u64) != 0, true);
}

#[test]
fn test_verify_profile_authenticity() {
    let env = Env::default();
    let contract_id = env.register_contract(None, UserProfileContract);
    let client = UserProfileContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    let username = String::from_str(&env, "authenticuser");
    let privacy_level = PrivacyLevel::Public;

    env.mock_all_auths();
    client.create_or_update_profile(&user, &username, &None, &None, &None, &privacy_level);

    assert_eq!(client.verify_profile_authenticity(&user), true);

    let fake_user = Address::generate(&env);
    assert_eq!(client.verify_profile_authenticity(&fake_user), false);
}

#[test]
fn test_update_privacy_level() {
    let env = Env::default();
    let contract_id = env.register_contract(None, UserProfileContract);
    let client = UserProfileContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    let username = String::from_str(&env, "privacyuser");
    let initial_privacy = PrivacyLevel::Public;

    env.mock_all_auths();
    client.create_or_update_profile(&user, &username, &None, &None, &None, &initial_privacy);

    let result = client.update_privacy_level(&user, &PrivacyLevel::Private);
    assert_eq!(result, true);

    let profile = client.get_profile(&user).unwrap();
    assert_eq!(profile.flags.privacy_level(), 1u32);
}

#[test]
fn test_profile_with_privacy_check() {
    let env = Env::default();
    let contract_id = env.register_contract(None, UserProfileContract);
    let client = UserProfileContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);
    let requester = Address::generate(&env);

    let username = String::from_str(&env, "privateuser");
    let privacy_level = PrivacyLevel::Private;

    env.mock_all_auths();
    client.create_or_update_profile(&user, &username, &None, &None, &None, &privacy_level);

    assert!(client.get_profile_with_privacy_check(&requester, &user).is_none());
    assert!(client.get_profile_with_privacy_check(&user, &user).is_some());
}

#[test]
#[should_panic(expected = "Username already taken")]
fn test_username_uniqueness_panics() {
    let env = Env::default();
    let contract_id = env.register_contract(None, UserProfileContract);
    let client = UserProfileContractClient::new(&env, &contract_id);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    let username = String::from_str(&env, "uniqueusername");
    let privacy_level = PrivacyLevel::Public;

    env.mock_all_auths();
    client.create_or_update_profile(&user1, &username, &None, &None, &None, &privacy_level);

    env.mock_all_auths();
    client.create_or_update_profile(&user2, &username, &None, &None, &None, &privacy_level);
}
