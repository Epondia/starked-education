use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Vec};

const BPS_DENOMINATOR: u128 = 10_000;
const DEFAULT_BASE_FEE: u64 = 1_000;
const DEFAULT_MAX_FEE: u64 = 1_000_000_000;
const MAX_FEE_RATE_BPS: u32 = 10_000;
const MIN_SURGE_MULTIPLIER_BPS: u32 = 10_000;
const MAX_SURGE_MULTIPLIER_BPS: u32 = 100_000;
const MAX_SCHEDULE_TIERS: u32 = 32;
const MAX_SURGE_TIERS: u32 = 16;

/// A fee rate selected when the transaction value reaches `min_transaction_value`.
///
/// Tiers must be sorted by `min_transaction_value`, start at zero, and use strictly
/// increasing thresholds. Rates are expressed in basis points (100 bps = 1%).
#[contracttype]
#[derive(Clone)]
pub struct FeeTier {
    pub min_transaction_value: u64,
    pub fee_rate_bps: u32,
}

/// A surge multiplier selected when the network reaches `min_transactions_per_block`.
///
/// Multipliers are expressed in basis points (10,000 bps = 1x). Surge tiers cannot
/// discount the fee; the minimum multiplier is therefore 1x.
#[contracttype]
#[derive(Clone)]
pub struct SurgeTier {
    pub min_transactions_per_block: u64,
    pub multiplier_bps: u32,
}

/// Complete fee policy persisted by the contract.
#[contracttype]
#[derive(Clone)]
pub struct FeeSchedule {
    pub base_fee: u64,
    pub max_fee: u64,
    pub tiers: Vec<FeeTier>,
    pub surge_tiers: Vec<SurgeTier>,
}

/// Result of a fee quote, including the selected tier and surge multiplier.
#[contracttype]
#[derive(Clone)]
pub struct FeeCalculation {
    pub transaction_value: u64,
    pub base_fee: u64,
    pub tier_fee: u64,
    pub tier_index: u32,
    pub surge_multiplier_bps: u32,
    pub final_fee: u64,
    pub calculation_timestamp: u64,
}

#[contracttype]
pub enum FeeKey {
    Admin,
    Schedule,
}

#[contract]
pub struct DynamicFeeContract;

