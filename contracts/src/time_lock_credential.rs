#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, String, Vec, U256,
    Map, BytesN, IntoVal,
};

/// Time-locked credential release system for Stellar blockchain.
/// Allows institutions to issue credentials that become valid at specific future
/// dates and (optionally) designate a beneficiary that may claim the
/// credential after the original recipient's release time plus a configured
/// waiting period.
///
/// Issue #9 adds:
/// - `beneficiary: Option<Address>` and `beneficiary_wait_period: u64`
/// - `is_beneficiary_voided: bool` flag (set automatically on recipient release)
/// - Public functions `set_beneficiary`, `claim_as_beneficiary`, plus updated
///   audit semantics distinguishing beneficiary-driven releases.

#[contracttype]
#[derive(Clone, Debug)]
pub struct TimeLockedCredential {
    pub id: u64,
    pub issuer: Address,
    pub recipient: Address,
    pub credential_hash: BytesN<32>,
    pub metadata: String,
    pub release_time: u64,      // Unix timestamp when credential becomes valid
    pub created_at: u64,        // Unix timestamp when credential was created
    pub is_released: bool,      // Whether credential has been released
    pub is_revoked: bool,       // Whether credential has been revoked
    pub emergency_override: Option<Address>, // Admin who can override
    // ── Issue #9 additions ──
    pub beneficiary: Option<Address>,        // Optional beneficiary (will / testament)
    pub beneficiary_wait_period: u64,       // Seconds after release_time the beneficiary can claim
    pub is_beneficiary_voided: bool,        // True once recipient releases or admin revokes
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ReleaseSchedule {
    pub id: u64,
    pub credentials: Vec<u64>,  // Credential IDs in this schedule
    pub release_times: Vec<u64>, // Corresponding release times
    pub created_by: Address,
    pub is_active: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct AuditEntry {
    pub id: u64,
    pub operation: String,
    pub credential_id: u64,
    pub actor: Address,
    pub timestamp: u64,
    pub details: String,
}

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Credential(u64),
    CredentialByRecipient(Address, u64),
    CredentialByIssuer(Address, u64),
    Beneficiary(Address, u64), // index of credentials where `Address` is a beneficiary
    ReleaseSchedule(u64),
    AuditLog(u64),
    NextCredentialId,
    NextScheduleId,
    NextAuditId,
    EmergencyAdmin,
    TotalCredentials,
    TotalSchedules,
}

#[contract]
pub struct TimeLockCredential;

#[contractimpl]
impl TimeLockCredential {
    /// Initialize the contract with an emergency admin
    pub fn initialize(env: Env, emergency_admin: Address) {
        env.storage().persistent().set(
            &StorageKey::EmergencyAdmin,
            &emergency_admin
        );
        env.storage().persistent().set(&StorageKey::NextCredentialId, &0u64);
        env.storage().persistent().set(&StorageKey::NextScheduleId, &0u64);
        env.storage().persistent().set(&StorageKey::NextAuditId, &0u64);
        env.storage().persistent().set(&StorageKey::TotalCredentials, &0u64);
        env.storage().persistent().set(&StorageKey::TotalSchedules, &0u64);
    }

    /// Original 5-argument credential issue (backwards-compatible with the
    /// pre-#9 API). Internally calls `issue_credential_with_beneficiary`
    /// with `beneficiary = None` and `beneficiary_wait_period = 0` so existing
    /// tests / on-chain callers continue to work unchanged.
    pub fn issue_credential(
        env: Env,
        issuer: Address,
        recipient: Address,
        credential_hash: BytesN<32>,
        metadata: String,
        release_time: u64,
    ) -> Result<u64, String> {
        Self::issue_credential_with_beneficiary(
            env,
            issuer,
            recipient,
            credential_hash,
            metadata,
            release_time,
            None,
            0,
        )
    }

