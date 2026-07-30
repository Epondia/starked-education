//! Event Emission Module
//!
//! Standardized event emission for all state-changing operations.
//! Events are used for off-chain indexing and monitoring.

use soroban_sdk::{symbol_short, Address, Env, Symbol, String};

/// Event types emitted by the contract system
pub enum ContractEvent {
    /// Credential issued to a user
    CredentialIssued { user: Address, credential_id: Symbol, timestamp: u64 },
    /// Credential revoked
    CredentialRevoked { user: Address, credential_id: Symbol, timestamp: u64 },
    /// Credential transferred between users
    CredentialTransferred { from: Address, to: Address, credential_id: Symbol, timestamp: u64 },
    /// Course created
    CourseCreated { course_id: Symbol, instructor: Address, timestamp: u64 },
    /// Student enrolled in course
    CourseEnrolled { course_id: Symbol, student: Address, timestamp: u64 },
    /// Course completed
    CourseCompleted { course_id: Symbol, student: Address, timestamp: u64 },
    /// Achievement minted
    AchievementMinted { user: Address, achievement_id: Symbol, timestamp: u64 },
    /// Achievement burned
    AchievementBurned { user: Address, achievement_id: Symbol, timestamp: u64 },
    /// Contract paused
    ContractPaused { admin: Address, timestamp: u64 },
    /// Contract unpaused
    ContractUnpaused { admin: Address, timestamp: u64 },
}

/// Emit a credential issued event
pub fn emit_credential_issued(env: &Env, user: &Address, credential_id: &Symbol) {
    env.events().publish(
        (symbol_short!("CRED_ISS"),),
        (user, credential_id, env.ledger().timestamp()),
    );
}

/// Emit a credential revoked event
pub fn emit_credential_revoked(env: &Env, user: &Address, credential_id: &Symbol) {
    env.events().publish(
        (symbol_short!("CRED_REV"),),
        (user, credential_id, env.ledger().timestamp()),
    );
}

/// Emit a credential transferred event
pub fn emit_credential_transferred(env: &Env, from: &Address, to: &Address, credential_id: &Symbol) {
    env.events().publish(
        (symbol_short!("CRED_XFER"),),
        (from, to, credential_id, env.ledger().timestamp()),
    );
}

/// Emit a course created event
pub fn emit_course_created(env: &Env, course_id: &Symbol, instructor: &Address) {
    env.events().publish(
        (symbol_short!("COURSE_CRT"),),
        (course_id, instructor, env.ledger().timestamp()),
    );
}

/// Emit a course enrollment event
pub fn emit_course_enrolled(env: &Env, course_id: &Symbol, student: &Address) {
    env.events().publish(
        (symbol_short!("COURSE_ENR"),),
        (course_id, student, env.ledger().timestamp()),
    );
}

/// Emit a course completion event
pub fn emit_course_completed(env: &Env, course_id: &Symbol, student: &Address) {
    env.events().publish(
        (symbol_short!("COURSE_COMP"),),
        (course_id, student, env.ledger().timestamp()),
    );
}

/// Emit an achievement minted event
pub fn emit_achievement_minted(env: &Env, user: &Address, achievement_id: &Symbol) {
    env.events().publish(
        (symbol_short!("ACHIEVE_MNT"),),
        (user, achievement_id, env.ledger().timestamp()),
    );
}

/// Emit an achievement burned event
pub fn emit_achievement_burned(env: &Env, user: &Address, achievement_id: &Symbol) {
    env.events().publish(
        (symbol_short!("ACHIEVE_BRN"),),
        (user, achievement_id, env.ledger().timestamp()),
    );
}

/// Emit a contract paused event
pub fn emit_paused(env: &Env, admin: &Address) {
    env.events().publish(
        (symbol_short!("PAUSED"),),
        (admin, env.ledger().timestamp()),
    );
}

/// Emit a contract unpaused event
pub fn emit_unpaused(env: &Env, admin: &Address) {
    env.events().publish(
        (symbol_short!("UNPAUSED"),),
        (admin, env.ledger().timestamp()),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_emit_credential_issued() {
        let env = Env::default();
        let user = Address::generate(&env);
        let cred_id = symbol_short!("CRED1");
        // Should not panic
        emit_credential_issued(&env, &user, &cred_id);
    }

    #[test]
    fn test_emit_course_events() {
        let env = Env::default();
        let instructor = Address::generate(&env);
        let student = Address::generate(&env);
        let course_id = symbol_short!("COURSE1");

        emit_course_created(&env, &course_id, &instructor);
        emit_course_enrolled(&env, &course_id, &student);
        emit_course_completed(&env, &course_id, &student);
    }

    #[test]
    fn test_emit_achievement_events() {
        let env = Env::default();
        let user = Address::generate(&env);
        let achievement_id = symbol_short!("ACH1");

        emit_achievement_minted(&env, &user, &achievement_id);
        emit_achievement_burned(&env, &user, &achievement_id);
    }
}
