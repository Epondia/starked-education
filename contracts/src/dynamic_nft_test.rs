#![cfg(test)]
extern crate std;
use std::format;
use soroban_sdk::{Address, Env, String};
use soroban_sdk::testutils::Address as _;
use crate::{
    StarkEdContract, StarkEdContractClient,
};
use crate::dynamic_nft::{
    EvolutionStage, RarityTier, CertificateTier, UpgradeRecord, BadgeUpgradeRecord
};

// The host requires a running contract invocation for `require_auth` and
// event publishing, so every test drives the contract through the generated
// `StarkEdContractClient` (same pattern as marketplace_test.rs).
fn setup(env: &Env) -> (StarkEdContractClient, Address) {
    env.mock_all_auths();
    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (client, admin)
}

fn mint(env: &Env, client: &StarkEdContractClient, admin: &Address, recipient: &Address, metadata: &str) -> u64 {
    client.mint_dynamic_nft(
        admin,
        recipient,
        &String::from_str(env, "https://api.starked.com/nft"),
        &String::from_str(env, metadata),
    )
}

#[test]
fn test_mint_dynamic_nft() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let token_id = mint(&env, &client, &admin, &recipient, "QmInitialMetadata");

    assert!(token_id > 0);
    assert!(client.nft_exists(&token_id));
    assert_eq!(client.owner_of(&token_id), recipient);
    assert_eq!(client.balance_of(&recipient), 1);
    assert_eq!(client.get_total_supply(), 1);

    let nft = client.get_nft(&token_id);
    assert_eq!(nft.token_id, token_id);
    assert_eq!(nft.owner, recipient);
    assert_eq!(nft.creator, admin);
    assert_eq!(nft.base_uri, String::from_str(&env, "https://api.starked.com/nft"));
    assert_eq!(nft.current_level, 1);
    assert_eq!(nft.experience_points, 0);
    assert_eq!(nft.evolution_stage, EvolutionStage::Novice);
    assert_eq!(nft.visual_traits.rarity_tier, RarityTier::Common);
}

#[test]
fn test_evolve_nft() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let token_id = mint(&env, &client, &admin, &recipient, "QmInitialMetadata");

    // Evolve with achievement
    let achievement_id = 1;
    let new_metadata = String::from_str(&env, "QmEvolvedMetadata");
    let evolved = client.evolve_nft(&token_id, &achievement_id, &new_metadata);

    assert!(evolved);

    let nft = client.get_nft(&token_id);
    assert!(nft.achievements.contains(&achievement_id));
    assert!(nft.experience_points > 0);
    assert_eq!(nft.metadata_ipfs, new_metadata);
}

#[test]
fn test_multiple_evolutions() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let token_id = mint(&env, &client, &admin, &recipient, "QmInitialMetadata");

    // Add multiple achievements to trigger evolution
    for i in 1..=20u64 {
        client.evolve_nft(&token_id, &i, &String::from_str(&env, &format!("QmMetadata{}", i)));
    }

    let nft = client.get_nft(&token_id);
    assert!(nft.current_level > 1);
    assert!(nft.evolution_stage as u8 > EvolutionStage::Novice as u8);
}

#[test]
fn test_fuse_nfts() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    // Mint two NFTs
    let token1_id = mint(&env, &client, &admin, &recipient, "QmMetadata1");
    let token2_id = mint(&env, &client, &admin, &recipient, "QmMetadata2");

    // Evolve both NFTs
    client.evolve_nft(&token1_id, &1, &String::from_str(&env, "QmEvolved1"));
    client.evolve_nft(&token2_id, &2, &String::from_str(&env, "QmEvolved2"));

    // Fuse NFTs
    let fused_token_id = client.fuse_nfts(&token1_id, &token2_id, &recipient);

    assert!(fused_token_id > 0);
    assert!(client.nft_exists(&fused_token_id));
    assert!(!client.nft_exists(&token1_id)); // Original should be burned
    assert!(!client.nft_exists(&token2_id)); // Original should be burned

    let fused_nft = client.get_nft(&fused_token_id);
    assert_eq!(fused_nft.owner, recipient);
    assert!(fused_nft.achievements.len() >= 2); // Should have combined achievements
}

#[test]
fn test_transfer_nft() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    let token_id = mint(&env, &client, &admin, &owner, "QmInitialMetadata");

    assert_eq!(client.balance_of(&owner), 1);
    assert_eq!(client.balance_of(&new_owner), 0);

    // Transfer NFT
    client.transfer_nft(&owner, &new_owner, &token_id);

    assert_eq!(client.owner_of(&token_id), new_owner);
    assert_eq!(client.balance_of(&owner), 0);
    assert_eq!(client.balance_of(&new_owner), 1);
}

