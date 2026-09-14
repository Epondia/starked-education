use soroban_sdk::{contracttype, Address, Env, String, Symbol};

/// The maximum allowed length of a proposal's title in bytes.
pub const MAX_PROPOSAL_TITLE_BYTES: u32 = 200;
/// The maximum allowed length of a proposal's description in bytes.
pub const MAX_PROPOSAL_DESCRIPTION_BYTES: u32 = 2000;
/// The minimum duration (in seconds) for a proposal voting period.
pub const MIN_VOTING_PERIOD: u64 = 300;
/// The maximum duration (in seconds) for a proposal voting period.
pub const MAX_VOTING_PERIOD: u64 = 30 * 24 * 60 * 60;
/// The cooldown period (in seconds) required before a proposer can submit a duplicate proposal title.
pub const DUPLICATE_PROPOSAL_COOLDOWN: u64 = 24 * 60 * 60;

// ═══════════════════════════════════════════════════════════════════
//  Role-Based Access Control (RBAC)
// ═══════════════════════════════════════════════════════════════════

/// Protocol roles for least-privilege access control.
///
/// - `Admin`: Full contract control — can grant/revoke any role, pause, configure.
/// - `Issuer`: Can issue and manage credentials, create courses, mint badges.
/// - `Verifier`: Can verify credentials and generate cross-chain proofs.
///
/// Out of scope: multisig (tracked separately) and off-chain roles.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Role {
    Admin = 0,
    Issuer = 1,
    Verifier = 2,
}

impl Role {
    /// Pack role discriminant as u32 for event payloads and storage.
    pub fn to_u32(&self) -> u32 {
        match self {
            Role::Admin => 0,
            Role::Issuer => 1,
            Role::Verifier => 2,
        }
    }

    /// Unpack role discriminant from u32.
    pub fn from_u32(v: u32) -> Self {
        match v {
            0 => Role::Admin,
            1 => Role::Issuer,
            _ => Role::Verifier,
        }
    }
}

/// The status states of a governance proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalStatus {
    /// Proposal is currently active and open for voting.
    Active,
    /// Voting period ended and quorum/votes succeeded.
    Succeeded,
    /// Voting period ended and quorum/votes failed.
    Defeated,
    /// Proposal succeeded and is queued in the timelock.
    Queued,
    /// Proposal was executed and applied to on-chain state.
    Executed,
    /// Proposal expired without execution.
    Expired,
}

/// A proposal structure tracking voting state and details.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Proposal {
    /// Unique proposal identifier.
    pub id: u64,
    /// Proposer address who created this proposal.
    pub proposer: Address,
    /// Human-readable title of the proposal.
    pub title: String,
    /// Description details of the proposed action.
    pub description: String,
    /// Ledger timestamp when voting starts.
    pub start_time: u64,
    /// Ledger timestamp when voting ends.
    pub end_time: u64,
    /// Ledger timestamp when the proposal can be or was executed.
    pub execution_time: u64,
    /// Total voting power cast in support of the proposal.
    pub for_votes: i128,
    /// Total voting power cast against the proposal.
    pub against_votes: i128,
    /// Total voting power cast as abstained.
    pub abstain_votes: i128,
    /// The current lifecycle status of the proposal.
    pub status: ProposalStatus,
    /// The minimum required voting power for this proposal to succeed.
    pub quorum: i128,
}

/// A record tracking an individual vote cast by a voter.
#[contracttype]
#[derive(Clone, Debug)]
pub struct VoteRecord {
    /// The address of the voter.
    pub voter: Address,
    /// The unique proposal ID this vote was cast for.
    pub proposal_id: u64,
    /// Support type: 0: Against, 1: For, 2: Abstain.
    pub support: u32,
    /// The voting power (including token balance and reputation weight) cast.
    pub voting_power: i128,
}

/// Eligibility criteria a student must meet to apply for a scholarship.
#[contracttype]
#[derive(Clone, Debug)]
pub struct EligibilityCriteria {
    pub min_credentials: u32,   // minimum number of verified credentials
    pub field_of_study: String, // e.g. "CS" — empty string means any field
}

