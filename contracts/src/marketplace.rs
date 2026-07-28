#![no_std]
use crate::utils::storage::{PackedTimestamps, StorageKey, StorageUtils};
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec, U256,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum MarketplaceKey {
    Listing(u64),
    Rental(u64, Address),
    Stake(u64, Address),
    Dispute(u64),
    Escrow(u64),
    MarketplaceCount,
    ListingCount,
    DisputeCount,
    EscrowCount,
    TradeCount(u64), // Trade count per credential for bonding curve
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Listing {
    pub credential_id: u64,
    pub seller: Address,
    pub price: u64,
    pub royalty_bps: u32, // Basis points (100 = 1%)
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Rental {
    pub credential_id: u64,
    pub tenant: Address,
    pub expiry: u64,
    pub price: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stake {
    pub credential_id: u64,
    pub staker: Address,
    pub amount: u64,
    pub start_time: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Dispute {
    pub id: u64,
    pub listing_id: u64,
    pub initiator: Address,
    pub reason: String,
    pub status: u32, // 0: Open, 1: Resolved, 2: Cancelled
    pub escrow_id: u64, // 0 if not linked to an escrow
}

/// Escrow status: 0=Funded, 1=Released, 2=Refunded, 3=Disputed
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub id: u64,
    pub listing_id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub amount: u64,
    pub status: u32, // 0=Funded, 1=Released, 2=Refunded, 3=Disputed
    pub timeout: u64,
    pub created_at: u64,
}

#[contract]
pub struct MarketplaceContract;

#[contractimpl]
impl MarketplaceContract {
    /// Initialize the marketplace
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&StorageKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&StorageKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&MarketplaceKey::ListingCount, &0u64);
        env.storage()
            .instance()
            .set(&MarketplaceKey::DisputeCount, &0u64);
        env.storage()
            .instance()
            .set(&MarketplaceKey::EscrowCount, &0u64);
    }

    /// List a credential for sale with royalties
    pub fn list_credential(
        env: Env,
        seller: Address,
        credential_id: u64,
        price: u64,
        royalty_bps: u32,
    ) -> u64 {
        seller.require_auth();

        // Ensure royalty is reasonable (max 30%)
        if royalty_bps > 3000 {
            panic!("Royalty too high");
        }

        let listing_id = env
            .storage()
            .instance()
            .get(&MarketplaceKey::ListingCount)
            .unwrap_or(0u64)
            + 1;

        let listing = Listing {
            credential_id,
            seller: seller.clone(),
            price,
            royalty_bps,
            active: true,
        };

        env.storage()
            .instance()
            .set(&MarketplaceKey::Listing(listing_id), &listing);
        env.storage()
            .instance()
            .set(&MarketplaceKey::ListingCount, &listing_id);

        env.events().publish(
            (symbol_short!("market"), symbol_short!("created")),
            (listing_id, credential_id, seller, price),
        );

        listing_id
    }

    /// Purchase a listed credential
    pub fn purchase_credential(env: Env, buyer: Address, listing_id: u64) {
        buyer.require_auth();

        let mut listing: Listing = env
            .storage()
            .instance()
            .get(&MarketplaceKey::Listing(listing_id))
            .unwrap_or_else(|| panic!("Listing not found"));

        if !listing.active {
            panic!("Listing is inactive");
        }

        // Logic for transferring tokens should go here (using a token contract)
        // For this implementation, we focus on state changes and royalty math

        let royalty_amount = (listing.price as u128 * listing.royalty_bps as u128 / 10000) as u64;
        let seller_amount = listing.price - royalty_amount;

        // Mark listing as sold
        listing.active = false;
        env.storage()
            .instance()
            .set(&MarketplaceKey::Listing(listing_id), &listing);

        // Update trade count for bonding curve price discovery
        let trade_count: u64 = env
            .storage()
            .instance()
            .get(&MarketplaceKey::TradeCount(listing.credential_id))
            .unwrap_or(0);
        env.storage().instance().set(
            &MarketplaceKey::TradeCount(listing.credential_id),
            &(trade_count + 1),
        );

        env.events().publish(
            (symbol_short!("market"), symbol_short!("sold")),
            (listing_id, buyer, seller_amount, royalty_amount),
        );
    }

    /// Licensing: Rent a credential for a specific duration
    pub fn rent_credential(env: Env, tenant: Address, credential_id: u64, duration: u64) {
        tenant.require_auth();

        let price = Self::calculate_bonding_price(env.clone(), credential_id);
        let expiry = env.ledger().timestamp() + duration;

        let rental = Rental {
            credential_id,
            tenant: tenant.clone(),
            expiry,
            price,
        };

        env.storage().instance().set(
            &MarketplaceKey::Rental(credential_id, tenant.clone()),
            &rental,
        );

        env.events().publish(
            (symbol_short!("market"), symbol_short!("rented")),
            (credential_id, tenant, expiry, price),
        );
    }

    /// Bonding curve logic for price discovery
    /// Price = BasePrice + (Slope * Trades^2)
    pub fn calculate_bonding_price(env: Env, credential_id: u64) -> u64 {
        let base_price = 100u64; // Minimum price
        let slope = 10u64;

        let trades: u64 = env
            .storage()
            .instance()
            .get(&MarketplaceKey::TradeCount(credential_id))
            .unwrap_or(0);

        base_price + slope * trades * trades
    }

    /// Staking: Stake a credential for verification rewards
    pub fn stake_credential(env: Env, staker: Address, credential_id: u64, amount: u64) {
        staker.require_auth();

        let stake = Stake {
            credential_id,
            staker: staker.clone(),
            amount,
            start_time: env.ledger().timestamp(),
        };

        env.storage().instance().set(
            &MarketplaceKey::Stake(credential_id, staker.clone()),
            &stake,
        );

        env.events().publish(
            (symbol_short!("market"), symbol_short!("staked")),
            (credential_id, staker, amount),
        );
    }

    /// Claim staking rewards based on reputation
    pub fn claim_rewards(env: Env, staker: Address, credential_id: u64) -> u64 {
        staker.require_auth();

        let stake: Stake = env
            .storage()
            .instance()
            .get(&MarketplaceKey::Stake(credential_id, staker.clone()))
            .unwrap_or_else(|| panic!("No stake found"));

        let now = env.ledger().timestamp();
        let duration = now - stake.start_time;

        // Reward = Amount * Duration * RewardRate
        // Basic reward rate: 1% per day (86400 seconds)
        let base_reward = (stake.amount as u128 * duration as u128 / 8640000) as u64;

        // Reputation bonus (hypothetical integration)
        // In a real system, we'd call the UserProfileContract
        let reputation_bonus = 100; // placeholder for +10% bonus
        let total_reward = base_reward + (base_reward * reputation_bonus / 1000);

        // Reset stake time
        let mut new_stake = stake;
        new_stake.start_time = now;
        env.storage().instance().set(
            &MarketplaceKey::Stake(credential_id, staker.clone()),
            &new_stake,
        );

        env.events().publish(
            (symbol_short!("market"), symbol_short!("claim_rwd")),
            (staker, total_reward),
        );

        total_reward
    }

    /// Automated Dispute Resolution: Open a dispute
    pub fn open_dispute(env: Env, initiator: Address, listing_id: u64, reason: String) -> u64 {
        initiator.require_auth();

        let dispute_id = env
            .storage()
            .instance()
            .get(&MarketplaceKey::DisputeCount)
            .unwrap_or(0u64)
            + 1;

        let dispute = Dispute {
            id: dispute_id,
            listing_id,
            initiator: initiator.clone(),
            reason,
            status: 0, // Open
            escrow_id: 0, // Not linked to escrow by default
        };

        env.storage()
            .instance()
            .set(&MarketplaceKey::Dispute(dispute_id), &dispute);
        env.storage()
            .instance()
            .set(&MarketplaceKey::DisputeCount, &dispute_id);

        env.events().publish(
            (symbol_short!("market"), symbol_short!("d_open")),
            (dispute_id, listing_id, initiator),
        );

        dispute_id
    }

    /// Resolve a dispute (Admin only).
    /// For escrow-linked disputes, also resolves the escrow (release if resolved,
    /// refund if cancelled). Uses checks-effects pattern: reads first, writes last.
    pub fn resolve_dispute(env: Env, admin: Address, dispute_id: u64, resolved: bool) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&StorageKey::Admin)
            .unwrap_or_else(|| panic!("Admin not set"));

        if admin != stored_admin {
            panic!("Unauthorized");
        }

        // ── CHECKS: read everything before any writes ──
        let mut dispute: Dispute = env
            .storage()
            .instance()
            .get(&MarketplaceKey::Dispute(dispute_id))
            .unwrap_or_else(|| panic!("Dispute not found"));

        let escrow_opt: Option<Escrow> = if dispute.escrow_id > 0 {
            let escrow: Escrow = env
                .storage()
                .instance()
                .get(&MarketplaceKey::Escrow(dispute.escrow_id))
                .unwrap_or_else(|| panic!("Linked escrow not found"));
            Some(escrow)
        } else {
            None
        };

        // ── EFFECTS: perform all writes ──
        let new_status = if resolved { 1 } else { 2 };

        if let Some(mut escrow) = escrow_opt {
            if escrow.status == 3 {
                if resolved {
                    // Seller wins → release funds
                    escrow.status = 1;
                    env.storage()
                        .instance()
                        .set(&MarketplaceKey::Escrow(escrow.id), &escrow);
                    let cred_id = Self::lookup_credential_id(&env, escrow.listing_id);
                    Self::increment_trade_count(&env, cred_id);
                    env.events().publish(
                        (symbol_short!("market"), symbol_short!("escr_rel")),
                        (escrow.id, escrow.listing_id, escrow.seller, escrow.amount),
                    );
                } else {
                    // Buyer wins → refund and re-list
                    escrow.status = 2;
                    env.storage()
                        .instance()
                        .set(&MarketplaceKey::Escrow(escrow.id), &escrow);
                    Self::reactivate_listing(&env, escrow.listing_id);
                    env.events().publish(
                        (symbol_short!("market"), symbol_short!("escr_ref")),
                        (escrow.id, escrow.listing_id, escrow.buyer, escrow.amount),
                    );
                }
            }
        }

        // Write dispute status last (true checks-effects)
        dispute.status = new_status;
        env.storage()
            .instance()
            .set(&MarketplaceKey::Dispute(dispute_id), &dispute);

        env.events().publish(
            (symbol_short!("market"), symbol_short!("d_resolve")),
            (dispute_id, dispute.status),
        );
    }

    // ── Escrow System ──

    /// Create an escrow for a listing. Buyer funds held until delivery confirmed.
    /// The listing is marked inactive (pending) and the escrow is created in Funded state.
    pub fn create_escrow(
        env: Env,
        buyer: Address,
        listing_id: u64,
        timeout: u64,
    ) -> u64 {
        buyer.require_auth();

        if timeout == 0 {
            panic!("Timeout must be greater than zero");
        }

        let mut listing: Listing = env
            .storage()
            .instance()
            .get(&MarketplaceKey::Listing(listing_id))
            .unwrap_or_else(|| panic!("Listing not found"));

        if !listing.active {
            panic!("Listing is inactive");
        }

        // Prevent self-dealing
        if buyer == listing.seller {
            panic!("Buyer cannot be the seller");
        }

        // Mark listing as pending (inactive)
        listing.active = false;
        env.storage()
            .instance()
            .set(&MarketplaceKey::Listing(listing_id), &listing);

        let escrow_id = env
            .storage()
            .instance()
            .get(&MarketplaceKey::EscrowCount)
            .unwrap_or(0u64)
            + 1;

        let now = env.ledger().timestamp();
        let escrow = Escrow {
            id: escrow_id,
            listing_id,
            buyer: buyer.clone(),
            seller: listing.seller.clone(),
            amount: listing.price,
            status: 0, // Funded
            timeout: now + timeout,
            created_at: now,
        };

        env.storage()
            .instance()
            .set(&MarketplaceKey::Escrow(escrow_id), &escrow);
        env.storage()
            .instance()
            .set(&MarketplaceKey::EscrowCount, &escrow_id);

        env.events().publish(
            (symbol_short!("market"), symbol_short!("escr_open")),
            (escrow_id, listing_id, buyer, listing.seller, listing.price),
        );

        escrow_id
    }

    /// Buyer confirms delivery: funds are released to the seller.
    /// Only the escrow buyer can call this.
    pub fn confirm_delivery(env: Env, buyer: Address, escrow_id: u64) {
        buyer.require_auth();

        let mut escrow: Escrow = env
            .storage()
            .instance()
            .get(&MarketplaceKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic!("Escrow not found"));

        // Only the buyer can confirm delivery
        if buyer != escrow.buyer {
            panic!("Only the buyer can confirm delivery");
        }

        // Must be in Funded state
        if escrow.status != 0 {
            panic!("Escrow is not in funded state");
        }

        escrow.status = 1; // Released
        env.storage()
            .instance()
            .set(&MarketplaceKey::Escrow(escrow_id), &escrow);

        let credential_id = Self::lookup_credential_id(&env, escrow.listing_id);
        Self::increment_trade_count(&env, credential_id);

        env.events().publish(
            (symbol_short!("market"), symbol_short!("escr_rel")),
            (escrow_id, escrow.listing_id, escrow.seller, escrow.amount),
        );
    }

    /// Claim a timeout refund for an escrow that has expired without delivery.
    /// Anyone can trigger this after the timeout has passed.
    pub fn claim_timeout_refund(env: Env, escrow_id: u64) {
        let mut escrow: Escrow = env
            .storage()
            .instance()
            .get(&MarketplaceKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic!("Escrow not found"));

        // Must be in Funded state
        if escrow.status != 0 {
            panic!("Escrow is not in funded state");
        }

        let now = env.ledger().timestamp();
        if now < escrow.timeout {
            panic!("Timeout has not yet expired");
        }

        escrow.status = 2; // Refunded
        env.storage()
            .instance()
            .set(&MarketplaceKey::Escrow(escrow_id), &escrow);

        // Re-activate the listing so it can be sold again
        Self::reactivate_listing(&env, escrow.listing_id);

        env.events().publish(
            (symbol_short!("market"), symbol_short!("escr_ref")),
            (escrow_id, escrow.listing_id, escrow.buyer, escrow.amount),
        );
    }

    /// Query escrow state. Readable by both parties and any observer.
    pub fn get_escrow(env: Env, escrow_id: u64) -> Escrow {
        env.storage()
            .instance()
            .get(&MarketplaceKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic!("Escrow not found"))
    }

    /// Escalate an active escrow to a dispute. Either buyer or seller can call.
    /// Links the escrow to the dispute system and marks the escrow as Disputed.
    pub fn escalate_escrow_to_dispute(
        env: Env,
        caller: Address,
        escrow_id: u64,
        reason: String,
    ) -> u64 {
        caller.require_auth();

        let mut escrow: Escrow = env
            .storage()
            .instance()
            .get(&MarketplaceKey::Escrow(escrow_id))
            .unwrap_or_else(|| panic!("Escrow not found"));

        // Only buyer or seller can escalate
        if caller != escrow.buyer && caller != escrow.seller {
            panic!("Only escrow parties can escalate to dispute");
        }

        // Must be in Funded state
        if escrow.status != 0 {
            panic!("Escrow is not in funded state");
        }

        let dispute_id = env
            .storage()
            .instance()
            .get(&MarketplaceKey::DisputeCount)
            .unwrap_or(0u64)
            + 1;

        let dispute = Dispute {
            id: dispute_id,
            listing_id: escrow.listing_id,
            initiator: caller.clone(),
            reason,
            status: 0, // Open
            escrow_id,
        };

        env.storage()
            .instance()
            .set(&MarketplaceKey::Dispute(dispute_id), &dispute);
        env.storage()
            .instance()
            .set(&MarketplaceKey::DisputeCount, &dispute_id);

        // Mark escrow as disputed
        escrow.status = 3; // Disputed
        env.storage()
            .instance()
            .set(&MarketplaceKey::Escrow(escrow_id), &escrow);

        env.events().publish(
            (symbol_short!("market"), symbol_short!("escr_disp")),
            (escrow_id, dispute_id, caller),
        );

        dispute_id
    }
}

// ── Private helpers (not exported in contract ABI) ──

impl MarketplaceContract {
    /// Increment the bonding curve trade count for a credential
    fn increment_trade_count(env: &Env, credential_id: u64) {
        let trade_count: u64 = env
            .storage()
            .instance()
            .get(&MarketplaceKey::TradeCount(credential_id))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&MarketplaceKey::TradeCount(credential_id), &(trade_count + 1));
    }

    /// Re-activate a listing (e.g., after refund or cancellation)
    fn reactivate_listing(env: &Env, listing_id: u64) {
        let mut listing: Listing = env
            .storage()
            .instance()
            .get(&MarketplaceKey::Listing(listing_id))
            .unwrap_or_else(|| panic!("Listing not found"));
        listing.active = true;
        env.storage()
            .instance()
            .set(&MarketplaceKey::Listing(listing_id), &listing);
    }

    /// Look up the credential ID for a given listing
    fn lookup_credential_id(env: &Env, listing_id: u64) -> u64 {
        let listing: Listing = env
            .storage()
            .instance()
            .get(&MarketplaceKey::Listing(listing_id))
            .unwrap_or_else(|| panic!("Listing not found"));
        listing.credential_id
    }
}