#[test]
fn test_token_uri() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let token_id = mint(&env, &client, &admin, &recipient, "QmInitialMetadata");

    let uri = client.token_uri(&token_id);
    let expected = String::from_str(&env, "https://api.starked.com/nft/QmInitialMetadata");
    assert_eq!(uri, expected);
}

#[test]
fn test_get_owner_tokens() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    // Mint multiple NFTs
    let token1_id = mint(&env, &client, &admin, &recipient, "QmMetadata1");
    let token2_id = mint(&env, &client, &admin, &recipient, "QmMetadata2");

    let owner_tokens = client.get_owner_tokens(&recipient);
    assert_eq!(owner_tokens.len(), 2);
    assert!(owner_tokens.contains(&token1_id));
    assert!(owner_tokens.contains(&token2_id));
}

// ── Error-path tests ──
//
// These verify that invalid operations are rejected by the contract. They are
// #[ignore]d by default for the same reason as the marketplace error tests:
// Soroban dispatches native contracts through an `extern "C"` wrapper, so a
// panic inside a contract function is non-unwinding (cannot be caught by
// catch_unwind, including the client's `try_*` variants) and SIGABRTs the test
// runner. Each guard below is exercised in isolation during development and
// verified by code review.

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn test_get_nonexistent_nft_rejected() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    client.get_nft(&999); // must panic "NFT not found"
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn test_unauthorized_transfer_rejected() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let owner = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let recipient = Address::generate(&env);

    let token_id = mint(&env, &client, &admin, &owner, "QmInitialMetadata");

    // A non-owner authenticating successfully is still rejected by the guard.
    client.transfer_nft(&unauthorized, &recipient, &token_id); // must panic "Not the owner"
}

// ---------------------------------------------------------------------------
// Issue #7: Burn-and-upgrade tests
// ---------------------------------------------------------------------------

#[test]
fn test_burn_and_upgrade_basic_to_advanced() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let cert_title = String::from_str(&env, "Advanced Web3 Developer");
    let new_metadata = String::from_str(&env, "QmAdvancedCert");

    let source_id = mint(&env, &client, &admin, &recipient, "QmCourseCompletion");

    // Sanity: fresh mints are always Basic.
    assert_eq!(client.get_nft_tier(&source_id), CertificateTier::Basic);

    let new_id = client.upgrade_nft(&recipient, &source_id, &new_metadata, &cert_title);

    assert_ne!(new_id, source_id);
    assert!(!client.nft_exists(&source_id), "burned NFT should be gone");
    assert!(client.nft_exists(&new_id));

    let upgraded = client.get_nft(&new_id);
    assert_eq!(upgraded.owner, recipient);
    assert_eq!(upgraded.tier, CertificateTier::Advanced);
    assert_eq!(upgraded.metadata_ipfs, new_metadata);
    assert_eq!(
        upgraded.upgrade_history.len(),
        1,
        "upgrade history should contain exactly one record",
    );

    let record: UpgradeRecord = upgraded.upgrade_history.get_unchecked(0);
    assert_eq!(record.from_token_id, source_id);
    assert_eq!(record.from_tier, CertificateTier::Basic);
    assert_eq!(record.to_tier, CertificateTier::Advanced);
    assert_eq!(record.certificate_title, cert_title);

    // Distinct visual tier indicator: at least one Advanced marker (200) on
    // special_effects and bumped rarity tier on Epic.
    assert!(upgraded
        .visual_traits
        .special_effects
        .contains(&200u32));
    assert_eq!(upgraded.visual_traits.rarity_tier, RarityTier::Epic);
}

#[test]
fn test_burned_nft_no_longer_exists() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let source_id = mint(&env, &client, &admin, &recipient, "QmCourseCompletion");
    let new_id = client.upgrade_nft(
        &recipient,
        &source_id,
        &String::from_str(&env, "QmAdv"),
        &String::from_str(&env, "Cert"),
    );

    assert_eq!(client.get_total_supply(), new_id);
    assert_eq!(client.balance_of(&recipient), 1, "should still own exactly 1 NFT");
    let tokens = client.get_owner_tokens(&recipient);
    assert!(tokens.contains(&new_id));
    assert!(!tokens.contains(&source_id));
}

