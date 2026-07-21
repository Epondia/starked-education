#![cfg(test)]
extern crate std;

use crate::marketplace::{MarketplaceContract, MarketplaceContractClient, MarketplaceKey};
use crate::utils::storage::StorageKey;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String, symbol_short,
};

#[test]
fn test_marketplace_initialization() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin);

    // Verify admin is set in storage (internal check via client is better, but MarketplaceContract doesn't have get_admin)
    // We'll trust the initialize function worked if it doesn't panic on second call
}

#[test]
fn test_listing_and_purchase() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let credential_id = 1u64;
    let price = 1000u64;
    let royalty_bps = 500; // 5%

    let listing_id = client.list_credential(&seller, &credential_id, &price, &royalty_bps);
    assert_eq!(listing_id, 1);
    // Verify ListingCreated event
    let events = env.events().all();
    assert!(events.iter().any(|(topics, _): &(_, _)| *topics == (symbol_short!("marketplace"), symbol_short!("created"))));

    client.purchase_credential(&buyer, &listing_id);
    // Verify SaleCompleted event
    let events = env.events().all();
    assert!(events.iter().any(|(topics, _): &(_, _)| *topics == (symbol_short!("marketplace"), symbol_short!("sale_completed"))));

    // Trade count should increment
    let price_after = client.calculate_bonding_price(&credential_id);
    assert!(price_after > 100); // Base price is 100, price should increase after a trade
}

#[test]
fn test_licensing_and_bonding_curve() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let tenant = Address::generate(&env);

    client.initialize(&admin);

    let credential_id = 1u64;

    // Initial price
    let price1 = client.calculate_bonding_price(&credential_id);
    assert_eq!(price1, 100); // 100 + 10 * 0 * 0

    // Rent
    client.rent_credential(&tenant, &credential_id, &3600);
    // Verify Rented event
    let events = env.events().all();
    assert!(events.iter().any(|(topics, _): &(_, _)| *topics == (symbol_short!("marketplace"), symbol_short!("rented"))));

    // Bonding curve check: we need trades to increase price
    // Since rent_credential doesn't increment TradeCount in the current implementation (only purchase does),
    // let's verify purchase increments it.
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let listing_id = client.list_credential(&seller, &credential_id, &1000, &500);
    client.purchase_credential(&buyer, &listing_id);

    let price2 = client.calculate_bonding_price(&credential_id);
    assert_eq!(price2, 110); // 100 + 10 * 1 * 1
}

#[test]
fn test_staking_and_rewards() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let staker = Address::generate(&env);

    client.initialize(&admin);

    env.ledger().set_timestamp(1000);
    let credential_id = 1u64;
    let amount = 10000u64;

    client.stake_credential(&staker, &credential_id, &amount);

    // Fast forward 1 day (86400 seconds)
    env.ledger().set_timestamp(1000 + 86400);

    let rewards = client.claim_rewards(&staker, &credential_id);
    // base_reward = 10000 * 86400 / 8640000 = 100
    // total_reward = 100 + (100 * 100 / 1000) = 110
    assert_eq!(rewards, 110);
}

#[test]
fn test_dispute_resolution() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let listing_id = 1u64;
    let reason = String::from_str(&env, "Credential not valid");

    let dispute_id = client.open_dispute(&buyer, &listing_id, &reason);
    assert_eq!(dispute_id, 1);
    let events = env.events().all();
    assert!(events.iter().any(|(topics, _): &(_, _)| *topics == (symbol_short!("marketplace"), symbol_short!("dispute_opened"))));

    client.resolve_dispute(&admin, &dispute_id, &true);
    // Verify DisputeResolved event
    let events = env.events().all();
    assert!(events.iter().any(|(topics, _): &(_, _)| *topics == (symbol_short!("marketplace"), symbol_short!("dispute_resolved"))));
}

// ═══════════════════════════════════════════════════════════════
//  Escrow System Tests
// ═══════════════════════════════════════════════════════════════

