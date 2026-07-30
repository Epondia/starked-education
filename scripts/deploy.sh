#!/bin/bash
# Stellar Soroban Contract Deployment Script
# Usage: ./scripts/deploy.sh [testnet|mainnet] [contract_name]

set -euo pipefail

NETWORK="${1:-testnet}"
CONTRACT_NAME="${2:-all}"

# Configuration
SOROBAN_RPC="${SOROBAN_RPC:-https://soroban-testnet.stellar.org:443}"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

if [ "$NETWORK" = "mainnet" ]; then
    SOROBAN_RPC="https://soroban-mainnet.stellar.org:443"
    NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
fi

echo "=== Deploying to $NETWORK ==="
echo "RPC: $SOROBAN_RPC"
echo "Passphrase: $NETWORK_PASSPHRASE"
echo ""

# Check if stellar CLI is installed
if ! command -v stellar &> /dev/null; then
    echo "Error: stellar CLI not found. Install from https://github.com/stellar/stellar-cli"
    exit 1
fi

# Build contracts
echo "=== Building contracts ==="
cd contracts
cargo build --target wasm32v1-none --release

# Deploy function
deploy_contract() {
    local name=$1
    local wasm_path="target/wasm32v1-none/release/${name}.wasm"
    
    if [ ! -f "$wasm_path" ]; then
        echo "Warning: $wasm_path not found, skipping $name"
        return
    fi
    
    echo "=== Deploying $name ==="
    local contract_id=$(stellar contract deploy \
        --wasm "$wasm_path" \
        --source-account "$STELLAR_SECRET" \
        --rpc-url "$SOROBAN_RPC" \
        --network-passphrase "$NETWORK_PASSPHRASE" \
        2>&1)
    
    echo "Contract ID: $contract_id"
    echo "$name=$contract_id" >> "../deployed_contracts_${NETWORK}.env"
    echo ""
}

# Deploy all or specific contract
if [ "$CONTRACT_NAME" = "all" ]; then
    echo "# Deployed contracts ($NETWORK) - $(date)" > "../deployed_contracts_${NETWORK}.env"
    for dir in contracts/*/; do
        name=$(basename "$dir")
        deploy_contract "$name"
    done
else
    echo "# Deployed contracts ($NETWORK) - $(date)" > "../deployed_contracts_${NETWORK}.env"
    deploy_contract "$CONTRACT_NAME"
fi

echo "=== Deployment complete ==="
echo "Contract addresses saved to deployed_contracts_${NETWORK}.env"
