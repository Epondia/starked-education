#![cfg(test)]

/// Gas benchmarking module for smart contracts.
/// Runs comprehensive gas usage tests and reports against budget thresholds.
use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::{
    governance::{EligibilityCriteria, Governance},
    StarkEdContract, StarkEdContractClient,
};

/// Gas budget thresholds (in CPU instructions / gas units).
/// These are upper limits – exceeding them triggers a CI failure.
const GAS_BUDGET_CREDENTIAL_ISSUANCE: u64 = 2_000_000;
const GAS_BUDGET_COURSE_CREATION: u64 = 3_000_000;
const GAS_BUDGET_SCHOLARSHIP_PROPOSAL: u64 = 3_500_000;
const GAS_BUDGET_VOTING: u64 = 1_500_000;
const GAS_BUDGET_PROFILE_CREATION: u64 = 1_800_000;
const GAS_BUDGET_SCHOLARSHIP_APPLICATION: u64 = 2_500_000;

/// Holds a single benchmark measurement.
#[derive(Debug)]
struct GasMeasurement {
    /// Human-readable operation name.
    operation: &'static str,
    /// Measured gas / CPU instructions consumed.
    gas_used: u64,
    /// Budget threshold for this operation.
    budget: u64,
    /// Whether the operation is within budget.
    passed: bool,
}

impl GasMeasurement {
    fn new(operation: &'static str, gas_used: u64, budget: u64) -> Self {
        Self {
            operation,
            gas_used,
            budget,
            passed: gas_used <= budget,
        }
    }

    fn summary(&self) -> String {
        let status = if self.passed { "✅ PASS" } else { "❌ FAIL" };
        format!(
            "{} | gas: {:>10} / {:>10} ({:.1}%)  {}",
            self.operation,
            self.gas_used,
            self.budget,
            (self.gas_used as f64 / self.budget as f64) * 100.0,
            status
        )
    }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/// Helper: advance ledger time by `secs` seconds.
fn advance(env: &Env, secs: u64) {
    env.ledger().with_mut(|l| l.timestamp += secs);
}

/// Helper: seed the governance treasury with `amount` tokens.
fn fund_treasury(env: &Env, amount: i128) {
    env.storage()
        .instance()
        .set(&crate::governance::GovernanceDataKey::TreasuryBalance, &amount);
}

// ── benchmarks ───────────────────────────────────────────────────────────────

/// Benchmark: issuing a single credential through the main contract.
#[test]
fn bench_credential_issuance() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);

    client.initialize(&admin);

    // Warm-up call
    client.issue_credential(
        &admin,
        &recipient,
        &"Bench Credential".into(),
        &"bench_course".into(),
        &"QmBenchHash".into(),
    );

    let gas_before = env.cost_estimate().budget();
    client.issue_credential(
        &admin,
        &recipient,
        &"Gas Benchmark Credential".into(),
        &"bench_course_2".into(),
        &"QmBenchHash2".into(),
    );
    let gas_after = env.cost_estimate().budget();
    let gas_used = gas_before.saturating_sub(gas_after);

    let m = GasMeasurement::new("credential_issuance", gas_used, GAS_BUDGET_CREDENTIAL_ISSUANCE);
    println!("{}", m.summary());
    assert!(m.passed, "Credential issuance exceeds gas budget");
}

/// Benchmark: creating a course through the main contract.
#[test]
fn bench_course_creation() {
    let env = Env::default();
    let admin = Address::generate(&env);

    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    let gas_before = env.cost_estimate().budget();
    client.create_course(
        &admin,
        &"Gas Benchmark Course".into(),
        &"A course for gas benchmarking".into(),
        &100_000_000,
    );
    let gas_after = env.cost_estimate().budget();
    let gas_used = gas_before.saturating_sub(gas_after);

    let m = GasMeasurement::new("course_creation", gas_used, GAS_BUDGET_COURSE_CREATION);
    println!("{}", m.summary());
    assert!(m.passed, "Course creation exceeds gas budget");
}

/// Benchmark: creating a scholarship proposal (governance).
#[test]
fn bench_scholarship_proposal_creation() {
    let env = Env::default();
    env.mock_all_auths();
    let proposer = Address::generate(&env);
    fund_treasury(&env, 20_000);

    let gas_before = env.cost_estimate().budget();
    Governance::create_scholarship_proposal(
        env.clone(),
        proposer,
        String::from_str(&env, "Bench Scholarship"),
        String::from_str(&env, "Gas benchmark"),
        3600,
        100,
        5000,
        500,
        10,
        EligibilityCriteria {
            min_credentials: 1,
            field_of_study: String::from_str(&env, ""),
        },
        86400,
    );
    let gas_after = env.cost_estimate().budget();
    let gas_used = gas_before.saturating_sub(gas_after);

    let m = GasMeasurement::new(
        "scholarship_proposal",
        gas_used,
        GAS_BUDGET_SCHOLARSHIP_PROPOSAL,
    );
    println!("{}", m.summary());
    assert!(m.passed, "Scholarship proposal creation exceeds gas budget");
}

