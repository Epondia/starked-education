use soroban_sdk::{contracttype, Address, Env, String, Vec};

/// Bit-packed storage utilities for gas optimization
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackedUserFlags {
    /// Bits 0-1: PrivacyLevel (0=Public, 1=Private, 2=FriendsOnly)
    /// Bit 2: Verified status
    /// Bit 3: Active status
    /// Bits 4-7: Reserved for future use
    pub flags: u32,
}

impl PackedUserFlags {
    /// Construct a new `PackedUserFlags` instance by packing fields.
    ///
    /// # Parameters
    ///
    /// - `privacy_level` – Stored privacy level discriminant value.
    /// - `verified` – Whether the user is verified.
    /// - `active` – Whether the user is active.
    ///
    /// # Returns
    ///
    /// A new `PackedUserFlags` instance.
    pub fn new(privacy_level: u32, verified: bool, active: bool) -> Self {
        let mut flags = privacy_level & 0x03;
        if verified {
            flags |= 0x04;
        }
        if active {
            flags |= 0x08;
        }
        Self { flags }
    }

    /// Extract the privacy level from packed flags.
    ///
    /// # Returns
    ///
    /// The privacy level discriminant (`u32`).
    pub fn privacy_level(&self) -> u32 {
        self.flags & 0x03
    }

    /// Check if the user is verified from packed flags.
    ///
    /// # Returns
    ///
    /// `true` if verified; `false` otherwise.
    pub fn is_verified(&self) -> bool {
        (self.flags & 0x04) != 0
    }

    /// Check if the user is active from packed flags.
    ///
    /// # Returns
    ///
    /// `true` if active; `false` otherwise.
    pub fn is_active(&self) -> bool {
        (self.flags & 0x08) != 0
    }
}

/// Packed timestamps
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackedTimestamps {
    /// Creation timestamp.
    pub created_at: u64,
    /// Update timestamp.
    pub updated_at: u64,
}

impl PackedTimestamps {
    /// Construct a new `PackedTimestamps` instance.
    ///
    /// # Parameters
    ///
    /// - `created_at` – Stored created_at ledger timestamp.
    /// - `updated_at` – Stored updated_at ledger timestamp.
    ///
    /// # Returns
    ///
    /// A new `PackedTimestamps` instance.
    pub fn new(created_at: u64, updated_at: u64) -> Self {
        Self {
            created_at,
            updated_at,
        }
    }

    /// Get the created_at ledger timestamp.
    ///
    /// # Returns
    ///
    /// The creation timestamp.
    pub fn created_at(&self) -> u64 {
        self.created_at
    }

    /// Get the updated_at ledger timestamp.
    ///
    /// # Returns
    ///
    /// The update timestamp.
    pub fn updated_at(&self) -> u64 {
        self.updated_at
    }
}

/// Packed rating data (rating and review count in single u64)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PackedRating {
    /// High 32 bits: rating (0-10000 basis points)
    /// Low 32 bits: review count
    pub packed: u64,
}

impl PackedRating {
    /// Construct a new `PackedRating` instance.
    ///
    /// # Parameters
    ///
    /// - `rating_bps` – The rating value in basis points.
    /// - `review_count` – Stored review count.
    ///
    /// # Returns
    ///
    /// A new `PackedRating` instance.
    pub fn new(rating_bps: u32, review_count: u32) -> Self {
        let packed = ((rating_bps as u64) << 32) | (review_count as u64);
        Self { packed }
    }

    /// Get the rating value in basis points.
    ///
    /// # Returns
    ///
    /// The rating in bps.
    pub fn rating_bps(&self) -> u32 {
        (self.packed >> 32) as u32
    }

    /// Get the total count of reviews.
    ///
    /// # Returns
    ///
    /// The review count.
    pub fn review_count(&self) -> u32 {
        (self.packed & 0xFFFFFFFF) as u32
    }
}

/// Efficient storage keys using namespaces
#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    /// User data namespace.
    User(Address),
    /// User packed flags.
    UserFlags(Address),
    /// User packed timestamps.
    UserTimestamps(Address),
    /// User achievements list.
    UserAchievements(Address),
    /// User credentials list.
    UserCredentials(Address),
    /// Username to user address mapping index.
    UsernameMap(String),

    /// Course data namespace.  
    Course(String),
    /// Course packed flags.
    CourseFlags(String),
    /// Course packed rating.
    CourseRating(String),
    /// Course packed timestamps.
    CourseTimestamps(String),
    /// Global course count tracker.
    CourseCount,

    /// Credential namespace.
    Credential(u64),
    /// Global credential count tracker.
    CredentialCount,

    /// Achievement namespace.
    Achievement(u64),
    /// Global achievement count tracker.
    AchievementCount,

    /// Analytics namespace.
    Analytics(u64),
    /// Global analytics count tracker.
    AnalyticsCount,

    /// Global admin.
    Admin,
}

/// Storage utilities for efficient data management
pub struct StorageUtils;

impl StorageUtils {
    /// Store user data with minimal storage slots.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `user` – The user address.
    /// - `username` – User's username display name.
    /// - `email` – Optional email string.
    /// - `bio` – Optional biography text.
    /// - `avatar_url` – Optional avatar image URL.
    /// - `privacy_level` – Privacy settings discriminant.
    /// - `verified` – Verification status flag.
    /// - `active` – Account status flag.
    pub fn store_user_compact(
        env: &Env,
        user: Address,
        username: String,
        email: Option<String>,
        bio: Option<String>,
        avatar_url: Option<String>,
        privacy_level: u32,
        verified: bool,
        active: bool,
    ) {
        // Store core user data
        let core_data = (username, email, bio, avatar_url);
        env.storage()
            .instance()
            .set(&StorageKey::User(user.clone()), &core_data);

        // Store flags in single byte
        let flags = PackedUserFlags::new(privacy_level, verified, active);
        env.storage()
            .instance()
            .set(&StorageKey::UserFlags(user.clone()), &flags);

        // Store timestamps
        let now = env.ledger().timestamp();
        let timestamps = PackedTimestamps::new(now, now);
        env.storage()
            .instance()
            .set(&StorageKey::UserTimestamps(user), &timestamps);
    }

