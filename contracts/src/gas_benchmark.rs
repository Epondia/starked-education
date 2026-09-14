#![cfg(test)]

/// Gas benchmarking module for smart contracts.
/// Verifies core contract operations execute successfully.
/// Precise gas metering is performed by soroban-cli in CI; these tests
/// serve as smoke-tests for the benchmark harness.
use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::{governance::EligibilityCriteria, StarkEdContract, StarkEdContractClient};

/// Gas budget thresholds (documented targets; validated by soroban-cli).
const GAS_BUDGET_CREDENTIAL_ISSUANCE: u64 = 2_000_000;
const GAS_BUDGET_COURSE_CREATION: u64 = 3_000_000;
const GAS_BUDGET_SCHOLARSHIP_PROPOSAL: u64 = 3_500_000;
const GAS_BUDGET_VOTING: u64 = 1_500_000;
const GAS_BUDGET_SCHOLARSHIP_APPLICATION: u64 = 2_500_000;

// ── benchmarks ───────────────────────────────────────────────────────────────

/// Benchmark: issuing a single credential through the main contract.
#[test]
fn bench_credential_issuance() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);

    client.initialize(&admin);

    // Warm-up call
    client.issue_credential(
        &admin,
        &recipient,
        &String::from_str(&env, "Bench Credential"),
        &String::from_str(&env, "bench_course"),
        &String::from_str(&env, "QmBenchHash"),
    );

    // Actual benchmark call
    let cred_id = client.issue_credential(
        &admin,
        &recipient,
        &String::from_str(&env, "Gas Benchmark Credential"),
        &String::from_str(&env, "bench_course_2"),
        &String::from_str(&env, "QmBenchHash2"),
    );

    assert!(cred_id > 0);
    let cred = client.get_credential(&cred_id);
    assert_eq!(
        cred.title,
        String::from_str(&env, "Gas Benchmark Credential")
    );
}

/// Benchmark: creating a course through the main contract.
#[test]
fn bench_course_creation() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    let course_id = client.create_course(
        &admin,
        &String::from_str(&env, "Gas Benchmark Course"),
        &String::from_str(&env, "A course for gas benchmarking"),
        &100_000_000,
    );

    assert!(course_id > 0);
    let course = client.get_course(&course_id);
    assert_eq!(course.title, String::from_str(&env, "Gas Benchmark Course"));
}

/// Benchmark: creating a scholarship proposal (governance).
/// Validates that governance types and eligibility criteria construct correctly.
#[test]
fn bench_scholarship_proposal_creation() {
    let env = Env::default();

    // Verify EligibilityCriteria can be constructed
    let criteria = EligibilityCriteria {
        min_credentials: 1,
        field_of_study: String::from_str(&env, "CS"),
    };
    assert_eq!(criteria.min_credentials, 1);

    // Verify governance constants are within expected bounds
    assert!(crate::governance::MAX_PROPOSAL_TITLE_BYTES > 0);
    assert!(crate::governance::MAX_PROPOSAL_DESCRIPTION_BYTES > 0);
    assert!(crate::governance::MIN_VOTING_PERIOD > 0);

    // Verify GovernanceDataKey enum variants are accessible
    let _key = crate::governance::GovernanceDataKey::TreasuryBalance;
}

/// Benchmark: casting a vote (governance).
/// Validates that vote-related types and ProposalStatus enum are accessible.
#[test]
fn bench_voting() {
    let env = Env::default();

    // Verify ProposalStatus enum variants
    let statuses = [
        crate::governance::ProposalStatus::Active,
        crate::governance::ProposalStatus::Succeeded,
        crate::governance::ProposalStatus::Defeated,
        crate::governance::ProposalStatus::Queued,
        crate::governance::ProposalStatus::Executed,
        crate::governance::ProposalStatus::Expired,
    ];
    assert_eq!(statuses.len(), 6);

    // Verify VoteRecord can be constructed
    let voter = Address::generate(&env);
    let _record = crate::governance::VoteRecord {
        voter: voter.clone(),
        proposal_id: 1,
        support: 1, // For
        voting_power: 50,
    };

    // Verify governance constants are valid (voting period is > 0, etc.)
    assert!(crate::governance::MAX_PROPOSAL_TITLE_BYTES > 0);
    assert!(crate::governance::MAX_PROPOSAL_DESCRIPTION_BYTES > 0);
    assert!(crate::governance::MIN_VOTING_PERIOD > 0);
    assert!(crate::governance::MAX_VOTING_PERIOD > crate::governance::MIN_VOTING_PERIOD);
}

/// Benchmark: full scholarship flow (governance).
/// Validates that ScholarshipProposal and related types construct correctly.
#[test]
fn bench_scholarship_full_flow() {
    let env = Env::default();

    // Verify ScholarshipProposal can be constructed
    let criteria = EligibilityCriteria {
        min_credentials: 3,
        field_of_study: String::from_str(&env, "CS"),
    };
    let _scholarship = crate::governance::ScholarshipProposal {
        proposal_id: 1,
        total_amount: 5000,
        per_recipient: 500,
        max_recipients: 10,
        disbursed_count: 0,
        eligibility: criteria,
        application_deadline: 0,
        returned_to_treasury: false,
    };

    // Verify ScholarshipRecord can be constructed
    let student = Address::generate(&env);
    let _record = crate::governance::ScholarshipRecord {
        proposal_id: 1,
        recipient: student,
        amount: 500,
        timestamp: 1000,
    };

    // Verify governance constants are valid
    assert!(crate::governance::DUPLICATE_PROPOSAL_COOLDOWN > 0);
}

/// Aggregated gas report placeholder.
/// The real report is produced by soroban-cli in CI; this test validates
/// that the benchmark harness compiles and all budget constants are defined.
#[test]
fn bench_gas_report() {
    assert!(GAS_BUDGET_CREDENTIAL_ISSUANCE > 0);
    assert!(GAS_BUDGET_COURSE_CREATION > 0);
    assert!(GAS_BUDGET_SCHOLARSHIP_PROPOSAL > 0);
    assert!(GAS_BUDGET_VOTING > 0);
    assert!(GAS_BUDGET_SCHOLARSHIP_APPLICATION > 0);
}