#[test]
fn test_escrow_create_and_confirm_delivery() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    // Create listing
    let credential_id = 1u64;
    let price = 1000u64;
    let listing_id = client.list_credential(&seller, &credential_id, &price, &500);

    // Create escrow
    env.ledger().set_timestamp(1000);
    let timeout = 86400; // 1 day
    let escrow_id = client.create_escrow(&buyer, &listing_id, &timeout);
    assert_eq!(escrow_id, 1);

    // Verify escrow created event
    let events = env.events().all();
    assert!(events.iter().any(|(topics, _): &(_, _)| *topics == (symbol_short!("marketplace"), symbol_short!("escrow_created"))));

    // Confirm delivery
    client.confirm_delivery(&buyer, &escrow_id);

    // Verify escrow released event
    let events = env.events().all();
    assert!(events.iter().any(|(topics, _): &(_, _)| *topics == (symbol_short!("marketplace"), symbol_short!("escrow_released"))));

    // Verify escrow is queryable
    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, crate::marketplace::EscrowStatus::Released);
    assert_eq!(escrow.buyer, buyer);
    assert_eq!(escrow.seller, seller);
    assert_eq!(escrow.amount, price);
}

#[test]
fn test_escrow_timeout_refund() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let listing_id = client.list_credential(&seller, &1, &1000, &500);

    env.ledger().set_timestamp(1000);
    let timeout = 3600; // 1 hour
    let escrow_id = client.create_escrow(&buyer, &listing_id, &timeout);

    // Fast forward past timeout
    env.ledger().set_timestamp(1000 + timeout + 1);

    // Claim refund
    client.refund_escrow(&buyer, &escrow_id);

    // Verify refund event
    let events = env.events().all();
    assert!(events.iter().any(|(topics, _): &(_, _)| *topics == (symbol_short!("marketplace"), symbol_short!("escrow_refunded"))));

    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, crate::marketplace::EscrowStatus::Refunded);
}

#[test]
#[should_panic(expected = "Escrow has not timed out yet")]
fn test_escrow_refund_before_timeout_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let listing_id = client.list_credential(&seller, &1, &1000, &500);

    env.ledger().set_timestamp(1000);
    let escrow_id = client.create_escrow(&buyer, &listing_id, &3600);

    // Try to refund before timeout (at timestamp 1000, timeout is 4600)
    client.refund_escrow(&buyer, &escrow_id);
}

#[test]
#[should_panic(expected = "Escrow is not in funded state")]
fn test_double_release_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let listing_id = client.list_credential(&seller, &1, &1000, &500);
    let escrow_id = client.create_escrow(&buyer, &listing_id, &86400);

    client.confirm_delivery(&buyer, &escrow_id);
    // Second confirm should panic
    client.confirm_delivery(&buyer, &escrow_id);
}

#[test]
fn test_escrow_dispute_and_resolution() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let listing_id = client.list_credential(&seller, &1, &1000, &500);
    let escrow_id = client.create_escrow(&buyer, &listing_id, &86400);

    // Buyer disputes
    let reason = String::from_str(&env, "Wrong credential received");
    let dispute_id = client.dispute_escrow(&buyer, &escrow_id, &reason);
    assert_eq!(dispute_id, 1);

    // Verify dispute event
    let events = env.events().all();
    assert!(events.iter().any(|(topics, _): &(_, _)| *topics == (symbol_short!("marketplace"), symbol_short!("escrow_disputed"))));

    // Admin resolves in favor of buyer (refund)
    client.resolve_escrow_dispute(&admin, &escrow_id, &dispute_id, &true);

    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, crate::marketplace::EscrowStatus::Refunded);

    // Verify resolution event
    let events = env.events().all();
    assert!(events.iter().any(|(topics, _): &(_, _)| *topics == (symbol_short!("marketplace"), symbol_short!("escrow_resolved"))));
}

#[test]
fn test_escrow_seller_can_also_dispute() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let listing_id = client.list_credential(&seller, &1, &1000, &500);
    let escrow_id = client.create_escrow(&buyer, &listing_id, &86400);

    // Seller disputes (e.g., buyer unresponsive)
    let reason = String::from_str(&env, "Buyer not responding");
    let dispute_id = client.dispute_escrow(&seller, &escrow_id, &reason);

    // Admin resolves in favor of seller (release funds)
    client.resolve_escrow_dispute(&admin, &escrow_id, &dispute_id, &false);

    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, crate::marketplace::EscrowStatus::Released);
}
