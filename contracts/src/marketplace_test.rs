#![cfg(test)]
extern crate std;

use crate::marketplace::{MarketplaceContract, MarketplaceContractClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

#[test]
fn test_marketplace_initialization() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin);
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
    let royalty_bps = 500;

    let listing_id = client.list_credential(&seller, &credential_id, &price, &royalty_bps);
    assert_eq!(listing_id, 1);

    client.purchase_credential(&buyer, &listing_id);

    let price_after = client.calculate_bonding_price(&credential_id);
    assert!(price_after > 100);
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

    let price1 = client.calculate_bonding_price(&credential_id);
    assert_eq!(price1, 100);

    client.rent_credential(&tenant, &credential_id, &3600);

    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let listing_id = client.list_credential(&seller, &credential_id, &1000, &500);
    client.purchase_credential(&buyer, &listing_id);

    let price2 = client.calculate_bonding_price(&credential_id);
    assert_eq!(price2, 110);
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

    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);

    let credential_id = 1u64;
    let amount = 10000u64;

    client.stake_credential(&staker, &credential_id, &amount);

    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000 + 86400;
    env.ledger().set(ledger_info);

    let rewards = client.claim_rewards(&staker, &credential_id);
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

    client.resolve_dispute(&admin, &dispute_id, &true);
}

// ── Escrow Tests ──

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

    let credential_id = 1u64;
    let price = 1000u64;
    let listing_id = client.list_credential(&seller, &credential_id, &price, &200);

    let timeout = 86400u64;
    let escrow_id = client.create_escrow(&buyer, &listing_id, &timeout);
    assert_eq!(escrow_id, 1);

    // Verify escrow state is queryable by both parties
    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, 0); // Funded
    assert_eq!(escrow.buyer, buyer);
    assert_eq!(escrow.seller, seller);
    assert_eq!(escrow.amount, price);
    assert_eq!(escrow.listing_id, listing_id);

    // Buyer confirms delivery → funds released to seller
    client.confirm_delivery(&buyer, &escrow_id);

    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, 1); // Released
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

    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);

    let credential_id = 1u64;
    let price = 1000u64;
    let listing_id = client.list_credential(&seller, &credential_id, &price, &200);

    let timeout = 3600u64;
    let escrow_id = client.create_escrow(&buyer, &listing_id, &timeout);

    // Fast forward past timeout
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000 + 3601;
    env.ledger().set(ledger_info);

    // Anyone can claim the refund (using buyer addr here for simplicity)
    client.claim_timeout_refund(&escrow_id);

    // Verify escrow status is Refunded
    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, 2); // Refunded
}

#[test]
#[should_panic(expected = "Timeout has not yet expired")]
fn test_escrow_timeout_refund_before_expiry_fails() {
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
    let listing_id = client.list_credential(&seller, &credential_id, &price, &200);

    let timeout = 3600u64;
    let escrow_id = client.create_escrow(&buyer, &listing_id, &timeout);

    // Try to claim refund before timeout
    client.claim_timeout_refund(&escrow_id);
}

#[test]
#[should_panic(expected = "Escrow is not in funded state")]
fn test_escrow_double_release_prevented() {
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
    let listing_id = client.list_credential(&seller, &credential_id, &price, &200);

    let timeout = 86400u64;
    let escrow_id = client.create_escrow(&buyer, &listing_id, &timeout);

    // First delivery confirmation succeeds
    client.confirm_delivery(&buyer, &escrow_id);
    // Second delivery confirmation should fail - double release prevented
    client.confirm_delivery(&buyer, &escrow_id);
}

#[test]
#[should_panic(expected = "Escrow is not in funded state")]
fn test_escrow_double_refund_prevented() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);

    let credential_id = 1u64;
    let price = 1000u64;
    let listing_id = client.list_credential(&seller, &credential_id, &price, &200);

    let timeout = 3600u64;
    let escrow_id = client.create_escrow(&buyer, &listing_id, &timeout);

    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000 + 3601;
    env.ledger().set(ledger_info);

    // First refund succeeds
    client.claim_timeout_refund(&escrow_id);
    // Second refund should fail
    client.claim_timeout_refund(&escrow_id);
}

#[test]
#[should_panic(expected = "Only the buyer can confirm delivery")]
fn test_escrow_unauthorized_confirm_delivery() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let attacker = Address::generate(&env);

    client.initialize(&admin);

    let credential_id = 1u64;
    let price = 1000u64;
    let listing_id = client.list_credential(&seller, &credential_id, &price, &200);

    let timeout = 86400u64;
    let escrow_id = client.create_escrow(&buyer, &listing_id, &timeout);

    // Someone other than the buyer tries to confirm delivery
    client.confirm_delivery(&attacker, &escrow_id);
}

#[test]
fn test_escrow_escalate_to_dispute_by_buyer() {
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
    let listing_id = client.list_credential(&seller, &credential_id, &price, &200);

    let timeout = 86400u64;
    let escrow_id = client.create_escrow(&buyer, &listing_id, &timeout);

    // Buyer escalates to dispute
    let reason = String::from_str(&env, "Credential hash mismatch");
    let dispute_id = client.escalate_escrow_to_dispute(&buyer, &escrow_id, &reason);
    assert_eq!(dispute_id, 1);

    // Verify escrow status is now Disputed
    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, 3); // Disputed
}

#[test]
fn test_escrow_escalate_to_dispute_by_seller() {
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
    let listing_id = client.list_credential(&seller, &credential_id, &price, &200);

    let timeout = 86400u64;
    let escrow_id = client.create_escrow(&buyer, &listing_id, &timeout);

    // Seller escalates to dispute
    let reason = String::from_str(&env, "Buyer unresponsive");
    let dispute_id = client.escalate_escrow_to_dispute(&seller, &escrow_id, &reason);
    assert_eq!(dispute_id, 1);

    // Verify escrow is now in Disputed state
    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, 3); // Disputed
}