/// Created when a scholarship proposal is approved and queued for execution.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ScholarshipProposal {
    pub proposal_id: u64,
    pub total_amount: i128,   // total tokens reserved
    pub per_recipient: i128,  // tokens per recipient
    pub max_recipients: u32,  // cap on number of disbursements
    pub disbursed_count: u32, // how many have been paid out
    pub eligibility: EligibilityCriteria,
    pub application_deadline: u64, // timestamp after which no more applications
    pub returned_to_treasury: bool,
}

/// On-chain record of a scholarship disbursement.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ScholarshipRecord {
    pub proposal_id: u64,
    pub recipient: Address,
    pub amount: i128,
    pub timestamp: u64,
}

/// Storage keys for the governance component instance/persistent storage.
#[contracttype]
pub enum GovernanceDataKey {
    /// Proposal details keyed by proposal ID.
    Proposal(u64),
    /// Monotonically increasing proposal count.
    ProposalCount,
    /// Individual vote record keyed by (proposal_id, voter_address).
    Vote(u64, Address),
    /// The platform token contract address.
    GovernanceToken,
    /// Current threshold requirement for quorum.
    QuorumThreshold,
    /// Stored default voting period duration in seconds.
    VotingPeriod,
    /// Proposer cooldown key tracking when a title was last proposed.
    ProposalByProposerTitle(Address, String),
    /// Current timelock delay in seconds.
    TimelockDelay,
    /// Current multiplier factor for user reputation weight.
    ReputationMultiplier,
    /// Delegation link: delegator -> delegatee.
    Delegate(Address),
    /// Total balance held in the treasury.
    TreasuryBalance,
    /// ScholarshipProposal details keyed by proposal ID.
    Scholarship(u64),
    /// Flag indicating if an address has applied for a scholarship proposal.
    ScholarshipApplicant(u64, Address),
    /// Scholarship record keyed by (proposal_id, disbursement_index).
    ScholarshipRecord(u64, u32),
    /// Number of disbursements completed for a scholarship proposal.
    ScholarshipRecordCount(u64),
    /// Stored credential count for a student address.
    StudentCredentials(Address),
    /// Role assignment flag: (role, member_address) -> boolean.
    RoleMember(Role, Address),
    /// Count of addresses holding a specific role.
    RoleMemberCount(Role),
}

/// Governance component implementation hosting proposal lifecycle,
/// treasury management, voting power delegation, and scholarship disbursement.
pub struct Governance;

impl Governance {
    /// Calculate the voting power of a voter using quadratic token balance weighting and reputation weight.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `voter` – The address of the voter.
    /// - `token` – The governance token contract address.
    /// - `reputation` – The voter's reputation score to add as linear weight.
    ///
    /// # Returns
    ///
    /// The computed voting power as `i128`.
    pub fn get_voting_power(env: &Env, voter: Address, token: Address, reputation: u64) -> i128 {
        let token_client = soroban_sdk::token::Client::new(env, &token);
        let token_balance = token_client.balance(&voter);
        let sqrt_balance = Self::integer_sqrt(token_balance);
        let reputation_power = reputation as i128;
        sqrt_balance + reputation_power
    }

