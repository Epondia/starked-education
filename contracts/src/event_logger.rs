#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Vec};

/// Canonical event types emitted by this contract.
///
/// The indexer's TOPIC_TO_EVENT_TYPE map keys on the first two Soroban
/// symbol_short values in each publish() call, so the symbol strings below
/// are the authoritative source-of-truth for the off-chain mapping.
///
/// | Rust topic tuple                          | Off-chain key       | IndexedEventType     |
/// |-------------------------------------------|---------------------|----------------------|
/// | ("cred",    "issued")                     | cred:issued         | CredentialIssued     |
/// | ("cred",    "revoked")                    | cred:revoked        | CredentialRevoked    |
/// | ("course",  "created")                    | course:created      | CourseCreated        |
/// | ("enroll",  "created")                    | enroll:created      | EnrollmentCreated    |
/// | ("ach",     "minted")                     | ach:minted          | AchievementMinted    |
/// | ("pay",     "received")                   | pay:received        | PaymentReceived      |
/// | ("profile", "update")                     | profile:update      | ProfileUpdated       |
///
/// Legacy aliases preserved for backward compatibility (handled in the indexer):
///   ("course", "completed") → EnrollmentCreated
///   ("ach",    "earn")      → AchievementMinted

#[contracttype]
#[derive(Clone)]
pub enum EventType {
    CourseCompletion,
    CredentialIssuance,
    CredentialRevoked,
    CredentialRenewed,
    UserAchievement,
    ProfileUpdate,
    CourseEnrollment,
    CourseCreated,
    PaymentReceived,
}

// Marketplace-specific events
#[contracttype]
#[derive(Clone)]
pub enum MarketplaceEvent {
    ListingCreated,
    ListingUpdated,
    BidPlaced,
    SaleCompleted,
    ListingCancelled,
}

#[contracttype]
#[derive(Clone)]
pub struct EventLog {
    pub id: u64,
    pub event_type: EventType,
    pub user: Address,
    pub timestamp: u64,
    pub course_id: Option<String>,
    pub credential_id: Option<u64>,
    pub achievement_type: Option<String>,
    pub metadata: String, // JSON string for additional data
}

#[contracttype]
pub enum EventKey {
    Event(u64),
    UserEvents(Address),
    EventTypeEvents(EventType),
    EventCount,
}

#[contract]
pub struct EventLoggerContract;

#[contractimpl]
impl EventLoggerContract {
    /// Initialize the contract
    pub fn initialize(env: Env) {
        if env.storage().instance().has(&EventKey::EventCount) {
            panic!("Contract already initialized");
        }

        env.storage().instance().set(&EventKey::EventCount, &0u64);
    }

    // ──────────────────────────────────────────────────────────────────────
    // Event logging functions
    // ──────────────────────────────────────────────────────────────────────

    /// Log a course completion / enrollment event.
    ///
    /// Emits topic: ("enroll", "created") with value (user, course_id, event_id)
    /// Legacy alias ("course", "completed") is handled by the off-chain indexer.
    pub fn log_course_completion(
        env: Env,
        user: Address,
        course_id: String,
        metadata: String,
    ) -> u64 {
        user.require_auth();

        let event_id = Self::create_event(
            env.clone(),
            EventType::CourseEnrollment,
            user.clone(),
            Some(course_id.clone()),
            None,
            None,
            metadata,
        );

        // Canonical topic for off-chain indexer
        env.events().publish(
            (symbol_short!("enroll"), symbol_short!("created")),
            (user, course_id, event_id),
        );

        event_id
    }

