use soroban_sdk::{
    contract, contractimpl, contracttype, Address, Env, Map, String, Vec, BytesN, IntoVal,
};

fn dummy_address(env: &Env) -> Address {
    Address::from_string(&String::from_str(env, "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"))
}

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
///
/// Issue #327 adds:
/// - `CredentialLockState` for explicit on-chain lock state queries
/// - `verify_credential` for validity checks
/// - Scheduled-release verification helpers

#[contracttype]
#[derive(Clone, Debug)]
pub struct TimeLockedCredential {
    pub id: u64,
    pub issuer: Address,
    pub recipient: Address,
    pub credential_hash: BytesN<32>,
    pub metadata: String,
    pub release_time: u64,
    pub created_at: u64,
    pub is_released: bool,
    pub is_revoked: bool,
    pub emergency_override: Address,
    pub has_emergency_override: bool,
    pub beneficiary: Address,
    pub has_beneficiary: bool,
    pub beneficiary_wait_period: u64,
    pub is_beneficiary_voided: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ReleaseSchedule {
    pub id: u64,
    pub credentials: Vec<u64>,
    pub release_times: Vec<u64>,
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
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CredentialLockState {
    Locked = 0,
    Released = 1,
    Revoked = 2,
}

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Credential(u64),
    CredentialByRecipient(Address, u64),
    CredentialByIssuer(Address, u64),
    Beneficiary(Address, u64),
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
    pub fn initialize(env: Env, emergency_admin: Address) {
        env.storage().persistent().set(&StorageKey::EmergencyAdmin, &emergency_admin);
        env.storage().persistent().set(&StorageKey::NextCredentialId, &0u64);
        env.storage().persistent().set(&StorageKey::NextScheduleId, &0u64);
        env.storage().persistent().set(&StorageKey::NextAuditId, &0u64);
        env.storage().persistent().set(&StorageKey::TotalCredentials, &0u64);
        env.storage().persistent().set(&StorageKey::TotalSchedules, &0u64);
    }

    pub fn issue_credential(
        env: Env,
        issuer: Address,
        recipient: Address,
        credential_hash: BytesN<32>,
        metadata: String,
        release_time: u64,
    ) -> u64 {
        Self::issue_credential_with_benef(
            env, issuer, recipient, credential_hash, metadata, release_time, None, 0,
        )
    }

    pub fn issue_credential_with_benef(
        env: Env,
        issuer: Address,
        recipient: Address,
        credential_hash: BytesN<32>,
        metadata: String,
        release_time: u64,
        beneficiary: Option<Address>,
        beneficiary_wait_period: u64,
    ) -> u64 {
        issuer.require_auth();

        let current_time = env.ledger().timestamp();
        if release_time <= current_time {
            panic!("Release time must be in the future");
        }

        if let Some(b) = beneficiary.clone() {
            if b == recipient {
                panic!("Beneficiary must differ from recipient");
            }
            if b == issuer {
                panic!("Beneficiary must differ from issuer");
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
            emergency_override: dummy_address(&env),
            has_emergency_override: false,
            beneficiary: dummy_address(&env),
            has_beneficiary: beneficiary.is_some(),
            beneficiary_wait_period,
            is_beneficiary_voided: false,
        };

        env.storage().persistent().set(&StorageKey::Credential(credential_id), &credential);

        let recipient_count: u64 = env.storage().persistent()
            .get(&StorageKey::CredentialByRecipient(recipient.clone(), u64::MAX))
            .unwrap_or(0u64);
        env.storage().persistent().set(
            &StorageKey::CredentialByRecipient(recipient.clone(), recipient_count),
            &credential_id,
        );
        env.storage().persistent().set(
            &StorageKey::CredentialByRecipient(recipient.clone(), u64::MAX),
            &(recipient_count + 1u64),
        );

        let issuer_count: u64 = env.storage().persistent()
            .get(&StorageKey::CredentialByIssuer(issuer.clone(), u64::MAX))
            .unwrap_or(0u64);
        env.storage().persistent().set(
            &StorageKey::CredentialByIssuer(issuer.clone(), issuer_count),
            &credential_id,
        );
        env.storage().persistent().set(
            &StorageKey::CredentialByIssuer(issuer.clone(), u64::MAX),
            &(issuer_count + 1u64),
        );

        if let Some(b) = beneficiary.clone() {
            if beneficiary_wait_period > 0 {
                let benef_count: u64 = env.storage().persistent()
                    .get(&StorageKey::Beneficiary(b.clone(), u64::MAX))
                    .unwrap_or(0u64);
                env.storage().persistent().set(
                    &StorageKey::Beneficiary(b.clone(), benef_count),
                    &credential_id,
                );
                env.storage().persistent().set(
                    &StorageKey::Beneficiary(b.clone(), u64::MAX),
                    &(benef_count + 1u64),
                );
            }
        }

        env.storage().persistent().set(&StorageKey::NextCredentialId, &(credential_id + 1));
        let total: u64 = env.storage().persistent()
            .get(&StorageKey::TotalCredentials)
            .unwrap_or(0u64);
        env.storage().persistent().set(&StorageKey::TotalCredentials, &(total + 1));

        let details = if beneficiary.is_some() && beneficiary_wait_period > 0 {
            String::from_str(&env, "Credential issued with beneficiary")
        } else {
            String::from_str(&env, "Credential issued successfully")
        };
        Self::log_audit(&env, String::from_str(&env, "ISSUE_CREDENTIAL"), credential_id, issuer.clone(), details);

        credential_id
    }

    pub fn set_beneficiary(
        env: Env,
        recipient: Address,
        credential_id: u64,
        beneficiary: Option<Address>,
        wait_period: u64,
    ) {
        recipient.require_auth();

        let mut credential: TimeLockedCredential = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"));

        if credential.recipient != recipient {
            panic!("Only the recipient can set a beneficiary");
        }

        if credential.is_revoked {
            panic!("Credential is revoked");
        }

        let now = env.ledger().timestamp();
        if now >= credential.release_time {
            panic!("Beneficiary can only be set before release time");
        }

        if credential.is_released {
            panic!("Credential already released");
        }

        if let Some(ref b) = beneficiary {
            if *b == recipient {
                panic!("Beneficiary must differ from recipient");
            }
            if *b == credential.issuer {
                panic!("Beneficiary must differ from issuer");
            }
        }

        if credential.has_beneficiary {
            Self::remove_from_beneficiary_index(&env, &credential.beneficiary, credential_id);
        }

        credential.beneficiary = beneficiary.clone().unwrap_or_else(|| dummy_address(&env));
        credential.has_beneficiary = beneficiary.is_some();
        credential.beneficiary_wait_period = wait_period;
        credential.is_beneficiary_voided = false;

        env.storage().persistent().set(&StorageKey::Credential(credential_id), &credential);

        if let Some(b) = beneficiary.clone() {
            if wait_period > 0 {
                let benef_count: u64 = env.storage().persistent()
                    .get(&StorageKey::Beneficiary(b.clone(), u64::MAX))
                    .unwrap_or(0u64);
                env.storage().persistent().set(
                    &StorageKey::Beneficiary(b.clone(), benef_count),
                    &credential_id,
                );
                env.storage().persistent().set(
                    &StorageKey::Beneficiary(b.clone(), u64::MAX),
                    &(benef_count + 1u64),
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
        );

        env.events().publish(
            ("beneficiary_updated", credential_id),
            (beneficiary.unwrap_or_else(|| dummy_address(&env)), wait_period),
        );
    }

    pub fn claim_as_beneficiary(env: Env, beneficiary: Address, credential_id: u64) {
        beneficiary.require_auth();

        let mut credential: TimeLockedCredential = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"));

        if credential.is_revoked {
            panic!("Credential has been revoked");
        }

        if credential.is_beneficiary_voided {
            panic!("Beneficiary designation voided (recipient already released)");
        }

        if !credential.has_beneficiary || credential.beneficiary != beneficiary {
            panic!("Caller is not the designated beneficiary");
        }

        if credential.beneficiary_wait_period == 0 {
            panic!("No beneficiary wait period configured");
        }

        let current_time = env.ledger().timestamp();
        if current_time < credential.release_time {
            panic!("Time lock not yet expired");
        }

        let earliest_beneficiary_claim =
            credential.release_time + credential.beneficiary_wait_period;
        if current_time < earliest_beneficiary_claim {
            panic!("Beneficiary waiting period not yet elapsed");
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
        );

        env.events().publish(
            ("credential_released", credential_id),
            (credential.recipient, beneficiary, true),
        );
    }

    pub fn release_credential(env: Env, credential_id: u64, caller: Address) {
        caller.require_auth();

        let mut credential: TimeLockedCredential = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"));

        if credential.is_released {
            panic!("Credential already released");
        }

        if credential.is_revoked {
            panic!("Credential has been revoked");
        }

        let current_time = env.ledger().timestamp();
        if current_time < credential.release_time {
            panic!("Time lock not yet expired");
        }

        if caller != credential.recipient && caller != credential.issuer {
            panic!("Unauthorized caller");
        }

        credential.is_released = true;
        void_beneficiary(&mut credential);
        env.storage().persistent().set(&StorageKey::Credential(credential_id), &credential);

        Self::log_audit(
            &env,
            String::from_str(&env, "RELEASE_CREDENTIAL"),
            credential_id,
            caller.clone(),
            String::from_str(&env, "Credential released"),
        );

        env.events().publish(
            ("credential_released", credential_id),
            (credential.recipient, credential.issuer),
        );
    }

    pub fn batch_release_credentials(
        env: Env,
        credential_ids: Vec<u64>,
        caller: Address,
    ) -> Vec<u64> {
        caller.require_auth();

        let mut results: Vec<u64> = Vec::new(&env);
        let mut _released_count = 0u64;

        for i in 0..credential_ids.len() {
            let credential_id = credential_ids.get(i).unwrap();
            match Self::try_release_credential_internal(&env, credential_id, caller.clone()) {
                Ok(()) => {
                    results.push_back(credential_id);
                    _released_count += 1;
                }
                Err(_) => {}
            }
        }

        Self::log_audit(
            &env,
            String::from_str(&env, "BATCH_RELEASE"),
            0,
            caller,
            String::from_str(&env, "Batch release completed"),
        );

        results
    }

    fn try_release_credential_internal(
        env: &Env,
        credential_id: u64,
        caller: Address,
    ) -> Result<(), ()> {
        let mut credential: TimeLockedCredential = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .ok_or(())?;

        if credential.is_released {
            return Err(());
        }

        if credential.is_revoked {
            return Err(());
        }

        let current_time = env.ledger().timestamp();
        if current_time < credential.release_time {
            return Err(());
        }

        if caller != credential.recipient && caller != credential.issuer {
            return Err(());
        }

        credential.is_released = true;
        void_beneficiary(&mut credential);
        env.storage().persistent().set(&StorageKey::Credential(credential_id), &credential);

        env.events().publish(
            ("credential_released", credential_id),
            (credential.recipient,),
        );

        Ok(())
    }

    pub fn emergency_revoke(env: Env, credential_id: u64, admin: Address, reason: String) {
        admin.require_auth();

        let emergency_admin: Address = env.storage().persistent()
            .get(&StorageKey::EmergencyAdmin)
            .unwrap_or_else(|| panic!("No emergency admin set"));

        if admin != emergency_admin {
            panic!("Not authorized");
        }

        let mut credential: TimeLockedCredential = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"));

        if credential.is_revoked {
            panic!("Already revoked");
        }

        credential.is_revoked = true;
        credential.emergency_override = admin.clone();
        credential.has_emergency_override = true;
        void_beneficiary(&mut credential);
        env.storage().persistent().set(&StorageKey::Credential(credential_id), &credential);

        Self::log_audit(
            &env,
            String::from_str(&env, "EMERGENCY_REVOKE"),
            credential_id,
            admin.clone(),
            reason.clone(),
        );

        env.events().publish(
            ("credential_emergency_revoked", credential_id),
            (admin, reason),
        );
    }

    pub fn create_release_schedule(
        env: Env,
        creator: Address,
        credential_ids: Vec<u64>,
        release_times: Vec<u64>,
    ) -> u64 {
        creator.require_auth();

        if credential_ids.len() != release_times.len() {
            panic!("Credential and release time counts must match");
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

        Self::log_audit(
            &env,
            String::from_str(&env, "CREATE_SCHEDULE"),
            schedule_id,
            creator,
            String::from_str(&env, "Created release schedule"),
        );

        schedule_id
    }

    pub fn get_credential(env: Env, credential_id: u64) -> TimeLockedCredential {
        env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"))
    }

    pub fn get_credentials_by_recipient(env: Env, recipient: Address) -> Vec<TimeLockedCredential> {
        let count: u64 = env.storage().persistent()
            .get(&StorageKey::CredentialByRecipient(recipient.clone(), u64::MAX))
            .unwrap_or(0u64);

        let mut credentials: Vec<TimeLockedCredential> = Vec::new(&env);
        for i in 0..count {
            if let Some(cred_id) = env.storage().persistent()
                .get(&StorageKey::CredentialByRecipient(recipient.clone(), i))
            {
                if let Some(credential) = env.storage().persistent()
                    .get(&StorageKey::Credential(cred_id))
                {
                    credentials.push_back(credential);
                }
            }
        }

        credentials
    }

    pub fn get_credentials_by_issuer(env: Env, issuer: Address) -> Vec<TimeLockedCredential> {
        let count: u64 = env.storage().persistent()
            .get(&StorageKey::CredentialByIssuer(issuer.clone(), u64::MAX))
            .unwrap_or(0u64);

        let mut credentials: Vec<TimeLockedCredential> = Vec::new(&env);
        for i in 0..count {
            if let Some(cred_id) = env.storage().persistent()
                .get(&StorageKey::CredentialByIssuer(issuer.clone(), i))
            {
                if let Some(credential) = env.storage().persistent()
                    .get(&StorageKey::Credential(cred_id))
                {
                    credentials.push_back(credential);
                }
            }
        }

        credentials
    }

    pub fn get_credentials_by_beneficiary(env: Env, beneficiary: Address) -> Vec<TimeLockedCredential> {
        let count: u64 = env.storage().persistent()
            .get(&StorageKey::Beneficiary(beneficiary.clone(), u64::MAX))
            .unwrap_or(0u64);

        let mut credentials: Vec<TimeLockedCredential> = Vec::new(&env);
        for i in 0..count {
            if let Some(cred_id) = env.storage().persistent()
                .get(&StorageKey::Beneficiary(beneficiary.clone(), i))
            {
                if let Some(credential) = env.storage().persistent()
                    .get(&StorageKey::Credential(cred_id))
                {
                    credentials.push_back(credential);
                }
            }
        }

        credentials
    }

    pub fn get_release_schedule(env: Env, schedule_id: u64) -> ReleaseSchedule {
        env.storage().persistent()
            .get(&StorageKey::ReleaseSchedule(schedule_id))
            .unwrap_or_else(|| panic!("Schedule not found"))
    }

    pub fn get_audit_log(env: Env, from_id: u64, limit: u32) -> Vec<AuditEntry> {
        let mut entries: Vec<AuditEntry> = Vec::new(&env);
        let mut current_id = from_id;

        for _ in 0..limit {
            if let Some(entry) = env.storage().persistent()
                .get(&StorageKey::AuditLog(current_id))
            {
                entries.push_back(entry);
                current_id += 1;
            } else {
                break;
            }
        }

        entries
    }

    pub fn check_upcoming_releases(env: Env, recipient: Address, time_window: u64) -> Vec<TimeLockedCredential> {
        let credentials = Self::get_credentials_by_recipient(env.clone(), recipient.clone());
        let current_time = env.ledger().timestamp();
        let mut upcoming: Vec<TimeLockedCredential> = Vec::new(&env);

        for i in 0..credentials.len() {
            let cred = credentials.get(i).unwrap();
            if !cred.is_released
                && !cred.is_revoked
                && cred.release_time > current_time
                && cred.release_time <= current_time + time_window
            {
                upcoming.push_back(cred);
            }
        }

        upcoming
    }

    /// Return the on-chain lock state of a credential without modifying it.
    pub fn get_credential_lock_state(env: Env, credential_id: u64) -> CredentialLockState {
        let credential: TimeLockedCredential = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id))
            .unwrap_or_else(|| panic!("Credential not found"));

        if credential.is_revoked {
            CredentialLockState::Revoked
        } else if credential.is_released {
            CredentialLockState::Released
        } else {
            CredentialLockState::Locked
        }
    }

    /// Verify that a credential is currently valid for use: released and not
    /// revoked. Returns `false` if the credential is still locked, revoked,
    /// or does not exist.
    pub fn verify_credential(env: Env, credential_id: u64) -> bool {
        let credential: Option<TimeLockedCredential> = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id));

        match credential {
            Some(c) => !c.is_revoked && c.is_released,
            None => false,
        }
    }

    /// Check whether a credential belongs to any active release schedule.
    pub fn is_credential_scheduled(env: Env, credential_id: u64) -> bool {
        let total_schedules: u64 = env.storage().persistent()
            .get(&StorageKey::TotalSchedules)
            .unwrap_or(0u64);

        for i in 0..total_schedules {
            if let Some(schedule) = env.storage().persistent()
                .get::<_, ReleaseSchedule>(&StorageKey::ReleaseSchedule(i))
            {
                if !schedule.is_active {
                    continue;
                }
                for j in 0..schedule.credentials.len() {
                    if schedule.credentials.get(j) == Some(credential_id) {
                        return true;
                    }
                }
            }
        }

        false
    }

    /// Return the scheduled release time for a credential, if it is part of an
    /// active release schedule.
    pub fn get_scheduled_release_time(env: Env, credential_id: u64) -> u64 {
        let total_schedules: u64 = env.storage().persistent()
            .get(&StorageKey::TotalSchedules)
            .unwrap_or(0u64);

        for i in 0..total_schedules {
            if let Some(schedule) = env.storage().persistent()
                .get::<_, ReleaseSchedule>(&StorageKey::ReleaseSchedule(i))
            {
                if !schedule.is_active {
                    continue;
                }
                for j in 0..schedule.credentials.len() {
                    if schedule.credentials.get(j) == Some(credential_id) {
                        if let Some(release_time) = schedule.release_times.get(j) {
                            return release_time;
                        }
                    }
                }
            }
        }

        panic!("Credential not found in any active release schedule");
    }

    /// Verify that a credential's scheduled release time has arrived (or the
    /// credential is already released). Returns `false` when the credential is
    /// revoked, still locked, or not part of any active schedule.
    pub fn verify_scheduled_release(env: Env, credential_id: u64) -> bool {
        let credential: Option<TimeLockedCredential> = env.storage().persistent()
            .get(&StorageKey::Credential(credential_id));

        match credential {
            Some(c) => {
                if c.is_revoked {
                    return false;
                }
                if c.is_released {
                    return true;
                }
                let scheduled_time = Self::get_scheduled_release_time(env.clone(), credential_id);
                let current_time = env.ledger().timestamp();
                current_time >= scheduled_time
            }
            None => false,
        }
    }

    fn log_audit(env: &Env, operation: String, credential_id: u64, actor: Address, details: String) {
        let audit_id: u64 = env.storage().persistent()
            .get(&StorageKey::NextAuditId)
            .unwrap_or(0u64);

        let entry = AuditEntry {
            id: audit_id,
            operation: operation.clone(),
            credential_id,
            actor: actor.clone(),
            timestamp: env.ledger().timestamp(),
            details,
        };

        env.storage().persistent().set(&StorageKey::AuditLog(audit_id), &entry);
        env.storage().persistent().set(&StorageKey::NextAuditId, &(audit_id + 1));

        env.events().publish(
            ("audit_log", audit_id),
            (operation.clone(), actor),
        );
    }

    fn remove_from_beneficiary_index(env: &Env, beneficiary: &Address, credential_id: u64) {
        let count: u64 = env.storage().persistent()
            .get(&StorageKey::Beneficiary(beneficiary.clone(), u64::MAX))
            .unwrap_or(0u64);

        if count == 0 {
            return;
        }

        for i in 0..count {
            if let Some(stored) = env.storage().persistent()
                .get::<_, u64>(&StorageKey::Beneficiary(beneficiary.clone(), i))
            {
                if stored == credential_id {
                    let last_index = count - 1;
                    if i != last_index {
                        if let Some(last_id) = env.storage().persistent()
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

    pub fn get_stats(env: Env) -> Map<String, u64> {
        let mut stats: Map<String, u64> = Map::new(&env);

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

fn void_beneficiary(credential: &mut TimeLockedCredential) {
    credential.is_beneficiary_voided = true;
}