    /// Create a new proposal for governance voting.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `proposer` – The address of the proposer; must sign.
    /// - `title` – The proposal title.
    /// - `description` – Details of the proposed action.
    /// - `voting_period` – The duration of voting in seconds.
    /// - `quorum` – The minimum required voting power for success.
    ///
    /// # Returns
    ///
    /// The unique proposal ID (`u64`, 1-based).
    ///
    /// # Panics
    ///
    /// - Panics if inputs fail validation (e.g. title too long, voting period out of bounds).
    /// - Panics if proposer submits duplicate title within the cooldown period.
    pub fn create_proposal(
        env: Env,
        proposer: Address,
        title: String,
        description: String,
        voting_period: u64,
        quorum: i128,
    ) -> u64 {
        proposer.require_auth();

        // Validate inputs before creating the proposal
        Self::validate_proposal(
            &env,
            proposer.clone(),
            title.clone(),
            description.clone(),
            voting_period,
        );

        let count: u64 = env
            .storage()
            .instance()
            .get(&GovernanceDataKey::ProposalCount)
            .unwrap_or(0);
        let id = count + 1;
        let start_time = env.ledger().timestamp();
        let proposal = Proposal {
            id,
            proposer: proposer.clone(),
            title: title.clone(),
            description,
            start_time,
            end_time: start_time + voting_period,
            execution_time: 0,
            for_votes: 0,
            against_votes: 0,
            abstain_votes: 0,
            status: ProposalStatus::Active,
            quorum,
        };
        env.storage()
            .instance()
            .set(&GovernanceDataKey::Proposal(id), &proposal);
        env.storage()
            .instance()
            .set(&GovernanceDataKey::ProposalCount, &id);

        // Store timestamp for duplicate-proposal cooldown tracking
        env.storage().instance().set(
            &GovernanceDataKey::ProposalByProposerTitle(proposer, title),
            &start_time,
        );

        id
    }

    /// Create a scholarship proposal. Returns the proposal_id.
    pub fn create_scholarship_proposal(
        env: Env,
        proposer: Address,
        title: String,
        description: String,
        voting_period: u64,
        quorum: i128,
        total_amount: i128,
        per_recipient: i128,
        max_recipients: u32,
        eligibility: EligibilityCriteria,
        _application_window: u64, // seconds after execution during which students can apply
    ) -> u64 {
        if per_recipient <= 0 || total_amount < per_recipient as i128 {
            panic!("Invalid scholarship amounts");
        }
        if max_recipients == 0 {
            panic!("max_recipients must be > 0");
        }

        let id = Self::create_proposal(
            env.clone(),
            proposer,
            title,
            description,
            voting_period,
            quorum,
        );

        // Reserve funds from treasury immediately so they cannot be double-spent.
        let treasury: i128 = env
            .storage()
            .instance()
            .get(&GovernanceDataKey::TreasuryBalance)
            .unwrap_or(0);
        if treasury < total_amount {
            panic!("Insufficient treasury funds");
        }
        env.storage().instance().set(
            &GovernanceDataKey::TreasuryBalance,
            &(treasury - total_amount),
        );

        let scholarship = ScholarshipProposal {
            proposal_id: id,
            total_amount,
            per_recipient,
            max_recipients,
            disbursed_count: 0,
            eligibility,
            application_deadline: 0, // set when proposal is executed
            returned_to_treasury: false,
        };
        env.storage()
            .instance()
            .set(&GovernanceDataKey::Scholarship(id), &scholarship);
        id
    }

    /// Cast a vote on a proposal.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `voter` – The address of the voter; must sign.
    /// - `proposal_id` – The proposal ID to vote on.
    /// - `support` – The support option (0 = Against, 1 = For, 2 = Abstain).
    /// - `voting_power` – The computed voting power to cast.
    ///
    /// # Panics
    ///
    /// - Panics if the proposal does not exist.
    /// - Panics if the voting period has already ended.
    /// - Panics if the voter has already voted on this proposal.
    /// - Panics if the support option is invalid.
    pub fn cast_vote(env: Env, voter: Address, proposal_id: u64, support: u32, voting_power: i128) {
        voter.require_auth();
        let mut proposal: Proposal = env
            .storage()
            .instance()
            .get(&GovernanceDataKey::Proposal(proposal_id))
            .expect("Proposal not found");
        if env.ledger().timestamp() > proposal.end_time {
            panic!("Voting period ended");
        }
        if env
            .storage()
            .instance()
            .has(&GovernanceDataKey::Vote(proposal_id, voter.clone()))
        {
            panic!("Already voted");
        }
        match support {
            0 => proposal.against_votes += voting_power,
            1 => proposal.for_votes += voting_power,
            2 => proposal.abstain_votes += voting_power,
            _ => panic!("Invalid support option"),
        }
        env.storage()
            .instance()
            .set(&GovernanceDataKey::Proposal(proposal_id), &proposal);
        env.storage().instance().set(
            &GovernanceDataKey::Vote(proposal_id, voter.clone()),
            &support,
        );
    }