    /// Issue a time-locked credential (issue #9). Optionally include a
    /// beneficiary that may claim the credential after
    /// `release_time + beneficiary_wait_period` should the recipient be unable
    /// or unwilling to do so.
    pub fn issue_credential_with_beneficiary(
        env: Env,
        issuer: Address,
        recipient: Address,
        credential_hash: BytesN<32>,
        metadata: String,
        release_time: u64,
        beneficiary: Option<Address>,
        beneficiary_wait_period: u64,
    ) -> Result<u64, String> {
        issuer.require_auth();

        let current_time = env.ledger().timestamp();
        if release_time <= current_time {
            return Err(String::from_str(&env, "Release time must be in the future"));
        }

        // Validate the (optional) beneficiary inputs up-front.
        if let Some(b) = beneficiary.clone() {
            if b == recipient {
                return Err(String::from_str(
                    &env,
                    "Beneficiary must differ from recipient",
                ));
            }
            if b == issuer {
                return Err(String::from_str(
                    &env,
                    "Beneficiary must differ from issuer",
                ));
            }
        }

        let credential_id: u64 = env.storage().persistent()
            .get(&StorageKey::NextCredentialId)
            .unwrap_or(0u64);

        let credential = TimeLockedCredential {
            id: credential_id,
            issuer: issuer.clone(),
            recipient: recipient.clone(),
            credential_hash,
            metadata,
            release_time,
            created_at: current_time,
            is_released: false,
            is_revoked: false,
            emergency_override: None,
            beneficiary: beneficiary.clone(),
            beneficiary_wait_period,
            is_beneficiary_voided: false,
        };

        // Store credential
        env.storage().persistent().set(&StorageKey::Credential(credential_id), &credential);

        // Index by recipient
        let recipient_count: u64 = env.storage().persistent()
            .get(&StorageKey::CredentialByRecipient(recipient.clone(), u64::MAX))
            .unwrap_or(0u64);
        env.storage().persistent().set(
            &StorageKey::CredentialByRecipient(recipient.clone(), recipient_count),
            &credential_id
        );
        env.storage().persistent().set(
            &StorageKey::CredentialByRecipient(recipient, u64::MAX),
            &(recipient_count + 1u64)
        );

        // Index by issuer
        let issuer_count: u64 = env.storage().persistent()
            .get(&StorageKey::CredentialByIssuer(issuer.clone(), u64::MAX))
            .unwrap_or(0u64);
        env.storage().persistent().set(
            &StorageKey::CredentialByIssuer(issuer.clone(), issuer_count),
            &credential_id
        );
        env.storage().persistent().set(
            &StorageKey::CredentialByIssuer(issuer, u64::MAX),
            &(issuer_count + 1u64)
        );

        // Index by beneficiary (issue #9). Only indexed when a beneficiary is
        // supplied AND a positive wait period was configured.
        if let Some(b) = beneficiary.clone() {
            if beneficiary_wait_period > 0 {
                let benef_count: u64 = env.storage().persistent()
                    .get(&StorageKey::Beneficiary(b.clone(), u64::MAX))
                    .unwrap_or(0u64);
                env.storage().persistent().set(
                    &StorageKey::Beneficiary(b.clone(), benef_count),
                    &credential_id
                );
                env.storage().persistent().set(
                    &StorageKey::Beneficiary(b, u64::MAX),
                    &(benef_count + 1u64)
                );
            }
        }

        // Update counters
        env.storage().persistent().set(&StorageKey::NextCredentialId, &(credential_id + 1));
        let total: u64 = env.storage().persistent()
            .get(&StorageKey::TotalCredentials)
            .unwrap_or(0u64);
        env.storage().persistent().set(&StorageKey::TotalCredentials, &(total + 1));

        // Log audit entry
        let details = if beneficiary.is_some() && beneficiary_wait_period > 0 {
            String::from_str(&env, "Credential issued with beneficiary")
        } else {
            String::from_str(&env, "Credential issued successfully")
        };
        Self::log_audit(&env, String::from_str(&env, "ISSUE_CREDENTIAL"), credential_id, issuer.clone(), details)?;

        Ok(credential_id)
    }