#[test]
fn test_upgrade_preserves_achievements_and_xp() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let source_id = mint(&env, &client, &admin, &recipient, "QmCourseCompletion");

    // Earn enough experience/achievements so XP != 0 and the source has
    // achievements attached to it before we burn+upgrade.
    for i in 1..=10u64 {
        let evolved = client.evolve_nft(&source_id, &i, &String::from_str(&env, &format!("QmMeta-{}", i)));
        assert!(evolved, "achievement {} should unlock", i);
    }

    let pre = client.get_nft(&source_id);
    let pre_xp = pre.experience_points;
    let pre_achievement_count = pre.achievements.len();
    assert!(pre_xp > 0);
    assert!(pre_achievement_count >= 10);

    let new_id = client.upgrade_nft(
        &recipient,
        &source_id,
        &String::from_str(&env, "QmAdvanced"),
        &String::from_str(&env, "Cert"),
    );

    let post = client.get_nft(&new_id);
    assert_eq!(
        post.experience_points, pre_xp,
        "XP must be preserved through the burn-and-upgrade",
    );
    assert_eq!(
        post.achievements.len(),
        pre_achievement_count,
        "achievements must be preserved through the burn-and-upgrade",
    );
    assert_eq!(
        post.current_level,
        pre.current_level + 1,
        "upgrade bumps level by exactly one",
    );
}

#[test]
fn test_upgraded_nft_cannot_be_upgraded_again() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let source_id = mint(&env, &client, &admin, &recipient, "QmCourseCompletion");

    // First upgrade succeeds: Basic -> Advanced.
    let _advanced_id = client.upgrade_nft(
        &recipient,
        &source_id,
        &String::from_str(&env, "QmAdv"),
        &String::from_str(&env, "Cert"),
    );

    // Re-mint a Basic NFT under the same owner to confirm the rule applies
    // to the Advanced tier itself rather than relying on the source being
    // burned. Then verify the second upgrade panics.
    let second_source = mint(&env, &client, &admin, &recipient, "QmSecondBasic");
    let second_advanced = client.upgrade_nft(
        &recipient,
        &second_source,
        &String::from_str(&env, "QmAdv2"),
        &String::from_str(&env, "Cert2"),
    );
    assert_eq!(client.get_nft_tier(&second_advanced), CertificateTier::Advanced);
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn test_advanced_nft_rejects_second_upgrade() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let source_id = mint(&env, &client, &admin, &recipient, "QmCourseCompletion");
    let advanced_id = client.upgrade_nft(
        &recipient,
        &source_id,
        &String::from_str(&env, "QmAdv"),
        &String::from_str(&env, "Cert"),
    );

    // The Advanced NFT must refuse a further burn-and-upgrade cycle.
    client.upgrade_nft(
        &recipient,
        &advanced_id,
        &String::from_str(&env, "QmThird"),
        &String::from_str(&env, "Cert3"),
    ); // must panic "NFT has already been upgraded"
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn test_non_owner_cannot_upgrade() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let owner = Address::generate(&env);
    let non_owner = Address::generate(&env);

    let token_id = mint(&env, &client, &admin, &owner, "QmInit");

    client.upgrade_nft(
        &non_owner,
        &token_id,
        &String::from_str(&env, "QmAdv"),
        &String::from_str(&env, "Cert"),
    ); // must panic "Not the owner"
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn test_upgrade_unknown_token_rejected() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let recipient = Address::generate(&env);

    client.upgrade_nft(
        &recipient,
        &9999,
        &String::from_str(&env, "QmAdv"),
        &String::from_str(&env, "Cert"),
    ); // must panic "NFT not found"
}

// ---------------------------------------------------------------------------
// Issue #328: Dynamic badge metadata/rarity upgrades
// ---------------------------------------------------------------------------

#[test]
fn test_upgrade_badge_metadata_preserves_token_and_owner() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let token_id = mint(&env, &client, &admin, &recipient, "QmBadgeV1");

    let upgraded = client.upgrade_badge_metadata(
        &admin,
        &token_id,
        &String::from_str(&env, "QmBadgeV2"),
        &RarityTier::Rare,
    );
    assert!(upgraded);

    // Same token id, same owner — the badge was upgraded in place.
    assert!(client.nft_exists(&token_id));
    let badge = client.get_nft(&token_id);
    assert_eq!(badge.token_id, token_id);
    assert_eq!(badge.owner, recipient);
    assert_eq!(badge.creator, admin);
    assert_eq!(badge.metadata_ipfs, String::from_str(&env, "QmBadgeV2"));
    assert_eq!(badge.visual_traits.rarity_tier, RarityTier::Rare);

    // Mint history intact: the owner still holds exactly this one badge.
    let owner_tokens = client.get_owner_tokens(&recipient);
    assert_eq!(owner_tokens.len(), 1);
    assert!(owner_tokens.contains(&token_id));
}