    /// Execute a successful proposal after the voting period ends.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `proposal_id` – The proposal ID to execute.
    /// - `application_window` – The application window in seconds (for scholarship proposals).
    ///
    /// # Panics
    ///
    /// - Panics if the proposal does not exist.
    /// - Panics if the voting period is not yet complete.
    /// - Panics if the proposal was already executed.
    pub fn execute_proposal(env: Env, proposal_id: u64, application_window: u64) {
        let mut proposal: Proposal = env
            .storage()
            .instance()
            .get(&GovernanceDataKey::Proposal(proposal_id))
            .expect("Proposal not found");
        if env.ledger().timestamp() < proposal.end_time {
            panic!("Voting period not ended");
        }
        if proposal.for_votes < proposal.quorum {
            proposal.status = ProposalStatus::Defeated;
            // Return reserved scholarship funds if applicable
            Self::return_scholarship_funds_if_defeated(&env, proposal_id);
        } else if proposal.for_votes > proposal.against_votes {
            let timelock_delay: u64 = env
                .storage()
                .instance()
                .get(&GovernanceDataKey::TimelockDelay)
                .unwrap_or(86400);
            if proposal.status == ProposalStatus::Active {
                proposal.status = ProposalStatus::Queued;
                proposal.execution_time = env.ledger().timestamp() + timelock_delay;
            } else if proposal.status == ProposalStatus::Queued {
                if env.ledger().timestamp() >= proposal.execution_time {
                    proposal.status = ProposalStatus::Executed;
                    // Open the scholarship application window
                    if let Some(mut s) = env
                        .storage()
                        .instance()
                        .get::<_, ScholarshipProposal>(&GovernanceDataKey::Scholarship(proposal_id))
                    {
                        s.application_deadline = env.ledger().timestamp() + application_window;
                        env.storage()
                            .instance()
                            .set(&GovernanceDataKey::Scholarship(proposal_id), &s);
                    }
                } else {
                    panic!("Timelock period not ended");
                }
            }
        } else {
            proposal.status = ProposalStatus::Defeated;
            Self::return_scholarship_funds_if_defeated(&env, proposal_id);
        }
        env.storage()
            .instance()
            .set(&GovernanceDataKey::Proposal(proposal_id), &proposal);
    }

    /// Student applies for a scholarship. Funds are disbursed immediately if eligible.
    pub fn apply_for_scholarship(env: Env, applicant: Address, proposal_id: u64) {
        applicant.require_auth();

        let proposal: Proposal = env
            .storage()
            .instance()
            .get(&GovernanceDataKey::Proposal(proposal_id))
            .expect("Proposal not found");
        if proposal.status != ProposalStatus::Executed {
            panic!("Scholarship not yet approved/executed");
        }

        let mut scholarship: ScholarshipProposal = env
            .storage()
            .instance()
            .get(&GovernanceDataKey::Scholarship(proposal_id))
            .expect("Not a scholarship proposal");

        let now = env.ledger().timestamp();
        if now > scholarship.application_deadline {
            panic!("Application window closed");
        }
        if scholarship.disbursed_count >= scholarship.max_recipients {
            panic!("All slots filled");
        }
        if env
            .storage()
            .instance()
            .has(&GovernanceDataKey::ScholarshipApplicant(
                proposal_id,
                applicant.clone(),
            ))
        {
            panic!("Already applied");
        }

        // Eligibility check
        let cred_count: u32 = env
            .storage()
            .instance()
            .get(&GovernanceDataKey::StudentCredentials(applicant.clone()))
            .unwrap_or(0);
        if cred_count < scholarship.eligibility.min_credentials {
            panic!("Insufficient credentials");
        }
        // field_of_study check omitted if empty (any field accepted)
        // A non-empty field_of_study would be enforced by an off-chain oracle / credential tag

        // Disburse
        scholarship.disbursed_count += 1;
        env.storage().instance().set(
            &GovernanceDataKey::ScholarshipApplicant(proposal_id, applicant.clone()),
            &true,
        );

        let record_count: u32 = env
            .storage()
            .instance()
            .get(&GovernanceDataKey::ScholarshipRecordCount(proposal_id))
            .unwrap_or(0);
        let record = ScholarshipRecord {
            proposal_id,
            recipient: applicant.clone(),
            amount: scholarship.per_recipient,
            timestamp: now,
        };
        env.storage().instance().set(
            &GovernanceDataKey::ScholarshipRecord(proposal_id, record_count),
            &record,
        );
        env.storage().instance().set(
            &GovernanceDataKey::ScholarshipRecordCount(proposal_id),
            &(record_count + 1),
        );
        env.storage()
            .instance()
            .set(&GovernanceDataKey::Scholarship(proposal_id), &scholarship);

        // Actual token transfer would call a token contract here.
        // We track the disbursement on-chain; token movement is handled by tokenomics integration.
    }