    /// Designate (or replace) a beneficiary for the credential. Only the
    /// original recipient may change the beneficiary and only *before* the
    /// release time has passed. Passing `wait_period = 0` clears the
    /// beneficiary entirely (opt-out).
    pub fn set_beneficiary(
        env: Env,
        recipient: Address,
        credential_id: u64,
        beneficiary: Option<Address>,
        wait_period: u64,
    ) -> Result<(), String> {
        recipient.require_auth();

        let mut credential: TimeLockedCredential = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .ok_or_else(|| String::from_str(&env, "Credential not found"))?;

        if credential.recipient != recipient {
            return Err(String::from_str(&env, "Only the recipient can set a beneficiary"));
        }

        if credential.is_revoked {
            return Err(String::from_str(&env, "Credential is revoked"));
        }

        let now = env.ledger().timestamp();
        if now >= credential.release_time {
            return Err(String::from_str(&env, "Beneficiary can only be set before release time"));
        }

        if credential.is_released {
            return Err(String::from_str(&env, "Credential already released"));
        }

        // Validate inputs (same rules as issue_credential).
        if let Some(ref b) = beneficiary {
            if *b == recipient {
                return Err(String::from_str(
                    &env,
                    "Beneficiary must differ from recipient",
                ));
            }
            if *b == credential.issuer {
                return Err(String::from_str(
                    &env,
                    "Beneficiary must differ from issuer",
                ));
            }
        }

        // Drop the old beneficiary's index entry if it was previously tracked.
        if let Some(prev) = credential.beneficiary.clone() {
            if credential.beneficiary_wait_period > 0 {
                Self::remove_from_beneficiary_index(&env, &prev, credential_id);
            }
        }

        credential.beneficiary = beneficiary.clone();
        credential.beneficiary_wait_period = wait_period;
        credential.is_beneficiary_voided = false;

        env.storage().persistent().set(&StorageKey::Credential(credential_id), &credential);

        // Add new beneficiary to index when meaningful.
        if let Some(b) = beneficiary.clone() {
            if wait_period > 0 {
                let benef_count: u64 = env.storage().persistent()
                    .get(&StorageKey::Beneficiary(b.clone(), u64::MAX))
                    .unwrap_or(0u64);
                env.storage().persistent().set(
                    &StorageKey::Beneficiary(b.clone(), benef_count),
                    &credential_id
                );
                env.storage().persistent().set(
                    &StorageKey::Beneficiary(b, u64::MAX),
                    &(benef_count + 1u64)
                );
            }
        }

        Self::log_audit(
            &env,
            String::from_str(&env, "SET_BENEFICIARY"),
            credential_id,
            recipient,
            if beneficiary.is_some() && wait_period > 0 {
                String::from_str(&env, "Beneficiary designated")
            } else {
                String::from_str(&env, "Beneficiary cleared")
            },
        )?;

        env.events().publish(
            ("beneficiary_updated", credential_id,),
            (beneficiary.clone(), wait_period),
        );

        Ok(())
    }

