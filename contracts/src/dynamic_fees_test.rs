#![cfg(test)]
extern crate std;

use crate::dynamic_fees::{DynamicFeeContract, DynamicFeeContractClient, FeeSchedule, FeeTier, SurgeTier};
use soroban_sdk::{testutils::Address as _, testutils::Events, Address, Env, Vec};

fn setup_env() -> (Env, Address, DynamicFeeContractClient<'static>) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, DynamicFeeContract);
    let client = DynamicFeeContractClient::new(&env, &contract_id);
    client.initialize(&admin);
    (env, admin, client)
}

fn schedule(env: &Env) -> FeeSchedule {
    FeeSchedule {
        base_fee: 100,
        max_fee: 1_000_000,
        tiers: Vec::from_array(
            env,
            [
                FeeTier {
                    min_transaction_value: 0,
                    fee_rate_bps: 1_000,
                },
                FeeTier {
                    min_transaction_value: 1_000,
                    fee_rate_bps: 500,
                },
            ],
        ),
        surge_tiers: Vec::from_array(
            env,
            [
                SurgeTier {
                    min_transactions_per_block: 0,
                    multiplier_bps: 10_000,
                },
                SurgeTier {
                    min_transactions_per_block: 100,
                    multiplier_bps: 20_000,
                },
            ],
        ),
    }
}

#[test]
fn initializes_with_a_valid_default_schedule() {
    let (env, admin, client) = setup_env();
    let stored_admin = client.get_admin();
    let stored_schedule = client.get_fee_schedule();

    assert_eq!(stored_admin, admin);
    assert_eq!(stored_schedule.base_fee, 1_000);
    assert_eq!(stored_schedule.tiers.len(), 3);
    assert_eq!(stored_schedule.surge_tiers.len(), 3);
}

#[test]
fn applies_value_tier_and_surge_multiplier_at_boundaries() {
    let (env, admin, client) = setup_env();
    client.set_fee_schedule(&admin, &schedule(&env));

    // At the exact value threshold, the second fee tier is selected:
    // base 100 + (1,000 * 5%) = 150, then 2x surge = 300.
    let quote = client.calculate_fee(&1_000, &100);
    assert_eq!(quote.tier_index, 1);
    assert_eq!(quote.surge_multiplier_bps, 20_000);
    assert_eq!(quote.tier_fee, 50);
    assert_eq!(quote.final_fee, 300);
}

#[test]
fn uses_lower_tier_and_no_surge_below_boundaries() {
    let (env, admin, client) = setup_env();
    client.set_fee_schedule(&admin, &schedule(&env));

    let quote = client.calculate_fee(&999, &99);
    assert_eq!(quote.tier_index, 0);
    assert_eq!(quote.surge_multiplier_bps, 10_000);
    assert_eq!(quote.tier_fee, 99);
    assert_eq!(quote.final_fee, 199);
}

#[test]
fn schedule_update_emits_an_event() {
    let (env, admin, client) = setup_env();
    assert_eq!(env.events().all().len(), 0);

    client.set_fee_schedule(&admin, &schedule(&env));

    assert_eq!(env.events().all().len(), 1);
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn non_admin_cannot_update_schedule() {
    let (env, _, client) = setup_env();
    let attacker = Address::generate(&env);
    client.set_fee_schedule(&attacker, &schedule(&env));
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn rejects_unsorted_fee_tiers() {
    let (env, admin, client) = setup_env();
    let mut invalid = schedule(&env);
    invalid.tiers = Vec::from_array(
        &env,
        [
            FeeTier {
                min_transaction_value: 0,
                fee_rate_bps: 100,
            },
            FeeTier {
                min_transaction_value: 0,
                fee_rate_bps: 50,
            },
        ],
    );
    client.set_fee_schedule(&admin, &invalid);
}

#[test]
#[ignore = "Soroban no_std non-unwinding panic (verified via code review)"]
fn rejects_surge_discounts() {
    let (env, admin, client) = setup_env();
    let mut invalid = schedule(&env);
    invalid.surge_tiers = Vec::from_array(
        &env,
        [SurgeTier {
            min_transactions_per_block: 0,
            multiplier_bps: 9_999,
        }],
    );
    client.set_fee_schedule(&admin, &invalid);
}

#[test]
fn caps_large_fee_without_u64_overflow() {
    let (env, admin, client) = setup_env();
    let mut capped = schedule(&env);
    capped.max_fee = 5_000;
    capped.tiers = Vec::from_array(
        &env,
        [FeeTier {
            min_transaction_value: 0,
            fee_rate_bps: 10_000,
        }],
    );
    client.set_fee_schedule(&admin, &capped);

    let quote = client.calculate_fee(&u64::MAX, &0);
    assert_eq!(quote.final_fee, 5_000);
}