    /// Returns unclaimed scholarship funds to treasury after application window closes.
    pub fn return_unclaimed_scholarship_funds(env: Env, proposal_id: u64) {
        let mut scholarship: ScholarshipProposal = env
            .storage()
            .instance()
            .get(&GovernanceDataKey::Scholarship(proposal_id))
            .expect("Not a scholarship proposal");

        if scholarship.returned_to_treasury {
            panic!("Funds already returned");
        }
        if env.ledger().timestamp() <= scholarship.application_deadline {
            panic!("Application window still open");
        }

        let disbursed = scholarship.disbursed_count as i128 * scholarship.per_recipient;
        let remaining = scholarship.total_amount - disbursed;

        if remaining > 0 {
            let treasury: i128 = env
                .storage()
                .instance()
                .get(&GovernanceDataKey::TreasuryBalance)
                .unwrap_or(0);
            env.storage()
                .instance()
                .set(&GovernanceDataKey::TreasuryBalance, &(treasury + remaining));
        }

        scholarship.returned_to_treasury = true;
        env.storage()
            .instance()
            .set(&GovernanceDataKey::Scholarship(proposal_id), &scholarship);
    }

    /// Set student credential count (called by CredentialRegistry contract).
    pub fn set_student_credentials(env: Env, student: Address, count: u32) {
        env.storage()
            .instance()
            .set(&GovernanceDataKey::StudentCredentials(student), &count);
    }

    /// Retrieve a scholarship proposal details by its ID.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `proposal_id` – The proposal ID.
    ///
    /// # Returns
    ///
    /// The `ScholarshipProposal` struct details.
    ///
    /// # Panics
    ///
    /// - Panics if not a scholarship proposal.
    pub fn get_scholarship(env: &Env, proposal_id: u64) -> ScholarshipProposal {
        env.storage()
            .instance()
            .get(&GovernanceDataKey::Scholarship(proposal_id))
            .expect("Not a scholarship proposal")
    }

    /// Retrieve an individual scholarship disbursement record.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `proposal_id` – The scholarship proposal ID.
    /// - `index` – The disbursement record index.
    ///
    /// # Returns
    ///
    /// The `ScholarshipRecord` struct details.
    ///
    /// # Panics
    ///
    /// - Panics if the record at `index` is not found.
    pub fn get_scholarship_record(env: &Env, proposal_id: u64, index: u32) -> ScholarshipRecord {
        env.storage()
            .instance()
            .get(&GovernanceDataKey::ScholarshipRecord(proposal_id, index))
            .expect("Record not found")
    }

    /// Get the total number of disbursements completed for a scholarship proposal.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `proposal_id` – The scholarship proposal ID.
    ///
    /// # Returns
    ///
    /// The total count of disbursements (`u32`).
    pub fn get_scholarship_record_count(env: &Env, proposal_id: u64) -> u32 {
        env.storage()
            .instance()
            .get(&GovernanceDataKey::ScholarshipRecordCount(proposal_id))
            .unwrap_or(0)
    }