    /// Log a credential issuance event.
    ///
    /// Emits topic: ("cred", "issued") with value (user, credential_id, event_id)
    pub fn log_credential_issuance(
        env: Env,
        user: Address,
        credential_id: u64,
        course_id: String,
        metadata: String,
    ) -> u64 {
        // Require admin/issuer auth in production deployments.
        // user.require_auth();

        let event_id = Self::create_event(
            env.clone(),
            EventType::CredentialIssuance,
            user.clone(),
            Some(course_id),
            Some(credential_id),
            None,
            metadata,
        );

        env.events().publish(
            (symbol_short!("cred"), symbol_short!("issued")),
            (user, credential_id, event_id),
        );

        event_id
    }

    /// Log a credential revocation event.
    ///
    /// Emits topic: ("cred", "revoked") with value (user, credential_id, event_id)
    pub fn log_credential_revocation(
        env: Env,
        revoker: Address,
        credential_id: u64,
        metadata: String,
    ) -> u64 {
        revoker.require_auth();

        let event_id = Self::create_event(
            env.clone(),
            EventType::CredentialRevoked,
            revoker.clone(),
            None,
            Some(credential_id),
            None,
            metadata,
        );

        env.events().publish(
            (symbol_short!("cred"), symbol_short!("revoked")),
            (revoker, credential_id, event_id),
        );

        event_id
    }

    /// Log a course creation event.
    ///
    /// Emits topic: ("course", "created") with value (creator, course_id, event_id)
    pub fn log_course_created(
        env: Env,
        creator: Address,
        course_id: String,
        metadata: String,
    ) -> u64 {
        creator.require_auth();

        let event_id = Self::create_event(
            env.clone(),
            EventType::CourseCreated,
            creator.clone(),
            Some(course_id.clone()),
            None,
            None,
            metadata,
        );

        env.events().publish(
            (symbol_short!("course"), symbol_short!("created")),
            (creator, course_id, event_id),
        );

        event_id
    }

    /// Log a user achievement minting event.
    ///
    /// Emits topic: ("ach", "minted") with value (user, achievement_type, event_id)
    ///
    /// Note: the legacy topic ("ach", "earn") is still accepted by the off-chain
    /// indexer for backward compatibility with old contract deployments.
    pub fn log_user_achievement(
        env: Env,
        user: Address,
        achievement_type: String,
        metadata: String,
    ) -> u64 {
        user.require_auth();

        let event_id = Self::create_event(
            env.clone(),
            EventType::UserAchievement,
            user.clone(),
            None,
            None,
            Some(achievement_type.clone()),
            metadata,
        );

        // Canonical topic ("ach", "minted") – matches IndexedEventType::AchievementMinted
        env.events().publish(
            (symbol_short!("ach"), symbol_short!("minted")),
            (user, achievement_type, event_id),
        );

        event_id
    }

    /// Log a payment received event.
    ///
    /// Emits topic: ("pay", "received") with value (payer, course_id, amount, event_id)
    pub fn log_payment_received(
        env: Env,
        payer: Address,
        course_id: String,
        amount: i128,
        metadata: String,
    ) -> u64 {
        payer.require_auth();

        let event_id = Self::create_event(
            env.clone(),
            EventType::PaymentReceived,
            payer.clone(),
            Some(course_id.clone()),
            None,
            None,
            metadata,
        );

        env.events().publish(
            (symbol_short!("pay"), symbol_short!("received")),
            (payer, course_id, amount, event_id),
        );

        event_id
    }

    /// Log a profile update event.
    ///
    /// Emits topic: ("profile", "update") with value (user, event_id)
    pub fn log_profile_update(env: Env, user: Address, metadata: String) -> u64 {
        user.require_auth();

        let event_id = Self::create_event(
            env.clone(),
            EventType::ProfileUpdate,
            user.clone(),
            None,
            None,
            None,
            metadata,
        );

        // Was missing in the original – now emits a consistently named event
        env.events().publish(
            (symbol_short!("profile"), symbol_short!("update")),
            (user, event_id),
        );

        event_id
    }

