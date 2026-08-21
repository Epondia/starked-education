//! Event Emission Module
//!
//! Standardized event emission for all state-changing operations in the
//! StarkEd credential lifecycle. Events are the canonical source of truth
//! for off-chain indexers, dashboards, and monitoring.
//!
//! # Event Topics and Payloads
//!
//! Each event is identified by a two-symbol topic tuple. Indexers should
//! listen for these topics to observe credential state transitions.
//!
//! ## Credential Lifecycle Events
//!
//! | Topic                  | Emit Function              | Payload                                          |
//! |------------------------|----------------------------|--------------------------------------------------|
//! | `(credential,issued)`  | emit_credential_issued     | (credential_id: u64, issuer: Address)            |
//! | `(credential,renewed)` | emit_credential_renewed    | (credential_id: u64, renewer: Address, extension_seconds: u64) |
//! | `(credential,revoked)` | emit_credential_revoked    | (credential_id: u64, revoker: Address, reason_code: u64, timestamp: u64) |
//!
//! ## General Events
//!
//! | Topic                  | Emit Function              | Payload                                          |
//! |------------------------|----------------------------|--------------------------------------------------|
//! | `(credential,xfer)`    | emit_credential_transferred| (from: Address, to: Address, credential_id: u64, timestamp: u64) |
//! | `(course,created)`     | emit_course_created        | (course_id: u64, instructor: Address, timestamp: u64) |
//! | `(course,enrolled)`    | emit_course_enrolled       | (course_id: u64, student: Address, timestamp: u64) |
//! | `(course,completed)`   | emit_course_completed      | (course_id: u64, student: Address, timestamp: u64) |
//! | `(achievement,minted)` | emit_achievement_minted    | (user: Address, achievement_id: u64, timestamp: u64) |
//! | `(achievement,burned)` | emit_achievement_burned    | (user: Address, achievement_id: u64, timestamp: u64) |
//! | `(contract,paused)`    | emit_paused                | (admin: Address, timestamp: u64)                 |
//! | `(contract,unpaused)`  | emit_unpaused              | (admin: Address, timestamp: u64)                 |
//!
//! # Off-Chain Indexer Integration
//!
//! An off-chain indexer can consume these events by subscribing to Soroban
//! event streams filtered on the topic tuples above. For example, to track
//! all credential lifecycle changes, listen for:
//!
//! ```
//! [(credential, issued), (credential, renewed), (credential, revoked)]
//! ```

use soroban_sdk::{Address, Env, Symbol};

/// Event types emitted by the contract system
pub enum ContractEvent {
    /// Credential issued to a user
    CredentialIssued { user: Address, credential_id: u64, timestamp: u64 },
    /// Credential renewed (expiration extended)
    CredentialRenewed { user: Address, credential_id: u64, extension_seconds: u64, timestamp: u64 },
    /// Credential revoked
    CredentialRevoked { user: Address, credential_id: u64, timestamp: u64 },
    /// Credential transferred between users
    CredentialTransferred { from: Address, to: Address, credential_id: u64, timestamp: u64 },
    /// Course created
    CourseCreated { course_id: u64, instructor: Address, timestamp: u64 },
    /// Student enrolled in course
    CourseEnrolled { course_id: u64, student: Address, timestamp: u64 },
    /// Course completed
    CourseCompleted { course_id: u64, student: Address, timestamp: u64 },
    /// Achievement minted
    AchievementMinted { user: Address, achievement_id: u64, timestamp: u64 },
    /// Achievement burned
    AchievementBurned { user: Address, achievement_id: u64, timestamp: u64 },
    /// Contract paused
    ContractPaused { admin: Address, timestamp: u64 },
    /// Contract unpaused
    ContractUnpaused { admin: Address, timestamp: u64 },
}

// ─── Credential Lifecycle Events ──────────────────────────────────

/// Emit a credential issued event.
///
/// Topic: `(credential, issued)`
/// Payload: (credential_id, issuer)
pub fn emit_credential_issued(env: &Env, credential_id: u64, issuer: &Address) {
    env.events().publish(
        (
            Symbol::new(env, "credential"),
            Symbol::new(env, "issued"),
        ),
        (credential_id, issuer),
    );
}

/// Emit a credential renewed event.
///
/// Topic: `(credential, renewed)`
/// Payload: (credential_id, renewer, extension_seconds)
pub fn emit_credential_renewed(
    env: &Env,
    credential_id: u64,
    renewer: &Address,
    extension_seconds: u64,
) {
    env.events().publish(
        (
            Symbol::new(env, "credential"),
            Symbol::new(env, "renewed"),
        ),
        (credential_id, renewer, extension_seconds),
    );
}

/// Emit a credential revoked event.
///
/// Topic: `(credential, revoked)`
/// Payload: (credential_id, revoker, reason_code, timestamp)
pub fn emit_credential_revoked(
    env: &Env,
    credential_id: u64,
    revoker: &Address,
    reason_code: u64,
    timestamp: u64,
) {
    env.events().publish(
        (
            Symbol::new(env, "credential"),
            Symbol::new(env, "revoked"),
        ),
        (credential_id, revoker, reason_code, timestamp),
    );
}