    /// Claim the credential as the designated beneficiary. Only callable by
    /// the beneficiary, only after `release_time + beneficiary_wait_period`
    /// has elapsed, and only when the recipient has not already released
    /// (or had the credential revoked as an emergency override).
    pub fn claim_as_beneficiary(
        env: Env,
        beneficiary: Address,
        credential_id: u64,
    ) -> Result<(), String> {
        beneficiary.require_auth();

        let mut credential: TimeLockedCredential = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .ok_or_else(|| String::from_str(&env, "Credential not found"))?;

        if credential.is_revoked {
            return Err(String::from_str(&env, "Credential has been revoked"));
        }

        if credential.is_beneficiary_voided {
            return Err(String::from_str(
                &env,
                "Beneficiary designation voided (recipient already released)",
            ));
        }

        match credential.beneficiary.clone() {
            Some(b) if b == beneficiary => true,
            _ => {
                return Err(String::from_str(&(env), "Caller is not the designated beneficiary"));
            }
        };

        if credential.beneficiary_wait_period == 0 {
            return Err(String::from_str(&env, "No beneficiary wait period configured"));
        }

        let current_time = env.ledger().timestamp();
        if current_time < credential.release_time {
            return Err(String::from_str(&env, "Time lock not yet expired"));
        }

        let earliest_beneficiary_claim =
            credential.release_time + credential.beneficiary_wait_period;
        if current_time < earliest_beneficiary_claim {
            return Err(String::from_str(
                &env,
                "Beneficiary waiting period not yet elapsed",
            ));
        }

        credential.is_released = true;
        void_beneficiary(&mut credential);
        env.storage().persistent().set(&StorageKey::Credential(credential_id), &credential);

        Self::log_audit(
            &env,
            String::from_str(&env, "BENEFICIARY_CLAIM"),
            credential_id,
            beneficiary.clone(),
            String::from_str(&env, "Beneficiary claimed credential"),
        )?;

        env.events().publish(
            ("credential_released", credential_id,),
            (credential.recipient, beneficiary, true),
        );

        Ok(())
    }

    /// Release a credential if the time lock has expired. Voiding of the
    /// beneficiary happens here so a beneficiary-led flow can never race
    /// against a recipient-led one — the moment the recipient claims, the
    /// beneficiary is invalidated.
    pub fn release_credential(env: Env, credential_id: u64, caller: Address) -> Result<(), String> {
        caller.require_auth();

        let mut credential: TimeLockedCredential = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .ok_or_else(|| String::from_str(&env, "Credential not found"))?;

        if credential.is_released {
            return Err(String::from_str(&env, "Credential already released"));
        }

        if credential.is_revoked {
            return Err(String::from_str(&env, "Credential has been revoked"));
        }

        let current_time = env.ledger().timestamp();
        if current_time < credential.release_time {
            return Err(String::from_str(&env, "Time lock not yet expired"));
        }

        // Only recipient or issuer can release
        if caller != credential.recipient && caller != credential.issuer {
            return Err(String::from_str(&env, "Unauthorized caller"));
        }

        credential.is_released = true;
        void_beneficiary(&mut credential);
        env.storage().persistent().set(&StorageKey::Credential(credential_id), &credential);

        // Log audit entry — operation distinguishes recipient-release from
        // issuer-release indirectly via `actor`.
        Self::log_audit(&env, String::from_str(&env, "RELEASE_CREDENTIAL"), credential_id, caller.clone(), String::from_str(&env, "Credential released"))?;

        // Emit event
        env.events().publish((
            "credential_released",
            credential_id,
            credential.recipient,
            credential.issuer,
        ),);

        Ok(())
    }

    /// Batch release multiple credentials (gas optimized)
    pub fn batch_release_credentials(
        env: Env,
        credential_ids: Vec<u64>,
        caller: Address,
    ) -> Result<Vec<Result<u64, String>>, String> {
        caller.require_auth();

        let mut results: Vec<Result<u64, String>> = Vec::new(&env);
        let mut released_count = 0u64;

        for i in 0..credential_ids.len() {
            let credential_id = credential_ids.get(i).unwrap();

            match Self::release_credential_internal(&env, credential_id, caller.clone()) {
                Ok(_) => {
                    results.push_back(Ok(credential_id));
                    released_count += 1;
                }
                Err(e) => {
                    results.push_back(Err(e));
                }
            }
        }

        // Log batch operation
        Self::log_audit(
            &env,
            String::from_str(&env, "BATCH_RELEASE"),
            0,
            caller,
            format!("Batch release: {} successful out of {}", released_count, credential_ids.len()),
        )?;

        Ok(results)
    }

