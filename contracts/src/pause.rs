//! Emergency Pause/Unpause Module
//!
//! Provides circuit breaker functionality for all core contracts.
//! Admin can pause critical operations during security incidents.

use soroban_sdk::{symbol_short, Address, Env, String, Symbol};

const PAUSED: Symbol = symbol_short!("PAUSED");
const PAUSE_ADMIN: Symbol = symbol_short!("P_ADMIN");

/// Check if the contract is paused.
///
/// # Parameters
///
/// - `env` – Soroban execution environment.
///
/// # Returns
///
/// `true` if paused; `false` otherwise.
pub fn is_paused(env: &Env) -> bool {
    env.storage().instance().get(&PAUSED).unwrap_or(false)
}

/// Check if caller is the pause admin.
///
/// # Parameters
///
/// - `env` – Soroban execution environment.
/// - `caller` – The address to check.
///
/// # Returns
///
/// `true` if the address matches the pause admin; `false` otherwise.
pub fn is_pause_admin(env: &Env, caller: &Address) -> bool {
    env.storage()
        .instance()
        .get::<Symbol, Address>(&PAUSE_ADMIN)
        .map(|admin| &admin == caller)
        .unwrap_or(false)
}

/// Initialize the pause module with an admin.
///
/// # Parameters
///
/// - `env` – Soroban execution environment.
/// - `admin` – The address of the pause administrator.
pub fn init_pause(env: &Env, admin: Address) {
    env.storage().instance().set(&PAUSE_ADMIN, &admin);
    env.storage().instance().set(&PAUSED, &false);
}

/// Pause all contract operations (admin only).
///
/// # Parameters
///
/// - `env` – Soroban execution environment.
/// - `caller` – The address of the pause administrator; must sign.
///
/// # Returns
///
/// `Ok(())` on success, or `Err(String)` if validation fails.
pub fn pause(env: &Env, caller: Address) -> Result<(), String> {
    caller.require_auth();
    if !is_pause_admin(env, &caller) {
        return Err(String::from_str(env, "Only pause admin can pause"));
    }
    if is_paused(env) {
        return Err(String::from_str(env, "Contract is already paused"));
    }
    env.storage().instance().set(&PAUSED, &true);
    // Emit pause event
    env.events().publish(
        (symbol_short!("PAUSE"),),
        (caller, env.ledger().timestamp()),
    );
    Ok(())
}

/// Unpause contract operations (admin only).
///
/// # Parameters
///
/// - `env` – Soroban execution environment.
/// - `caller` – The address of the pause administrator; must sign.
///
/// # Returns
///
/// `Ok(())` on success, or `Err(String)` if validation fails.
pub fn unpause(env: &Env, caller: Address) -> Result<(), String> {
    caller.require_auth();
    if !is_pause_admin(env, &caller) {
        return Err(String::from_str(env, "Only pause admin can unpause"));
    }
    if !is_paused(env) {
        return Err(String::from_str(env, "Contract is not paused"));
    }
    env.storage().instance().set(&PAUSED, &false);
    // Emit unpause event
    env.events().publish(
        (symbol_short!("UNPAUSE"),),
        (caller, env.ledger().timestamp()),
    );
    Ok(())
}

/// Require the contract is not paused (call at start of state-changing functions).
///
/// # Parameters
///
/// - `env` – Soroban execution environment.
///
/// # Returns
///
/// `Ok(())` if the contract is active, or `Err(String)` if emergency mode is active.
pub fn require_not_paused(env: &Env) -> Result<(), String> {
    if is_paused(env) {
        return Err(String::from_str(
            env,
            "Contract is paused. Emergency mode active.",
        ));
    }
    Ok(())
}

/// Transfer pause admin to a new address.
///
/// # Parameters
///
/// - `env` – Soroban execution environment.
/// - `caller` – The current pause administrator address; must sign.
/// - `new_admin` – The new pause administrator address.
///
/// # Returns
///
/// `Ok(())` on success, or `Err(String)` if validation fails.
pub fn transfer_pause_admin(env: &Env, caller: Address, new_admin: Address) -> Result<(), String> {
    caller.require_auth();
    if !is_pause_admin(env, &caller) {
        return Err(String::from_str(env, "Only pause admin can transfer"));
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
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract = env.register_contract(None, crate::StarkEdContract);
        env.as_contract(&contract, || {
            init_pause(&env, admin.clone());
        });
        assert!(!env.as_contract(&contract, || is_paused(&env)));
        env.as_contract(&contract, || pause(&env, admin.clone()).unwrap());
        assert!(env.as_contract(&contract, || is_paused(&env)));
        env.as_contract(&contract, || unpause(&env, admin.clone()).unwrap());
        assert!(!env.as_contract(&contract, || is_paused(&env)));
    }

    #[test]
    fn test_require_not_paused() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract = env.register_contract(None, crate::StarkEdContract);
        env.as_contract(&contract, || {
            init_pause(&env, admin.clone());
        });
        assert!(env
            .as_contract(&contract, || require_not_paused(&env))
            .is_ok());
        env.as_contract(&contract, || pause(&env, admin).unwrap());
        assert!(env
            .as_contract(&contract, || require_not_paused(&env))
            .is_err());
    }

    #[test]
    fn test_non_admin_cannot_pause() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let attacker = Address::generate(&env);
        let contract = env.register_contract(None, crate::StarkEdContract);
        env.as_contract(&contract, || {
            init_pause(&env, admin);
        });
        let result = env.as_contract(&contract, || pause(&env, attacker));
        assert!(result.is_err());
        assert!(!env.as_contract(&contract, || is_paused(&env)));
    }

    #[test]
    fn test_transfer_admin() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let new_admin = Address::generate(&env);
        let contract = env.register_contract(None, crate::StarkEdContract);
        env.as_contract(&contract, || {
            init_pause(&env, admin.clone());
        });
        env.as_contract(&contract, || {
            transfer_pause_admin(&env, admin, new_admin.clone()).unwrap()
        });
        assert!(env.as_contract(&contract, || is_pause_admin(&env, &new_admin)));
    }
}