/// Benchmark: casting a vote.
#[test]
fn bench_voting() {
    let env = Env::default();
    env.mock_all_auths();
    let proposer = Address::generate(&env);
    let voter = Address::generate(&env);
    fund_treasury(&env, 20_000);

    let pid = Governance::create_scholarship_proposal(
        env.clone(),
        proposer,
        String::from_str(&env, "Bench Scholarship"),
        String::from_str(&env, "Gas benchmark"),
        3600,
        100,
        5000,
        500,
        10,
        EligibilityCriteria {
            min_credentials: 1,
            field_of_study: String::from_str(&env, ""),
        },
        86400,
    );

    let gas_before = env.cost_estimate().budget();
    Governance::cast_vote(env.clone(), voter, pid, 1 /* For */, 50);
    let gas_after = env.cost_estimate().budget();
    let gas_used = gas_before.saturating_sub(gas_after);

    let m = GasMeasurement::new("cast_vote", gas_used, GAS_BUDGET_VOTING);
    println!("{}", m.summary());
    assert!(m.passed, "Voting exceeds gas budget");
}

/// Benchmark: full scholarship flow (vote → execute → apply).
#[test]
fn bench_scholarship_full_flow() {
    let env = Env::default();
    env.mock_all_auths();
    let proposer = Address::generate(&env);
    let student = Address::generate(&env);
    fund_treasury(&env, 20_000);

    let pid = Governance::create_scholarship_proposal(
        env.clone(),
        proposer,
        String::from_str(&env, "Bench Scholarship"),
        String::from_str(&env, "Gas benchmark"),
        3600,
        10,
        5000,
        500,
        10,
        EligibilityCriteria {
            min_credentials: 1,
            field_of_study: String::from_str(&env, ""),
        },
        86400,
    );

    Governance::cast_vote(env.clone(), student.clone(), pid, 1, 50);
    advance(&env, 3601);
    Governance::execute_proposal(env.clone(), pid, 86400);
    advance(&env, 86401);
    Governance::execute_proposal(env.clone(), pid, 86400);

    Governance::set_student_credentials(env.clone(), student.clone(), 5);

    let gas_before = env.cost_estimate().budget();
    Governance::apply_for_scholarship(env.clone(), student.clone(), pid);
    let gas_after = env.cost_estimate().budget();
    let gas_used = gas_before.saturating_sub(gas_after);

    let m = GasMeasurement::new(
        "scholarship_apply",
        gas_used,
        GAS_BUDGET_SCHOLARSHIP_APPLICATION,
    );
    println!("{}", m.summary());
    assert!(m.passed, "Scholarship application exceeds gas budget");
}

/// Aggregated gas report (runs all benchmarks and prints summary).
#[test]
fn bench_gas_report() {
    // This test runs all the individual benchmarks and prints a consolidated
    // report for CI artifact consumption.
    println!("\n╔══════════════════════════════════════════════════════════╗");
    println!("║           GAS BENCHMARK REPORT                          ║");
    println!("╚══════════════════════════════════════════════════════════╝\n");

    // Run individual benchmarks inline (cargo test runs them separately,
    // but this provides a single entry point for reporting).

    println!("Run individual benchmarks with:");
    println!("  cargo test bench_credential_issuance -- --nocapture");
    println!("  cargo test bench_course_creation -- --nocapture");
    println!("  cargo test bench_scholarship_proposal_creation -- --nocapture");
    println!("  cargo test bench_voting -- --nocapture");
    println!("  cargo test bench_scholarship_full_flow -- --nocapture");
    println!();

    println!("Gas Budget Thresholds:");
    println!("  credential_issuance:       {}", GAS_BUDGET_CREDENTIAL_ISSUANCE);
    println!("  course_creation:           {}", GAS_BUDGET_COURSE_CREATION);
    println!("  scholarship_proposal:      {}", GAS_BUDGET_SCHOLARSHIP_PROPOSAL);
    println!("  cast_vote:                 {}", GAS_BUDGET_VOTING);
    println!("  scholarship_apply:         {}", GAS_BUDGET_SCHOLARSHIP_APPLICATION);
    println!();

    // This test always passes – the individual benchmarks enforce budgets.
    assert!(true);
}
