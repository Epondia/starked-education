//! Emergency Pause/Unpause Module
//!
//! Provides circuit breaker functionality for all core contracts.
//! Admin can pause critical operations during security incidents.

use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol};

const PAUSED: Symbol = symbol_short!("PAUSED");
const PAUSE_ADMIN: Symbol = symbol_short!("P_ADMIN");

/// Check if the contract is paused
pub fn is_paused(env: &Env) -> bool {
    env.storage().instance().get(&PAUSED).unwrap_or(false)
}

/// Check if caller is the pause admin
pub fn is_pause_admin(env: &Env, caller: &Address) -> bool {
    env.storage()
        .instance()
        .get::<Symbol, Address>(&PAUSE_ADMIN)
        .map(|admin| &admin == caller)
        .unwrap_or(false)
}

/// Initialize the pause module with an admin
pub fn init_pause(env: &Env, admin: Address) {
    env.storage().instance().set(&PAUSE_ADMIN, &admin);
    env.storage().instance().set(&PAUSED, &false);
}

/// Pause all contract operations (admin only)
pub fn pause(env: &Env, caller: Address) -> Result<(), String> {
    caller.require_auth();
    if !is_pause_admin(env, &caller) {
        return Err("Only pause admin can pause".to_string());
    }
    if is_paused(env) {
        return Err("Contract is already paused".to_string());
    }
    env.storage().instance().set(&PAUSED, &true);
    // Emit pause event
    env.events().publish(
        (symbol_short!("PAUSE"),),
        (caller, env.ledger().timestamp()),
    );
    Ok(())
}

/// Unpause contract operations (admin only)
pub fn unpause(env: &Env, caller: Address) -> Result<(), String> {
    caller.require_auth();
    if !is_pause_admin(env, &caller) {
        return Err("Only pause admin can unpause".to_string());
    }
    if !is_paused(env) {
        return Err("Contract is not paused".to_string());
    }
    env.storage().instance().set(&PAUSED, &false);
    // Emit unpause event
    env.events().publish(
        (symbol_short!("UNPAUSE"),),
        (caller, env.ledger().timestamp()),
    );
    Ok(())
}

/// Require the contract is not paused (call at start of state-changing functions)
pub fn require_not_paused(env: &Env) -> Result<(), String> {
    if is_paused(env) {
        return Err("Contract is paused. Emergency mode active.".to_string());
    }
    Ok(())
}

/// Transfer pause admin to a new address
pub fn transfer_pause_admin(env: &Env, caller: Address, new_admin: Address) -> Result<(), String> {
    caller.require_auth();
    if !is_pause_admin(env, &caller) {
        return Err("Only pause admin can transfer".to_string());
    }
    env.storage().instance().set(&PAUSE_ADMIN, &new_admin);
    env.events().publish(
        (symbol_short!("PADM_XFER"),),
        (caller, new_admin, env.ledger().timestamp()),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_pause_unpause() {
        let env = Env::default();
        let admin = Address::generate(&env);
        init_pause(&env, admin.clone());

        assert!(!is_paused(&env));

        pause(&env, admin.clone()).unwrap();
        assert!(is_paused(&env));

        unpause(&env, admin.clone()).unwrap();
        assert!(!is_paused(&env));
    }

    #[test]
    fn test_require_not_paused() {
        let env = Env::default();
        let admin = Address::generate(&env);
        init_pause(&env, admin.clone());

        // Not paused - should pass
        assert!(require_not_paused(&env).is_ok());

        // Paused - should fail
        pause(&env, admin).unwrap();
        assert!(require_not_paused(&env).is_err());
    }

    #[test]
    fn test_non_admin_cannot_pause() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let attacker = Address::generate(&env);
        init_pause(&env, admin);

        let result = pause(&env, attacker);
        assert!(result.is_err());
        assert!(!is_paused(&env));
    }

    #[test]
    fn test_transfer_admin() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let new_admin = Address::generate(&env);
        init_pause(&env, admin.clone());

        transfer_pause_admin(&env, admin, new_admin.clone()).unwrap();
        assert!(is_pause_admin(&env, &new_admin));
    }
}