    /// Internal release without auth check (for batch operations). Also
    /// voids the beneficiary for any released credential, mirroring the
    /// public `release_credential` path.
    fn release_credential_internal(
        env: &Env,
        credential_id: u64,
        caller: Address,
    ) -> Result<(), String> {
        let mut credential: TimeLockedCredential = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .ok_or_else(|| String::from_str(env, "Credential not found"))?;

        if credential.is_released {
            return Err(String::from_str(env, "Already released"));
        }

        if credential.is_revoked {
            return Err(String::from_str(env, "Revoked"));
        }

        let current_time = env.ledger().timestamp();
        if current_time < credential.release_time {
            return Err(String::from_str(env, "Time lock active"));
        }

        if caller != credential.recipient && caller != credential.issuer {
            return Err(String::from_str(env, "Unauthorized"));
        }

        credential.is_released = true;
        void_beneficiary(&mut credential);
        env.storage().persistent().set(&StorageKey::Credential(credential_id), &credential);

        env.events().publish((
            "credential_released",
            credential_id,
            credential.recipient,
        ),);

        Ok(())
    }

    /// Emergency override - revoke a credential within 5 minutes of request
    pub fn emergency_revoke(
        env: Env,
        credential_id: u64,
        admin: Address,
        reason: String,
    ) -> Result<(), String> {
        admin.require_auth();

        // Verify admin privileges
        let emergency_admin: Address = env.storage().persistent()
            .get(&StorageKey::EmergencyAdmin)
            .ok_or_else(|| String::from_str(&env, "No emergency admin set"))?;

        if admin != emergency_admin {
            return Err(String::from_str(&env, "Not authorized"));
        }

        let mut credential: TimeLockedCredential = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .ok_or_else(|| String::from_str(&env, "Credential not found"))?;

        if credential.is_revoked {
            return Err(String::from_str(&env, "Already revoked"));
        }

        credential.is_revoked = true;
        credential.emergency_override = Some(admin.clone());
        // Emergency revoke overrides any pending beneficiary designation —
        // a forced revocation should never leave a beneficiary able to claim.
        void_beneficiary(&mut credential);
        env.storage().persistent().set(&StorageKey::Credential(credential_id), &credential);

        // Log audit entry
        Self::log_audit(
            &env,
            String::from_str(&env, "EMERGENCY_REVOKE"),
            credential_id,
            admin,
            format!("Emergency revoke: {}", reason),
        )?;

        // Emit event
        env.events().publish((
            "credential_emergency_revoked",
            credential_id,
            admin,
            reason,
        ),);

        Ok(())
    }

    /// Create a release schedule for multiple credentials
    pub fn create_release_schedule(
        env: Env,
        creator: Address,
        credential_ids: Vec<u64>,
        release_times: Vec<u64>,
    ) -> Result<u64, String> {
        creator.require_auth();

        if credential_ids.len() != release_times.len() {
            return Err(String::from_str(&env, "Credential and release time counts must match"));
        }

        let schedule_id: u64 = env.storage().persistent()
            .get(&StorageKey::NextScheduleId)
            .unwrap_or(0u64);

        let schedule = ReleaseSchedule {
            id: schedule_id,
            credentials: credential_ids.clone(),
            release_times: release_times.clone(),
            created_by: creator.clone(),
            is_active: true,
        };

        env.storage().persistent().set(&StorageKey::ReleaseSchedule(schedule_id), &schedule);
        env.storage().persistent().set(&StorageKey::NextScheduleId, &(schedule_id + 1));

        let total: u64 = env.storage().persistent()
            .get(&StorageKey::TotalSchedules)
            .unwrap_or(0u64);
        env.storage().persistent().set(&StorageKey::TotalSchedules, &(total + 1));

        // Log audit entry
        Self::log_audit(
            &env,
            String::from_str(&env, "CREATE_SCHEDULE"),
            schedule_id,
            creator,
            format!("Created schedule with {} credentials", credential_ids.len()),
        )?;

        Ok(schedule_id)
    }