    /// Log a course enrollment event.
    ///
    /// Emits topic: ("enroll", "created") with value (user, course_id, event_id)
    pub fn log_course_enrollment(
        env: Env,
        user: Address,
        course_id: String,
        metadata: String,
    ) -> u64 {
        user.require_auth();

        let event_id = Self::create_event(
            env.clone(),
            EventType::CourseEnrollment,
            user.clone(),
            Some(course_id.clone()),
            None,
            None,
            metadata,
        );

        // Was missing event emission in the original contract
        env.events().publish(
            (symbol_short!("enroll"), symbol_short!("created")),
            (user, course_id, event_id),
        );

        event_id
    }

    // ──────────────────────────────────────────────────────────────────────
    // Query functions
    // ──────────────────────────────────────────────────────────────────────

    /// Get event by ID
    pub fn get_event(env: Env, event_id: u64) -> Option<EventLog> {
        env.storage().instance().get(&EventKey::Event(event_id))
    }

    /// Get all events for a user
    pub fn get_user_events(env: Env, user: Address) -> Vec<EventLog> {
        let event_ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&EventKey::UserEvents(user))
            .unwrap_or_else(|| Vec::new(&env));

        let mut events = Vec::new(&env);
        for event_id in event_ids.iter() {
            if let Some(event) = Self::get_event(env.clone(), event_id) {
                events.push_back(event);
            }
        }

        events
    }

    /// Get all events of a specific type
    pub fn get_events_by_type(env: Env, event_type: EventType) -> Vec<EventLog> {
        let event_ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&EventKey::EventTypeEvents(event_type.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        let mut events = Vec::new(&env);
        for event_id in event_ids.iter() {
            if let Some(event) = Self::get_event(env.clone(), event_id) {
                events.push_back(event);
            }
        }

        events
    }

    /// Get recent events with pagination
    pub fn get_recent_events(env: Env, limit: u32, offset: u32) -> Vec<EventLog> {
        let total_events: u64 = env
            .storage()
            .instance()
            .get(&EventKey::EventCount)
            .unwrap_or(0);

        let mut events = Vec::new(&env);
        let start = if total_events > offset as u64 {
            total_events - offset as u64
        } else {
            0
        };

        let end = if start > limit as u64 {
            start - limit as u64
        } else {
            0
        };

        for i in (end..start).rev() {
            if let Some(event) = Self::get_event(env.clone(), i + 1) {
                events.push_back(event);
            }
        }

        events
    }

    /// Get total event count
    pub fn get_event_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&EventKey::EventCount)
            .unwrap_or(0)
    }

    // ──────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────────────────────────────

    fn create_event(
        env: Env,
        event_type: EventType,
        user: Address,
        course_id: Option<String>,
        credential_id: Option<u64>,
        achievement_type: Option<String>,
        metadata: String,
    ) -> u64 {
        let count: u64 = env
            .storage()
            .instance()
            .get(&EventKey::EventCount)
            .unwrap_or(0);
        let event_id = count + 1;

        let event = EventLog {
            id: event_id,
            event_type: event_type.clone(),
            user: user.clone(),
            timestamp: env.ledger().timestamp(),
            course_id,
            credential_id,
            achievement_type,
            metadata,
        };

        // Store the event
        env.storage()
            .instance()
            .set(&EventKey::Event(event_id), &event);
        env.storage()
            .instance()
            .set(&EventKey::EventCount, &event_id);

        // Update user's event list
        let mut user_events: Vec<u64> = env
            .storage()
            .instance()
            .get(&EventKey::UserEvents(user.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        user_events.push_back(event_id);
        env.storage()
            .instance()
            .set(&EventKey::UserEvents(user), &user_events);

        // Update event type list
        let mut type_events: Vec<u64> = env
            .storage()
            .instance()
            .get(&EventKey::EventTypeEvents(event_type.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        type_events.push_back(event_id);
        env.storage()
            .instance()
            .set(&EventKey::EventTypeEvents(event_type), &type_events);

        event_id
    }
}