// ─── General Events ───────────────────────────────────────────────

/// Emit a credential transferred event.
///
/// Topic: `(credential, xfer)`
/// Payload: (from, to, credential_id, timestamp)
pub fn emit_credential_transferred(
    env: &Env,
    from: &Address,
    to: &Address,
    credential_id: u64,
) {
    env.events().publish(
        (
            Symbol::new(env, "credential"),
            Symbol::new(env, "xfer"),
        ),
        (from, to, credential_id, env.ledger().timestamp()),
    );
}

/// Emit a course created event.
///
/// Topic: `(course, created)`
/// Payload: (course_id, instructor, timestamp)
pub fn emit_course_created(env: &Env, course_id: u64, instructor: &Address) {
    env.events().publish(
        (
            Symbol::new(env, "course"),
            Symbol::new(env, "created"),
        ),
        (course_id, instructor, env.ledger().timestamp()),
    );
}

/// Emit a course enrollment event.
///
/// Topic: `(course, enrolled)`
/// Payload: (course_id, student, timestamp)
pub fn emit_course_enrolled(env: &Env, course_id: u64, student: &Address) {
    env.events().publish(
        (
            Symbol::new(env, "course"),
            Symbol::new(env, "enrolled"),
        ),
        (course_id, student, env.ledger().timestamp()),
    );
}

/// Emit a course completion event.
///
/// Topic: `(course, completed)`
/// Payload: (course_id, student, timestamp)
pub fn emit_course_completed(env: &Env, course_id: u64, student: &Address) {
    env.events().publish(
        (
            Symbol::new(env, "course"),
            Symbol::new(env, "completed"),
        ),
        (course_id, student, env.ledger().timestamp()),
    );
}

/// Emit an achievement minted event.
///
/// Topic: `(achievement, minted)`
/// Payload: (user, achievement_id, timestamp)
pub fn emit_achievement_minted(env: &Env, user: &Address, achievement_id: u64) {
    env.events().publish(
        (
            Symbol::new(env, "achievement"),
            Symbol::new(env, "minted"),
        ),
        (user, achievement_id, env.ledger().timestamp()),
    );
}

/// Emit an achievement burned event.
///
/// Topic: `(achievement, burned)`
/// Payload: (user, achievement_id, timestamp)
pub fn emit_achievement_burned(env: &Env, user: &Address, achievement_id: u64) {
    env.events().publish(
        (
            Symbol::new(env, "achievement"),
            Symbol::new(env, "burned"),
        ),
        (user, achievement_id, env.ledger().timestamp()),
    );
}

/// Emit a contract paused event.
///
/// Topic: `(contract, paused)`
/// Payload: (admin, timestamp)
pub fn emit_paused(env: &Env, admin: &Address) {
    env.events().publish(
        (
            Symbol::new(env, "contract"),
            Symbol::new(env, "paused"),
        ),
        (admin, env.ledger().timestamp()),
    );
}

/// Emit a contract unpaused event.
///
/// Topic: `(contract, unpaused)`
/// Payload: (admin, timestamp)
pub fn emit_unpaused(env: &Env, admin: &Address) {
    env.events().publish(
        (
            Symbol::new(env, "contract"),
            Symbol::new(env, "unpaused"),
        ),
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
        // Should not panic
        emit_credential_issued(&env, 1, &user);
    }

    #[test]
    fn test_emit_credential_renewed() {
        let env = Env::default();
        let user = Address::generate(&env);
        emit_credential_renewed(&env, 1, &user, 3600);
    }

    #[test]
    fn test_emit_credential_revoked() {
        let env = Env::default();
        let user = Address::generate(&env);
        let ts = env.ledger().timestamp();
        emit_credential_revoked(&env, 1, &user, 2, ts);
    }

    #[test]
    fn test_emit_credential_transferred() {
        let env = Env::default();
        let from = Address::generate(&env);
        let to = Address::generate(&env);
        emit_credential_transferred(&env, &from, &to, 1);
    }

    #[test]
    fn test_emit_course_events() {
        let env = Env::default();
        let instructor = Address::generate(&env);
        let student = Address::generate(&env);

        emit_course_created(&env, 1, &instructor);
        emit_course_enrolled(&env, 1, &student);
        emit_course_completed(&env, 1, &student);
    }

    #[test]
    fn test_emit_achievement_events() {
        let env = Env::default();
        let user = Address::generate(&env);

        emit_achievement_minted(&env, &user, 1);
        emit_achievement_burned(&env, &user, 1);
    }

    #[test]
    fn test_emit_pause_unpause() {
        let env = Env::default();
        let admin = Address::generate(&env);
        emit_paused(&env, &admin);
        emit_unpaused(&env, &admin);
    }
}