    /// Get credential details
    pub fn get_credential(
        env: Env,
        credential_id: u64,
    ) -> Result<TimeLockedCredential, String> {
        env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .ok_or_else(|| String::from_str(&env, "Credential not found"))
    }

    /// Get credentials by recipient
    pub fn get_credentials_by_recipient(
        env: Env,
        recipient: Address,
    ) -> Result<Vec<TimeLockedCredential>, String> {
        let count: u64 = env.storage().persistent()
            .get(&StorageKey::CredentialByRecipient(recipient.clone(), u64::MAX))
            .unwrap_or(0u64);

        let mut credentials: Vec<TimeLockedCredential> = Vec::new(&env);
        for i in 0..count {
            if let Ok(cred_id) = env.storage().persistent()
                .get::<_, u64>(&StorageKey::CredentialByRecipient(recipient.clone(), i))
            {
                if let Ok(credential) = env.storage().persistent()
                    .get::<_, TimeLockedCredential>(&StorageKey::Credential(cred_id))
                {
                    credentials.push_back(credential);
                }
            }
        }

        Ok(credentials)
    }

    /// Get credentials by issuer
    pub fn get_credentials_by_issuer(
        env: Env,
        issuer: Address,
    ) -> Result<Vec<TimeLockedCredential>, String> {
        let count: u64 = env.storage().persistent()
            .get(&StorageKey::CredentialByIssuer(issuer.clone(), u64::MAX))
            .unwrap_or(0u64);

        let mut credentials: Vec<TimeLockedCredential> = Vec::new(&env);
        for i in 0..count {
            if let Ok(cred_id) = env.storage().persistent()
                .get::<_, u64>(&StorageKey::CredentialByIssuer(issuer.clone(), i))
            {
                if let Ok(credential) = env.storage().persistent()
                    .get::<_, TimeLockedCredential>(&StorageKey::Credential(cred_id))
                {
                    credentials.push_back(credential);
                }
            }
        }

        Ok(credentials)
    }

    /// Get credentials by beneficiary (issue #9)
    pub fn get_credentials_by_beneficiary(
        env: Env,
        beneficiary: Address,
    ) -> Result<Vec<TimeLockedCredential>, String> {
        let count: u64 = env.storage().persistent()
            .get(&StorageKey::Beneficiary(beneficiary.clone(), u64::MAX))
            .unwrap_or(0u64);

        let mut credentials: Vec<TimeLockedCredential> = Vec::new(&env);
        for i in 0..count {
            if let Ok(cred_id) = env.storage().persistent()
                .get::<_, u64>(&StorageKey::Beneficiary(beneficiary.clone(), i))
            {
                if let Ok(credential) = env.storage().persistent()
                    .get::<_, TimeLockedCredential>(&StorageKey::Credential(cred_id))
                {
                    credentials.push_back(credential);
                }
            }
        }

        Ok(credentials)
    }

    /// Get release schedule
    pub fn get_release_schedule(
        env: Env,
        schedule_id: u64,
    ) -> Result<ReleaseSchedule, String> {
        env.storage().persistent()
            .get(&StorageKey::ReleaseSchedule(schedule_id))
            .ok_or_else(|| String::from_str(&env, "Schedule not found"))
    }

    /// Get audit log entries
    pub fn get_audit_log(
        env: Env,
        from_id: u64,
        limit: u32,
    ) -> Result<Vec<AuditEntry>, String> {
        let mut entries: Vec<AuditEntry> = Vec::new(&env);
        let mut current_id = from_id;

        for _ in 0..limit {
            if let Ok(entry) = env.storage().persistent()
                .get::<_, AuditEntry>(&StorageKey::AuditLog(current_id))
            {
                entries.push_back(entry);
                current_id += 1;
            } else {
                break;
            }
        }

        Ok(entries)
    }

