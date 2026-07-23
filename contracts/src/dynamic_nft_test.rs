#![cfg(test)]
use soroban_sdk::{Address, Env, String, Vec};
use crate::dynamic_nft::{
    mint_dynamic_nft, evolve_nft, fuse_nfts, transfer_nft, get_nft,
    get_owner_tokens, get_total_supply, token_uri, nft_exists, owner_of, balance_of,
    upgrade_nft, get_nft_tier,
    DynamicNFT, EvolutionStage, RarityTier, CertificateTier, UpgradeRecord
};

#[test]
fn test_mint_dynamic_nft() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    // Initialize contract with admin
    env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);
    
    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    let initial_metadata = String::from_str(&env, "QmInitialMetadata");
    
    let token_id = mint_dynamic_nft(&env, admin, recipient.clone(), base_uri.clone(), initial_metadata.clone());
    
    assert!(token_id > 0);
    assert!(nft_exists(&env, token_id));
    assert_eq!(owner_of(&env, token_id), recipient);
    assert_eq!(balance_of(&env, recipient), 1);
    assert_eq!(get_total_supply(&env), 1);
    
    let nft = get_nft(&env, token_id);
    assert_eq!(nft.token_id, token_id);
    assert_eq!(nft.owner, recipient);
    assert_eq!(nft.creator, admin);
    assert_eq!(nft.base_uri, base_uri);
    assert_eq!(nft.current_level, 1);
    assert_eq!(nft.experience_points, 0);
    assert_eq!(nft.evolution_stage, EvolutionStage::Novice);
    assert_eq!(nft.visual_traits.rarity_tier, RarityTier::Common);
}

#[test]
fn test_evolve_nft() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);
    
    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    let initial_metadata = String::from_str(&env, "QmInitialMetadata");
    
    let token_id = mint_dynamic_nft(&env, admin, recipient.clone(), base_uri, initial_metadata);
    
    // Evolve with achievement
    let achievement_id = 1;
    let new_metadata = String::from_str(&env, "QmEvolvedMetadata");
    let evolved = evolve_nft(&env, token_id, achievement_id, new_metadata.clone());
    
    assert!(evolved);
    
    let nft = get_nft(&env, token_id);
    assert!(nft.achievements.contains(&achievement_id));
    assert!(nft.experience_points > 0);
    assert_eq!(nft.metadata_ipfs, new_metadata);
}

#[test]
fn test_multiple_evolutions() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);
    
    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    let initial_metadata = String::from_str(&env, "QmInitialMetadata");
    
    let token_id = mint_dynamic_nft(&env, admin, recipient, base_uri, initial_metadata);
    
    // Add multiple achievements to trigger evolution
    for i in 1..=20 {
        let new_metadata = String::from_str(&env, &format!("QmMetadata{}", i));
        evolve_nft(&env, token_id, i, new_metadata);
    }
    
    let nft = get_nft(&env, token_id);
    assert!(nft.current_level > 1);
    assert!(nft.evolution_stage as u8 > EvolutionStage::Novice as u8);
}

#[test]
fn test_fuse_nfts() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);
    
    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    
    // Mint two NFTs
    let token1_id = mint_dynamic_nft(&env, admin, recipient.clone(), base_uri.clone(), String::from_str(&env, "QmMetadata1"));
    let token2_id = mint_dynamic_nft(&env, admin, recipient.clone(), base_uri, String::from_str(&env, "QmMetadata2"));
    
    // Evolve both NFTs
    evolve_nft(&env, token1_id, 1, String::from_str(&env, "QmEvolved1"));
    evolve_nft(&env, token2_id, 2, String::from_str(&env, "QmEvolved2"));
    
    // Fuse NFTs
    let fused_token_id = fuse_nfts(&env, token1_id, token2_id, recipient.clone());
    
    assert!(fused_token_id > 0);
    assert!(nft_exists(&env, fused_token_id));
    assert!(!nft_exists(&env, token1_id)); // Original should be burned
    assert!(!nft_exists(&env, token2_id)); // Original should be burned
    
    let fused_nft = get_nft(&env, fused_token_id);
    assert_eq!(fused_nft.owner, recipient);
    assert!(fused_nft.achievements.len() >= 2); // Should have combined achievements
}