    /// Store course data with packed structures.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `course_id` – Stored course ID string.
    /// - `instructor` – Address of the instructor.
    /// - `title` – Display name of the course.
    /// - `description` – Short course description.
    /// - `category` – The course category grouping.
    /// - `level` – Target skill level string.
    /// - `duration` – The duration of the course in seconds.
    /// - `price` – Stored price in token units.
    /// - `max_students` – Limit on the number of enrolled students.
    /// - `certificate_enabled` – True if completion awards a certificate.
    pub fn store_course_compact(
        env: &Env,
        course_id: String,
        instructor: Address,
        title: String,
        description: String,
        category: String,
        level: String,
        duration: u64,
        price: u64,
        max_students: u64,
        certificate_enabled: bool,
    ) {
        // Pack course flags
        let mut flags = 0u32;
        if certificate_enabled {
            flags |= 0x01;
        }
        // Bits 1-7 reserved for future use

        // Store core course data
        let core_data = (
            instructor,
            title,
            description,
            category,
            level,
            duration,
            price,
            max_students,
        );
        env.storage()
            .instance()
            .set(&StorageKey::Course(course_id.clone()), &core_data);
        env.storage()
            .instance()
            .set(&StorageKey::CourseFlags(course_id.clone()), &flags);

        // Initialize rating and timestamps
        let rating = PackedRating::new(0, 0);
        let now = env.ledger().timestamp();
        let timestamps = PackedTimestamps::new(now, now);

        env.storage()
            .instance()
            .set(&StorageKey::CourseRating(course_id.clone()), &rating);
        env.storage()
            .instance()
            .set(&StorageKey::CourseTimestamps(course_id), &timestamps);
    }

    /// Efficiently add ID to user's list (achievements/credentials).
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `user` – The user address.
    /// - `id` – The achievement or credential ID.
    /// - `list_type` – The list type being added to.
    pub fn add_to_user_list(env: &Env, user: Address, id: u64, list_type: ListType) {
        let key = match list_type {
            ListType::Achievements => StorageKey::UserAchievements(user),
            ListType::Credentials => StorageKey::UserCredentials(user),
        };

        let mut list: Vec<u64> = env
            .storage()
            .instance()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));

        if !list.contains(&id) {
            list.push_back(id);
            env.storage().instance().set(&key, &list);
        }
    }

    /// Get next ID for any entity type
    /// Get next ID for any entity type, incrementing the counter.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `entity_type` – The target entity type.
    ///
    /// # Returns
    ///
    /// The incremented new ID (`u64`).
    pub fn get_next_id(env: &Env, entity_type: EntityType) -> u64 {
        let key = match entity_type {
            EntityType::Course => StorageKey::CourseCount,
            EntityType::Credential => StorageKey::CredentialCount,
            EntityType::Achievement => StorageKey::AchievementCount,
        };

        let current_id: u64 = env.storage().instance().get(&key).unwrap_or(0);

        let next_id = current_id + 1;
        env.storage().instance().set(&key, &next_id);

        next_id
    }

    /// Batch store analytics data to reduce storage operations.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `timestamp` – Stored analytics timestamp snapshot.
    /// - `total_users` – Stored total users count.
    /// - `active_users` – Stored active users count.
    /// - `total_courses` – Stored total courses count.
    /// - `total_completions` – Stored total completions count.
    /// - `avg_progress_bps` – Average student progress in basis points.
    /// - `avg_quiz_score_bps` – Average student quiz score in basis points.
    /// - `total_time_spent` – Cumulative student time spent in seconds.
    pub fn store_analytics_batch(
        env: &Env,
        timestamp: u64,
        total_users: u64,
        active_users: u64,
        total_courses: u64,
        total_completions: u64,
        avg_progress_bps: u32,
        avg_quiz_score_bps: u32,
        total_time_spent: u64,
    ) {
        // Pack all metrics into single storage entry
        let packed_data = (
            total_users,
            active_users,
            total_courses,
            total_completions,
            avg_progress_bps,
            avg_quiz_score_bps,
            total_time_spent,
        );

        env.storage()
            .instance()
            .set(&StorageKey::Analytics(timestamp), &packed_data);
    }
}

/// The type of list associated with a user profile (Achievements or Credentials).
#[derive(Clone)]
pub enum ListType {
    /// Achievements list namespace.
    Achievements,
    /// Credentials list namespace.
    Credentials,
}

/// The entity types used in unique ID generation.
#[derive(Clone)]
pub enum EntityType {
    /// Course entity.
    Course,
    /// Credential entity.
    Credential,
    /// Achievement entity.
    Achievement,
}

/// Gas measurement utilities
pub struct GasProfiler;

impl GasProfiler {
    /// Measure gas cost of storage operations.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `operation` – Closures hosting operations to measure.
    ///
    /// # Returns
    ///
    /// The measured cost in gas units.
    pub fn measure_storage_cost<F, R>(env: &Env, operation: F) -> u64
    where
        F: FnOnce(&Env) -> R,
    {
        let start_gas = env.ledger().timestamp(); // Simplified - in real implementation use actual gas metering
        operation(env);
        let end_gas = env.ledger().timestamp();
        end_gas - start_gas
    }
}
