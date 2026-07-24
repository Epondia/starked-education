#!/bin/bash
# Verify deployed contracts on Stellar network
# Usage: ./scripts/verify.sh [testnet|mainnet]

set -euo pipefail

NETWORK="${1:-testnet}"
ENV_FILE="deployed_contracts_${NETWORK}.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE not found. Run deploy.sh first."
    exit 1
fi

echo "=== Verifying contracts on $NETWORK ==="

while IFS='=' read -r name contract_id; do
    if [[ "$name" == \#* ]]; then continue; fi
    echo "Verifying $name: $contract_id"
    stellar contract read \
        --id "$contract_id" \
        --source-account "$STELLAR_SECRET" \
        --rpc-url "${SOROBAN_RPC:-https://soroban-testnet.stellar.org:443}" \
        --network-passphrase "Test SDF Network ; September 2015" \
        2>&1 || echo "Warning: Could not verify $name"
    echo ""
done < "$ENV_FILE"

echo "=== Verification complete ==="