#[contractimpl]
impl DynamicFeeContract {
    /// Initialize the fee contract with a safe default schedule.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&FeeKey::Admin) {
            panic!("Fee system already initialized");
        }

        admin.require_auth();
        let schedule = Self::default_schedule(&env);
        Self::validate_schedule(&schedule);

        env.storage().instance().set(&FeeKey::Admin, &admin);
        env.storage().instance().set(&FeeKey::Schedule, &schedule);
    }

    /// Return the address authorized to update the fee policy.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&FeeKey::Admin)
            .unwrap_or_else(|| panic!("Fee system not initialized"))
    }

    /// Return the currently active fee schedule.
    pub fn get_fee_schedule(env: Env) -> FeeSchedule {
        env.storage()
            .instance()
            .get(&FeeKey::Schedule)
            .unwrap_or_else(|| panic!("Fee system not initialized"))
    }

    /// Replace the fee schedule. Only the configured admin may do so.
    pub fn set_fee_schedule(env: Env, admin: Address, schedule: FeeSchedule) {
        admin.require_auth();
        Self::check_admin(&env, &admin);
        Self::validate_schedule(&schedule);

        env.storage().instance().set(&FeeKey::Schedule, &schedule);
        env.events().publish(
            (symbol_short!("fees"), symbol_short!("updated")),
            schedule,
        );
    }

    /// Calculate a fee using the configured value tier and congestion surge tier.
    ///
    /// `transactions_per_block` is an explicit demand snapshot. The contract does
    /// not depend on an external oracle; callers can use an application-controlled
    /// snapshot or a future trusted updater without changing the schedule itself.
    pub fn calculate_fee(
        env: Env,
        transaction_value: u64,
        transactions_per_block: u64,
    ) -> FeeCalculation {
        let schedule = Self::get_fee_schedule(env.clone());
        let (tier_index, tier) = Self::select_fee_tier(&schedule.tiers, transaction_value);
        let (_, surge_tier) = Self::select_surge_tier(
            &schedule.surge_tiers,
            transactions_per_block,
        );

        // Perform all arithmetic in u128, then apply the explicit max-fee cap before
        // converting back to u64. This prevents tier-boundary and u64 overflow bugs.
        let variable_fee = (transaction_value as u128)
            .checked_mul(tier.fee_rate_bps as u128)
            .unwrap_or_else(|| panic!("Fee calculation overflow"))
            / BPS_DENOMINATOR;
        let subtotal = (schedule.base_fee as u128)
            .checked_add(variable_fee)
            .unwrap_or_else(|| panic!("Fee calculation overflow"));
        let surged_fee = subtotal
            .checked_mul(surge_tier.multiplier_bps as u128)
            .unwrap_or_else(|| panic!("Surge calculation overflow"))
            / BPS_DENOMINATOR;
        let final_fee = surged_fee.min(schedule.max_fee as u128) as u64;

        FeeCalculation {
            transaction_value,
            base_fee: schedule.base_fee,
            tier_fee: variable_fee.min(u64::MAX as u128) as u64,
            tier_index,
            surge_multiplier_bps: surge_tier.multiplier_bps,
            final_fee,
            calculation_timestamp: env.ledger().timestamp(),
        }
    }

    /// Return the fee tier selected for a transaction value.
    pub fn get_fee_tier(env: Env, transaction_value: u64) -> FeeTier {
        let schedule = Self::get_fee_schedule(env);
        let (_, tier) = Self::select_fee_tier(&schedule.tiers, transaction_value);
        tier
    }

    /// Return the surge tier selected for the supplied congestion snapshot.
    pub fn get_surge_tier(env: Env, transactions_per_block: u64) -> SurgeTier {
        let schedule = Self::get_fee_schedule(env);
        let (_, tier) = Self::select_surge_tier(&schedule.surge_tiers, transactions_per_block);
        tier
    }

    fn check_admin(env: &Env, caller: &Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&FeeKey::Admin)
            .unwrap_or_else(|| panic!("Fee system not initialized"));
        if *caller != admin {
            panic!("Only admin can update fee schedule");
        }
    }

    fn default_schedule(env: &Env) -> FeeSchedule {
        FeeSchedule {
            base_fee: DEFAULT_BASE_FEE,
            max_fee: DEFAULT_MAX_FEE,
            tiers: Vec::from_array(
                env,
                [
                    FeeTier {
                        min_transaction_value: 0,
                        fee_rate_bps: 100,
                    },
                    FeeTier {
                        min_transaction_value: 10_000,
                        fee_rate_bps: 75,
                    },
                    FeeTier {
                        min_transaction_value: 100_000,
                        fee_rate_bps: 50,
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
                        multiplier_bps: 12_500,
                    },
                    SurgeTier {
                        min_transactions_per_block: 500,
                        multiplier_bps: 20_000,
                    },
                ],
            ),
        }
    }

    fn validate_schedule(schedule: &FeeSchedule) {
        if schedule.max_fee < schedule.base_fee {
            panic!("Maximum fee cannot be below base fee");
        }
        if schedule.tiers.len() == 0 || schedule.tiers.len() as u32 > MAX_SCHEDULE_TIERS {
            panic!("Fee schedule must contain between 1 and 32 tiers");
        }
        if schedule.surge_tiers.len() == 0
            || schedule.surge_tiers.len() as u32 > MAX_SURGE_TIERS
        {
            panic!("Surge schedule must contain between 1 and 16 tiers");
        }

        let first_tier = schedule.tiers.get(0).unwrap();
        if first_tier.min_transaction_value != 0 {
            panic!("First fee tier must start at zero");
        }
        if first_tier.fee_rate_bps > MAX_FEE_RATE_BPS {
            panic!("Fee rate cannot exceed 100 percent");
        }

        let mut previous_value = first_tier.min_transaction_value;
        for tier in schedule.tiers.iter().skip(1) {
            if tier.min_transaction_value <= previous_value {
                panic!("Fee tier thresholds must be strictly increasing");
            }
            if tier.fee_rate_bps > MAX_FEE_RATE_BPS {
                panic!("Fee rate cannot exceed 100 percent");
            }
            previous_value = tier.min_transaction_value;
        }

        let first_surge = schedule.surge_tiers.get(0).unwrap();
        if first_surge.min_transactions_per_block != 0 {
            panic!("First surge tier must start at zero");
        }
        if first_surge.multiplier_bps < MIN_SURGE_MULTIPLIER_BPS
            || first_surge.multiplier_bps > MAX_SURGE_MULTIPLIER_BPS
        {
            panic!("Surge multiplier is outside the permitted range");
        }

        let mut previous_load = first_surge.min_transactions_per_block;
        let mut previous_multiplier = first_surge.multiplier_bps;
        for tier in schedule.surge_tiers.iter().skip(1) {
            if tier.min_transactions_per_block <= previous_load {
                panic!("Surge thresholds must be strictly increasing");
            }
            if tier.multiplier_bps < MIN_SURGE_MULTIPLIER_BPS
                || tier.multiplier_bps > MAX_SURGE_MULTIPLIER_BPS
            {
                panic!("Surge multiplier is outside the permitted range");
            }
            if tier.multiplier_bps < previous_multiplier {
                panic!("Surge multipliers must be non-decreasing");
            }
            previous_load = tier.min_transactions_per_block;
            previous_multiplier = tier.multiplier_bps;
        }
    }

    fn select_fee_tier(tiers: &Vec<FeeTier>, transaction_value: u64) -> (u32, FeeTier) {
        let mut selected_index = 0u32;
        let mut selected = tiers.get(0).unwrap();
        for (index, tier) in tiers.iter().enumerate() {
            if transaction_value < tier.min_transaction_value {
                break;
            }
            selected_index = index as u32;
            selected = tier;
        }
        (selected_index, selected)
    }

    fn select_surge_tier(
        tiers: &Vec<SurgeTier>,
        transactions_per_block: u64,
    ) -> (u32, SurgeTier) {
        let mut selected_index = 0u32;
        let mut selected = tiers.get(0).unwrap();
        for (index, tier) in tiers.iter().enumerate() {
            if transactions_per_block < tier.min_transactions_per_block {
                break;
            }
            selected_index = index as u32;
            selected = tier;
        }
        (selected_index, selected)
    }
}
