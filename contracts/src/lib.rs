#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, String, Symbol, Vec};

pub mod governance;
#[cfg(test)]
pub mod governance_test;
pub mod tokenomics;
#[cfg(test)]
pub mod tokenomics_test;
pub mod user_profile;
#[cfg(test)]
pub mod user_profile_test;
pub mod marketplace;
#[cfg(test)]
pub mod marketplace_test;
pub mod upgrade;
#[cfg(test)]
pub mod upgrade_test;
pub mod utils;

/// Core storage keys
#[contracttype]
pub enum DataKey {
    Admin,
    Credential(u64),
    CredentialCount,
    CourseCount,
    Course(u64),
    AchievementCount,
    ContractVersion,
}

/// Credential with issuer/recipient data
#[contracttype]
#[derive(Clone)]
pub struct Credential {
    pub id: u64,
    pub issuer: Address,
    pub recipient: Address,
    pub title: String,
    pub course_id: String,
    pub ipfs_hash: String,
    pub timestamp: u64,
}

/// Course data
#[contracttype]
#[derive(Clone)]
pub struct Course {
    pub id: u64,
    pub title: String,
    pub description: String,
    pub price: u64,
}

/// User profile summary
#[contracttype]
#[derive(Clone)]
pub struct Profile {
    pub owner: Address,
    pub credential_count: u32,
    pub achievement_count: u32,
    pub reputation: u64,
}

#[contract]
pub struct StarkEdContract;

#[contractimpl]
impl StarkEdContract {
    /// Initialize the contract
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Contract already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::CredentialCount, &0u64);
        env.storage().instance().set(&DataKey::CourseCount, &0u64);
        env.storage()
            .instance()
            .set(&DataKey::AchievementCount, &0u64);
        env.storage()
            .instance()
            .set(&DataKey::ContractVersion, &1u32);
    }

    /// Issue a new credential
    pub fn issue_credential(
        env: Env,
        issuer: Address,
        recipient: Address,
        title: String,
        course_id: String,
        ipfs_hash: String,
    ) -> u64 {
        issuer.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("Not initialized"));
        if issuer != admin {
            panic!("Only admin can issue credentials");
        }
        let count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CredentialCount)
            .unwrap_or(0);
        let credential_id = count + 1;
        let credential = Credential {
            id: credential_id,
            issuer: issuer.clone(),
            recipient: recipient.clone(),
            title,
            course_id,
            ipfs_hash,
            timestamp: env.ledger().timestamp(),
        };
        env.storage()
            .instance()
            .set(&DataKey::Credential(credential_id), &credential);
        env.storage()
            .instance()
            .set(&DataKey::CredentialCount, &credential_id);
        credential_id
    }

    /// Get credential by ID
    pub fn get_credential(env: Env, credential_id: u64) -> Credential {
        env.storage()
            .instance()
            .get(&DataKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"))
    }

    /// Verify a credential (exists check)
    pub fn verify_credential(env: Env, credential_id: u64) -> bool {
        env.storage()
            .instance()
            .has(&DataKey::Credential(credential_id))
    }

    /// Batch verify multiple credentials in a single call
    /// Returns a Vec<bool> where each element corresponds to the
    /// verification result for the credential at that index.
    /// Reduces gas costs compared to individual verification calls.
    pub fn verify_credentials_batch(env: Env, credential_ids: Vec<u64>) -> Vec<bool> {
        let mut results = Vec::new(&env);
        for credential_id in credential_ids.iter() {
            let verified = env
                .storage()
                .instance()
                .has(&DataKey::Credential(credential_id));
            results.push_back(verified);
        }
        results
    }

    /// Create a course
    pub fn create_course(
        env: Env,
        instructor: Address,
        title: String,
        description: String,
        price: u64,
    ) -> u64 {
        instructor.require_auth();
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("Not initialized"));
        if instructor != admin {
            panic!("Only admin can create courses");
        }
        let course_count: u64 = env
            .storage()
            .instance()
            .get(&DataKey::CourseCount)
            .unwrap_or(0);
        let course_id = course_count + 1;
        let course = Course {
            id: course_id,
            title,
            description,
            price,
        };
        env.storage()
            .instance()
            .set(&DataKey::Course(course_id), &course);
        env.storage()
            .instance()
            .set(&DataKey::CourseCount, &course_id);
        course_id
    }

    /// Get course by ID
    pub fn get_course(env: Env, course_id: u64) -> Course {
        env.storage()
            .instance()
            .get(&DataKey::Course(course_id))
            .unwrap_or_else(|| panic!("Course not found"))
    }

    /// Get credential count
    pub fn get_credential_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::CredentialCount)
            .unwrap_or(0)
    }

    /// Get course count
    pub fn get_course_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::CourseCount)
            .unwrap_or(0)
    }

    /// Get admin address
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("Not initialized"))
    }

    /// Get the current contract version
    pub fn get_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::ContractVersion)
            .unwrap_or(1)
    }

    /// Upgrade the contract to a new WASM hash (admin only)
    ///
    /// Uses Soroban's native upgrade mechanism to replace the contract
    /// code while preserving all storage and the contract ID.
    /// Increments the version counter on successful upgrade.
    ///
    /// IMPORTANT: The code AFTER `update_current_contract_wasm()` runs in
    /// the NEW contract context. Future versions MUST preserve the version
    /// bump and event emission logic to ensure proper upgrade tracking.
    pub fn upgrade(env: Env, admin: Address, new_wasm_hash: BytesN<32>) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("Not initialized"));

        if admin != stored_admin {
            panic!("Only admin can upgrade the contract");
        }

        // Get current version before upgrade
        let current_version: u32 = env
            .storage()
            .instance()
            .get(&DataKey::ContractVersion)
            .unwrap_or(1);

        // Perform the upgrade via Soroban's native mechanism.
        // Everything after this call executes in the NEW contract code.
        env.deployer().update_current_contract_wasm(new_wasm_hash);

        // NOTE: The following code runs in the NEW WASM context.
        // Future contract versions MUST keep this logic intact.
        env.storage()
            .instance()
            .set(&DataKey::ContractVersion, &(current_version + 1));

        // Emit upgrade event
        env.events().publish(
            (Symbol::new(&env, "contract"), Symbol::new(&env, "upgraded")),
            (current_version, current_version + 1),
        );
    }
}