    /// Delegate voting power from the caller to another address.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `from` – The delegating voter address; must sign.
    /// - `to` – The address receiving the delegated voting power.
    pub fn delegate(env: Env, from: Address, to: Address) {
        from.require_auth();
        env.storage()
            .instance()
            .set(&GovernanceDataKey::Delegate(from), &to);
    }

    /// Get the address delegated to vote on behalf of a voter.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `voter` – The voter address to query.
    ///
    /// # Returns
    ///
    /// The delegate address if set, or the `voter` address itself if no delegation exists.
    pub fn get_delegate(env: &Env, voter: Address) -> Address {
        env.storage()
            .instance()
            .get(&GovernanceDataKey::Delegate(voter.clone()))
            .unwrap_or(voter)
    }

    /// Deposit tokens into the governance treasury.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `amount` – The amount of tokens to deposit.
    pub fn deposit_to_treasury(env: Env, amount: i128) {
        let current: i128 = env
            .storage()
            .instance()
            .get(&GovernanceDataKey::TreasuryBalance)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&GovernanceDataKey::TreasuryBalance, &(current + amount));
    }

    /// Withdraw tokens from the governance treasury.
    ///
    /// # Parameters
    ///
    /// - `env` – Soroban execution environment.
    /// - `amount` – The amount of tokens to withdraw.
    /// - `_recipient` – The recipient address (unused on-chain, tracks intent in params).
    ///
    /// # Panics
    ///
    /// - Panics if the treasury has insufficient funds.
    pub fn withdraw_from_treasury(env: Env, amount: i128, _recipient: Address) {
        let current: i128 = env
            .storage()
            .instance()
            .get(&GovernanceDataKey::TreasuryBalance)
            .unwrap_or(0);
        if current < amount {
            panic!("Insufficient treasury funds");
        }
        env.storage()
            .instance()
            .set(&GovernanceDataKey::TreasuryBalance, &(current - amount));
    }

    // ── Role-Based Access Control (RBAC) ──────────────────────────────────

    /// Grant a role to an address. Only callable by an existing Admin.
    /// On the very first Admin grant (when no Admin exists yet), the check
    /// is bypassed so the contract can be bootstrapped. Emits an event on
    /// grant. Rejects if the address already holds the role.
    pub fn grant_role(env: &Env, admin: Address, role: Role, grantee: Address) {
        admin.require_auth();

        // Chicken-and-egg: the first Admin must be grantable without
        // requiring an existing Admin.
        let existing_admin_count: u32 = env
            .storage()
            .instance()
            .get(&GovernanceDataKey::RoleMemberCount(Role::Admin))
            .unwrap_or(0);
        if existing_admin_count > 0 || role != Role::Admin {
            Self::require_role(env, &admin, Role::Admin);
        }

        let key = GovernanceDataKey::RoleMember(role, grantee.clone());
        if env.storage().instance().has(&key) {
            panic!("RoleAlreadyGranted");
        }
        env.storage().instance().set(&key, &true);

        let count_key = GovernanceDataKey::RoleMemberCount(role);
        let count: u32 = env
            .storage()
            .instance()
            .get(&count_key)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&count_key, &(count + 1));

        // Emit role-grant event for auditability
        env.events().publish(
            (
                Symbol::new(env, "governance"),
                Symbol::new(env, "role_granted"),
            ),
            (role.to_u32(), grantee),
        );
    }

    /// Revoke a role from an address. Only callable by an existing Admin.
    /// Rejects if revoking the last Admin would lock the contract.
    /// Emits an event on revoke.
    pub fn revoke_role(env: &Env, admin: Address, role: Role, target: Address) {
        admin.require_auth();
        Self::require_role(env, &admin, Role::Admin);

        let key = GovernanceDataKey::RoleMember(role, target.clone());
        if !env.storage().instance().has(&key) {
            panic!("RoleNotFound");
        }

        // Safety check: revoking the last Admin must not lock the contract.
        if role == Role::Admin {
            let count: u32 = env
                .storage()
                .instance()
                .get(&GovernanceDataKey::RoleMemberCount(Role::Admin))
                .unwrap_or(0);
            if count <= 1 {
                panic!("CannotRevokeLastAdmin");
            }
        }

        env.storage().instance().remove(&key);

        let count_key = GovernanceDataKey::RoleMemberCount(role);
        let count: u32 = env
            .storage()
            .instance()
            .get(&count_key)
            .unwrap_or(1);
        env.storage()
            .instance()
            .set(&count_key, &(count.saturating_sub(1)));

        env.events().publish(
            (
                Symbol::new(env, "governance"),
                Symbol::new(env, "role_revoked"),
            ),
            (role.to_u32(), target),
        );
    }

    /// Check whether `addr` holds `role`. Returns `true` if the role is stored.
    pub fn has_role(env: &Env, addr: &Address, role: Role) -> bool {
        env.storage()
            .instance()
            .has(&GovernanceDataKey::RoleMember(role, addr.clone()))
    }

    /// Get the number of addresses that hold a given role.
    pub fn get_role_member_count(env: &Env, role: Role) -> u32 {
        env.storage()
            .instance()
            .get(&GovernanceDataKey::RoleMemberCount(role))
            .unwrap_or(0)
    }

    /// Require that `caller` holds `required_role`. Panics with a clear message
    /// if the caller is not authorized. Called at the top of protected functions.
    pub fn require_role(env: &Env, caller: &Address, required_role: Role) {
        if !Self::has_role(env, caller, required_role) {
            panic!("UnauthorizedRole");
        }
    }

    /// Require that `caller` holds at least one of the given roles.
    /// Used when a function is gated on multiple possible roles (e.g. Admin OR Issuer).
    pub fn require_any_role(env: &Env, caller: &Address, roles: &[Role]) {
        for role in roles {
            if Self::has_role(env, caller, *role) {
                return;
            }
        }
        panic!("UnauthorizedRole");
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    fn return_scholarship_funds_if_defeated(env: &Env, proposal_id: u64) {
        if let Some(scholarship) = env
            .storage()
            .instance()
            .get::<_, ScholarshipProposal>(&GovernanceDataKey::Scholarship(proposal_id))
        {
            if !scholarship.returned_to_treasury {
                let treasury: i128 = env
                    .storage()
                    .instance()
                    .get(&GovernanceDataKey::TreasuryBalance)
                    .unwrap_or(0);
                env.storage().instance().set(
                    &GovernanceDataKey::TreasuryBalance,
                    &(treasury + scholarship.total_amount),
                );
                let mut s = scholarship;
                s.returned_to_treasury = true;
                env.storage()
                    .instance()
                    .set(&GovernanceDataKey::Scholarship(proposal_id), &s);
            }
        }
    }

    fn validate_proposal(
        env: &Env,
        proposer: Address,
        title: String,
        description: String,
        voting_period: u64,
    ) {
        if title.len() == 0 {
            panic!("InvalidTitle: title must be non-empty");
        }
        if title.len() > MAX_PROPOSAL_TITLE_BYTES {
            panic!("InvalidTitle: title exceeds 200 bytes");
        }
        if description.len() > MAX_PROPOSAL_DESCRIPTION_BYTES {
            panic!("InvalidDescription: description exceeds 2000 bytes");
        }
        if voting_period < MIN_VOTING_PERIOD || voting_period > MAX_VOTING_PERIOD {
            panic!("InvalidVotingPeriod: voting period out of bounds");
        }

        if let Some(last_created_at) = env
            .storage()
            .instance()
            .get::<_, u64>(&GovernanceDataKey::ProposalByProposerTitle(proposer, title))
        {
            let now = env.ledger().timestamp();
            if now.saturating_sub(last_created_at) < DUPLICATE_PROPOSAL_COOLDOWN {
                panic!("DuplicateProposal: proposer submitted same title within cooldown");
            }
        }
    }

    fn integer_sqrt(n: i128) -> i128 {
        if n < 2 {
            return n.max(0);
        }
        let mut x = n / 2;
        let mut y = (x + n / x) / 2;
        while y < x {
            x = y;
            y = (x + n / x) / 2;
        }
        x
    }
}