    /// Check if credentials are ready for release (notification system helper)
    pub fn check_upcoming_releases(
        env: Env,
        recipient: Address,
        time_window: u64, // seconds
    ) -> Result<Vec<TimeLockedCredential>, String> {
        let credentials = Self::get_credentials_by_recipient(env.clone(), recipient.clone())?;
        let current_time = env.ledger().timestamp();
        let mut upcoming: Vec<TimeLockedCredential> = Vec::new(&env);

        for i in 0..credentials.len() {
            let cred = credentials.get(i).unwrap();
            if !cred.is_released &&
               !cred.is_revoked &&
               cred.release_time > current_time &&
               cred.release_time <= current_time + time_window {
                upcoming.push_back(cred);
            }
        }

        Ok(upcoming)
    }

    /// Log audit entry (internal helper)
    fn log_audit(
        env: &Env,
        operation: String,
        credential_id: u64,
        actor: Address,
        details: String,
    ) -> Result<(), String> {
        let audit_id: u64 = env.storage().persistent()
            .get(&StorageKey::NextAuditId)
            .unwrap_or(0u64);

        let entry = AuditEntry {
            id: audit_id,
            operation,
            credential_id,
            actor: actor.clone(),
            timestamp: env.ledger().timestamp(),
            details,
        };

        env.storage().persistent().set(&StorageKey::AuditLog(audit_id), &entry);
        env.storage().persistent().set(&StorageKey::NextAuditId, &(audit_id + 1));

        env.events().publish((
            "audit_log",
            audit_id,
            operation,
            actor,
        ),);

        Ok(())
    }

    /// Remove a credential id from a beneficiary's index. We do a sorted
    /// compaction: copy the last entry over the removed slot and decrement
    /// the count. This keeps the index contiguous without unbounded growth.
    fn remove_from_beneficiary_index(env: &Env, beneficiary: &Address, credential_id: u64) {
        let count: u64 = env.storage().persistent()
            .get(&StorageKey::Beneficiary(beneficiary.clone(), u64::MAX))
            .unwrap_or(0u64);

        if count == 0 {
            return;
        }

        for i in 0..count {
            if let Ok(stored) = env.storage().persistent()
                .get::<_, u64>(&StorageKey::Beneficiary(beneficiary.clone(), i))
            {
                if stored == credential_id {
                    let last_index = count - 1;
                    if i != last_index {
                        if let Ok(last_id) = env.storage().persistent()
                            .get::<_, u64>(&StorageKey::Beneficiary(beneficiary.clone(), last_index))
                        {
                            env.storage().persistent().set(
                                &StorageKey::Beneficiary(beneficiary.clone(), i),
                                &last_id,
                            );
                        }
                    }
                    env.storage().persistent().remove(
                        &StorageKey::Beneficiary(beneficiary.clone(), last_index)
                    );
                    env.storage().persistent().set(
                        &StorageKey::Beneficiary(beneficiary.clone(), u64::MAX),
                        &last_index,
                    );
                    return;
                }
            }
        }
    }

    /// Get statistics
    pub fn get_stats(env: Env) -> Map<String, u64> {
        let mut stats: Map<String, u64> = Map::new(env);

        let total_credentials: u64 = env.storage().persistent()
            .get(&StorageKey::TotalCredentials)
            .unwrap_or(0u64);
        let total_schedules: u64 = env.storage().persistent()
            .get(&StorageKey::TotalSchedules)
            .unwrap_or(0u64);

        stats.set("total_credentials".into_val(&env), total_credentials);
        stats.set("total_schedules".into_val(&env), total_schedules);

        stats
    }
}

/// Mark a credential's beneficiary as voided. Safe to call multiple times —
/// the audit log + events already record the actual cause (`RELEASE_CREDENTIAL`,
/// `BENEFICIARY_CLAIM` or `EMERGENCY_REVOKE`).
fn void_beneficiary(credential: &mut TimeLockedCredential) {
    credential.is_beneficiary_voided = true;
}
