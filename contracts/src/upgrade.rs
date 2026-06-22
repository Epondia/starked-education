// Upgrade authority module
use soroban_sdk::{Env, Address, Bytes, Symbol};
use crate::{DataKey, UpgradeEvent};

pub fn schedule_upgrade(env: Env, new_wasm_hash: Bytes, delay_seconds: u64) {
    // Admin authentication
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap_or_else(|| panic!("Not initialized"));
    admin.require_auth();
    let scheduled_at = env.ledger().timestamp() + delay_seconds;
    let event = UpgradeEvent { new_wasm_hash, scheduled_at };
    env.storage().instance().set(&DataKey::PendingUpgrade, &event);
    env.events().publish((Symbol::new(&env, "upgrade"), Symbol::new(&env, "scheduled")), event);
}

pub fn cancel_upgrade(env: Env) {
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap_or_else(|| panic!("Not initialized"));
    admin.require_auth();
    env.storage().instance().remove(&DataKey::PendingUpgrade);
    env.events().publish((Symbol::new(&env, "upgrade"), Symbol::new(&env, "cancelled")), ());
}

pub fn execute_upgrade(env: Env) {
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap_or_else(|| panic!("Not initialized"));
    admin.require_auth();
    let pending: UpgradeEvent = env.storage().instance().get(&DataKey::PendingUpgrade).unwrap_or_else(|| panic!("No pending upgrade"));
    let now = env.ledger().timestamp();
    if now < pending.scheduled_at {
        panic!("Timelock not elapsed");
    }
    env.deployer().update_current_contract_wasm(pending.new_wasm_hash);
    // Increment version
    let version: u32 = env.storage().instance().get(&DataKey::Version).unwrap_or(0);
    env.storage().instance().set(&DataKey::Version, &(version + 1));
    // Clear pending
    env.storage().instance().remove(&DataKey::PendingUpgrade);
    env.events().publish((Symbol::new(&env, "upgrade"), Symbol::new(&env, "executed")), ());
}

pub fn get_version(env: Env) -> u32 {
    env.storage().instance().get(&DataKey::Version).unwrap_or(0)
}

pub fn get_pending_upgrade(env: Env) -> Option<UpgradeEvent> {
    env.storage().instance().get(&DataKey::PendingUpgrade)
}
