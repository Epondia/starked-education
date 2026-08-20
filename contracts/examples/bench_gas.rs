//! Gas benchmark runner for core contract operations.
//! Outputs JSON with average gas costs for each operation.

use soroban_sdk::{testutils::Address as _, Address, Env, String};
use starked_education_contracts::{StarkEdContract, StarkEdContractClient};
use std::collections::HashMap;

fn measure_gas<F>(env: &Env, f: F) -> u64
where
    F: FnOnce(),
{
    env.budget().reset_default();
    f();
    // In soroban-sdk 20.x, `cpu_instruction_cost` returns the CPU instructions
    // consumed since the last budget reset (see testutils::budget::Budget).
    env.budget().cpu_instruction_cost()
}

fn bench_credential_issuance(
    env: &Env,
    client: &StarkEdContractClient,
    admin: &Address,
    recipient: &Address,
) -> u64 {
    measure_gas(env, || {
        client.issue_credential(
            admin,
            recipient,
            &String::from_str(env, "Bench Credential"),
            &String::from_str(env, "bench_course"),
            &String::from_str(env, "QmBenchHash"),
        );
    })
}

fn bench_course_creation(env: &Env, client: &StarkEdContractClient, admin: &Address) -> u64 {
    measure_gas(env, || {
        client.create_course(
            admin,
            &String::from_str(env, "Gas Benchmark Course"),
            &String::from_str(env, "A course for gas benchmarking"),
            &100_000_000,
        );
    })
}

// Add benchmarks for other operations similarly...

fn main() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    let contract_id = env.register_contract(None, StarkEdContract);
    let client = StarkEdContractClient::new(&env, &contract_id);
    client.initialize(&admin);

    let mut results = HashMap::new();

    // Run each benchmark multiple times and take average
    let iterations = 10;
    let mut total = 0;
    for _ in 0..iterations {
        total += bench_credential_issuance(&env, &client, &admin, &recipient);
    }
    results.insert("issue_credential", total / iterations);

    let mut total = 0;
    for _ in 0..iterations {
        total += bench_course_creation(&env, &client, &admin);
    }
    results.insert("create_course", total / iterations);

    // Add other benchmarks similarly

    let json = serde_json::to_string_pretty(&results).unwrap();
    println!("{}", json);
}