#[test]
#[should_panic(expected = "Only escrow parties can escalate to dispute")]
fn test_escrow_escalate_by_outsider_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let outsider = Address::generate(&env);

    client.initialize(&admin);

    let credential_id = 1u64;
    let price = 1000u64;
    let listing_id = client.list_credential(&seller, &credential_id, &price, &200);

    let timeout = 86400u64;
    let escrow_id = client.create_escrow(&buyer, &listing_id, &timeout);

    // Outsider tries to escalate
    let reason = String::from_str(&env, "I want in");
    client.escalate_escrow_to_dispute(&outsider, &escrow_id, &reason);
}

#[test]
#[should_panic(expected = "Timeout must be greater than zero")]
fn test_escrow_zero_timeout_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let listing_id = client.list_credential(&seller, &1u64, &1000, &200);

    // Zero timeout should panic
    client.create_escrow(&buyer, &listing_id, &0);
}

#[test]
#[should_panic(expected = "Listing is inactive")]
fn test_escrow_on_inactive_listing_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let listing_id = client.list_credential(&seller, &1u64, &1000, &200);

    // First escrow consumes the listing
    client.create_escrow(&buyer, &listing_id, &86400);

    // Second escrow on same (now inactive) listing should fail
    let buyer2 = Address::generate(&env);
    client.create_escrow(&buyer2, &listing_id, &86400);
}

#[test]
fn test_escrow_refund_then_relist() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000;
    env.ledger().set(ledger_info);

    let credential_id = 1u64;
    let price = 1000u64;
    let listing_id = client.list_credential(&seller, &credential_id, &price, &200);

    let timeout = 3600u64;
    let escrow_id = client.create_escrow(&buyer, &listing_id, &timeout);

    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1000 + 3601;
    env.ledger().set(ledger_info);
    client.claim_timeout_refund(&escrow_id);

    // Verify listing is reactivated by creating a new escrow on it
    let buyer2 = Address::generate(&env);
    let escrow_id2 = client.create_escrow(&buyer2, &listing_id, &86400);
    assert_eq!(escrow_id2, 2);
}

#[test]
fn test_escrow_confirm_delivery_updates_trade_count() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let credential_id = 1u64;
    let listing_id = client.list_credential(&seller, &credential_id, &1000, &200);

    let escrow_id = client.create_escrow(&buyer, &listing_id, &86400);
    client.confirm_delivery(&buyer, &escrow_id);

    // Bonding curve should have incremented
    let price = client.calculate_bonding_price(&credential_id);
    assert_eq!(price, 110); // 100 + 10 * 1 * 1
}

// ── Escrow Dispute Resolution Tests ──

#[test]
fn test_escrow_dispute_resolve_in_favor_of_seller() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let credential_id = 1u64;
    let listing_id = client.list_credential(&seller, &credential_id, &1000, &200);

    let escrow_id = client.create_escrow(&buyer, &listing_id, &86400);

    // Buyer escalates to dispute
    let reason = String::from_str(&env, "Bad credential");
    let dispute_id = client.escalate_escrow_to_dispute(&buyer, &escrow_id, &reason);

    // Admin resolves in favor of seller (resolved = true)
    client.resolve_dispute(&admin, &dispute_id, &true);

    // Escrow should be Released
    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, 1); // Released
}

#[test]
fn test_escrow_dispute_resolve_in_favor_of_buyer() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let credential_id = 1u64;
    let listing_id = client.list_credential(&seller, &credential_id, &1000, &200);

    let escrow_id = client.create_escrow(&buyer, &listing_id, &86400);

    // Buyer escalates to dispute
    let reason = String::from_str(&env, "Never received credential");
    let dispute_id = client.escalate_escrow_to_dispute(&buyer, &escrow_id, &reason);

    // Admin resolves in favor of buyer (resolved = false)
    client.resolve_dispute(&admin, &dispute_id, &false);

    // Escrow should be Refunded
    let escrow = client.get_escrow(&escrow_id);
    assert_eq!(escrow.status, 2); // Refunded

    // Listing should be re-activated - verify by creating a new escrow on it
    let buyer2 = Address::generate(&env);
    let escrow_id2 = client.create_escrow(&buyer2, &listing_id, &86400);
    assert_eq!(escrow_id2, 2);
}

#[test]
fn test_escrow_dispute_resolve_releases_funds_and_updates_trade_count() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);

    client.initialize(&admin);

    let credential_id = 1u64;
    let listing_id = client.list_credential(&seller, &credential_id, &1000, &200);

    let escrow_id = client.create_escrow(&buyer, &listing_id, &86400);

    // Seller escalates
    let reason = String::from_str(&env, "Buyer not confirming");
    let dispute_id = client.escalate_escrow_to_dispute(&seller, &escrow_id, &reason);

    // Admin sides with seller
    client.resolve_dispute(&admin, &dispute_id, &true);

    // Trade count should have incremented (like a completed sale)
    let price = client.calculate_bonding_price(&credential_id);
    assert_eq!(price, 110); // 100 + 10 * 1 * 1
}

// ── Self-dealing prevention ──

#[test]
#[should_panic(expected = "Buyer cannot be the seller")]
fn test_escrow_self_dealing_prevented() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, MarketplaceContract);
    let client = MarketplaceContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let seller = Address::generate(&env);

    client.initialize(&admin);

    let listing_id = client.list_credential(&seller, &1u64, &1000, &200);

    // Seller tries to escrow their own listing
    client.create_escrow(&seller, &listing_id, &86400);
}