#[test]
fn test_transfer_nft() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    
    env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);
    
    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    let initial_metadata = String::from_str(&env, "QmInitialMetadata");
    
    let token_id = mint_dynamic_nft(&env, admin, owner.clone(), base_uri, initial_metadata);
    
    assert_eq!(balance_of(&env, owner.clone()), 1);
    assert_eq!(balance_of(&env, new_owner.clone()), 0);
    
    // Transfer NFT
    transfer_nft(&env, owner.clone(), new_owner.clone(), token_id);
    
    assert_eq!(owner_of(&env, token_id), new_owner);
    assert_eq!(balance_of(&env, owner), 0);
    assert_eq!(balance_of(&env, new_owner), 1);
}

#[test]
fn test_token_uri() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);
    
    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    let initial_metadata = String::from_str(&env, "QmInitialMetadata");
    
    let token_id = mint_dynamic_nft(&env, admin, recipient, base_uri.clone(), initial_metadata.clone());
    
    let uri = token_uri(&env, token_id);
    assert_eq!(uri, format!("{}/{}", base_uri, initial_metadata));
}

#[test]
fn test_get_owner_tokens() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);
    
    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    
    // Mint multiple NFTs
    let token1_id = mint_dynamic_nft(&env, admin, recipient.clone(), base_uri.clone(), String::from_str(&env, "QmMetadata1"));
    let token2_id = mint_dynamic_nft(&env, admin, recipient.clone(), base_uri, String::from_str(&env, "QmMetadata2"));
    
    let owner_tokens = get_owner_tokens(&env, recipient);
    assert_eq!(owner_tokens.len(), 2);
    assert!(owner_tokens.contains(&token1_id));
    assert!(owner_tokens.contains(&token2_id));
}

#[test]
#[should_panic(expected = "NFT not found")]
fn test_get_nonexistent_nft() {
    let env = Env::default();
    get_nft(&env, 999);
}

#[test]
#[should_panic(expected = "Not the owner")]
fn test_unauthorized_transfer() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let unauthorized = Address::generate(&env);
    let recipient = Address::generate(&env);
    
    env.storage().instance().set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);
    
    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    let initial_metadata = String::from_str(&env, "QmInitialMetadata");
    
    let token_id = mint_dynamic_nft(&env, admin, owner, base_uri, initial_metadata);
    
    // Try to transfer with unauthorized address
    transfer_nft(&env, unauthorized, recipient, token_id);
}

// ---------------------------------------------------------------------------
// Issue #7: Burn-and-upgrade tests
// ---------------------------------------------------------------------------

#[test]
fn test_burn_and_upgrade_basic_to_advanced() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);

    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    let initial_metadata = String::from_str(&env, "QmCourseCompletion");
    let cert_title = String::from_str(&env, "Advanced Web3 Developer");
    let new_metadata = String::from_str(&env, "QmAdvancedCert");

    let source_id = mint_dynamic_nft(
        &env,
        admin,
        recipient.clone(),
        base_uri,
        initial_metadata,
    );

    // Sanity: fresh mints are always Basic.
    assert_eq!(get_nft_tier(&env, source_id), CertificateTier::Basic);

    let new_id = upgrade_nft(
        &env,
        recipient.clone(),
        source_id,
        new_metadata.clone(),
        cert_title.clone(),
    );

    assert_ne!(new_id, source_id);
    assert!(!nft_exists(&env, source_id), "burned NFT should be gone");
    assert!(nft_exists(&env, new_id));

    let upgraded = get_nft(&env, new_id);
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
        .contains(&200u8));
    assert_eq!(upgraded.visual_traits.rarity_tier, RarityTier::Epic);
}

#[test]
fn test_burned_nft_no_longer_exists() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);

    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    let initial_metadata = String::from_str(&env, "QmCourseCompletion");

    let source_id = mint_dynamic_nft(&env, admin, recipient.clone(), base_uri, initial_metadata);
    let new_id = upgrade_nft(
        &env,
        recipient.clone(),
        source_id,
        String::from_str(&env, "QmAdv"),
        String::from_str(&env, "Cert"),
    );

    assert_eq!(get_total_supply(&env), new_id);
    assert_eq!(balance_of(&env, recipient), 1, "should still own exactly 1 NFT");
    let tokens = get_owner_tokens(&env, recipient);
    assert!(tokens.contains(&new_id));
    assert!(!tokens.contains(&source_id));
}