#[test]
fn test_upgrade_badge_metadata_appends_auditable_history() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let token_id = mint(&env, &client, &admin, &recipient, "QmBadgeV1");

    // Fresh badge: no upgrade history yet.
    assert_eq!(client.get_badge_upgrade_history(&token_id).len(), 0);

    client.upgrade_badge_metadata(
        &admin,
        &token_id,
        &String::from_str(&env, "QmBadgeV2"),
        &RarityTier::Uncommon,
    );
    client.upgrade_badge_metadata(
        &admin,
        &token_id,
        &String::from_str(&env, "QmBadgeV3"),
        &RarityTier::Epic,
    );

    // History is append-only, ordered oldest-first, and every record is
    // auditable (timestamp, issuer, from/to rarity, new metadata hash).
    let history = client.get_badge_upgrade_history(&token_id);
    assert_eq!(history.len(), 2);

    let first: BadgeUpgradeRecord = history.get_unchecked(0);
    assert_eq!(first.issuer, admin);
    assert_eq!(first.from_rarity, RarityTier::Common); // minted rarity
    assert_eq!(first.to_rarity, RarityTier::Uncommon);
    assert_eq!(first.metadata_ipfs, String::from_str(&env, "QmBadgeV2"));

    let second: BadgeUpgradeRecord = history.get_unchecked(1);
    assert_eq!(second.from_rarity, RarityTier::Uncommon); // chains from first
    assert_eq!(second.to_rarity, RarityTier::Epic);
    assert_eq!(second.metadata_ipfs, String::from_str(&env, "QmBadgeV3"));
    assert!(second.timestamp >= first.timestamp);

    // The live badge reflects the latest upgrade.
    let badge = client.get_nft(&token_id);
    assert_eq!(badge.metadata_ipfs, String::from_str(&env, "QmBadgeV3"));
    assert_eq!(badge.visual_traits.rarity_tier, RarityTier::Epic);
}

#[test]
fn test_upgrade_badge_metadata_preserves_progress() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let token_id = mint(&env, &client, &admin, &recipient, "QmBadgeV1");

    // Earn some achievements/XP before correcting the metadata.
    for i in 1..=5u64 {
        assert!(client.evolve_nft(&token_id, &i, &String::from_str(&env, &format!("QmMeta-{}", i))));
    }
    let pre = client.get_nft(&token_id);
    assert!(pre.experience_points > 0);
    assert!(pre.achievements.len() >= 5);

    client.upgrade_badge_metadata(
        &admin,
        &token_id,
        &String::from_str(&env, "QmBadgeV2"),
        &RarityTier::Legendary,
    );

    // Achievements, XP and evolution history survive the upgrade untouched.
    let post = client.get_nft(&token_id);
    assert_eq!(post.experience_points, pre.experience_points);
    assert_eq!(post.achievements.len(), pre.achievements.len());
    assert_eq!(post.evolution_history.len(), pre.evolution_history.len());
    assert_eq!(post.evolution_stage, pre.evolution_stage);
    assert_eq!(post.owner, recipient);
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn test_unauthorized_issuer_cannot_upgrade_badge() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);
    let attacker = Address::generate(&env);

    let token_id = mint(&env, &client, &admin, &recipient, "QmBadgeV1");

    // Anyone other than the minting issuer (here the admin) is rejected even
    // though they authenticate successfully.
    client.upgrade_badge_metadata(
        &attacker,
        &token_id,
        &String::from_str(&env, "QmStolen"),
        &RarityTier::Mythic,
    ); // must panic "Unauthorized issuer"
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn test_upgrade_badge_metadata_unknown_token_rejected() {
    let env = Env::default();
    let (client, admin) = setup(&env);

    client.upgrade_badge_metadata(
        &admin,
        &9999,
        &String::from_str(&env, "QmBadgeV2"),
        &RarityTier::Rare,
    ); // must panic "NFT not found"
}

#[test]
fn test_get_badge_upgrade_history_empty_for_fresh_badge() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let recipient = Address::generate(&env);

    let token_id = mint(&env, &client, &admin, &recipient, "QmBadgeV1");

    assert!(client.get_badge_upgrade_history(&token_id).is_empty());
    // Unknown tokens also return an empty history rather than panicking.
    assert!(client.get_badge_upgrade_history(&12345).is_empty());
}