#[test]
fn test_upgrade_preserves_achievements_and_xp() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);

    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    let initial_metadata = String::from_str(&env, "QmCourseCompletion");

    let source_id = mint_dynamic_nft(
        &env,
        admin,
        recipient.clone(),
        base_uri,
        initial_metadata,
    );

    // Earn enough experience/achievements so XP != 0 and the source has
    // achievements attached to it before we burn+upgrade.
    for i in 1..=10u64 {
        let evolved = evolve_nft(
            &env,
            source_id,
            i,
            String::from_str(&env, &format!("QmMeta-{}", i)),
        );
        assert!(evolved, "achievement {} should unlock", i);
    }

    let pre = get_nft(&env, source_id);
    let pre_xp = pre.experience_points;
    let pre_achievement_count = pre.achievements.len();
    assert!(pre_xp > 0);
    assert!(pre_achievement_count >= 10);

    let new_id = upgrade_nft(
        &env,
        recipient.clone(),
        source_id,
        String::from_str(&env, "QmAdvanced"),
        String::from_str(&env, "Cert"),
    );

    let post = get_nft(&env, new_id);
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
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    env.storage()
        .instance()
        .set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);

    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    let source_id = mint_dynamic_nft(
        &env,
        admin,
        recipient.clone(),
        base_uri.clone(),
        String::from_str(&env, "QmCourseCompletion"),
    );

    // First upgrade succeeds: Basic -> Advanced.
    let _advanced_id = upgrade_nft(
        &env,
        recipient.clone(),
        source_id,
        String::from_str(&env, "QmAdv"),
        String::from_str(&env, "Cert"),
    );

    // Re-mint a Basic NFT under the same owner to confirm the rule applies
    // to the Advanced tier itself rather than relying on the source being
    // burned. Then verify the second upgrade panics.
    let second_source = mint_dynamic_nft(
        &env,
        admin,
        recipient.clone(),
        base_uri,
        String::from_str(&env, "QmSecondBasic"),
    );
    let second_advanced = upgrade_nft(
        &env,
        recipient.clone(),
        second_source,
        String::from_str(&env, "QmAdv2"),
        String::from_str(&env, "Cert2"),
    );
    assert_eq!(get_nft_tier(&env, second_advanced), CertificateTier::Advanced);

    // Try to burn the Advanced NFT to mint a further-upgraded NFT. The
    // contract must refuse, because each NFT can be upgraded at most once.
    let result = std::panic::catch_unwind(|| {
        upgrade_nft(
            &env,
            recipient.clone(),
            second_advanced,
            String::from_str(&env, "QmThird"),
            String::from_str(&env, "Cert3"),
        )
    });
    assert!(result.is_err(), "re-upgrade must panic with a clear error");
}

#[test]
fn test_non_owner_cannot_upgrade() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let non_owner = Address::generate(&env);

    env.storage()
        .instance()
        .set(&soroban_sdk::Symbol::new(&env, "admin"), &admin);

    let base_uri = String::from_str(&env, "https://api.starked.com/nft");
    let token_id = mint_dynamic_nft(
        &env,
        admin,
        owner.clone(),
        base_uri,
        String::from_str(&env, "QmInit"),
    );

    let result = std::panic::catch_unwind(|| {
        upgrade_nft(
            &env,
            non_owner,
            token_id,
            String::from_str(&env, "QmAdv"),
            String::from_str(&env, "Cert"),
        )
    });
    assert!(result.is_err(), "non-owner upgrade must panic");
}

#[test]
#[should_panic(expected = "NFT not found")]
fn test_upgrade_unknown_token_panics() {
    let env = Env::default();
    let recipient = Address::generate(&env);

    upgrade_nft(
        &env,
        recipient,
        9999,
        String::from_str(&env, "QmAdv"),
        String::from_str(&env, "Cert"),
    );
}
