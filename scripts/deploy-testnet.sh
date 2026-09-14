#!/usr/bin/env bash
# =============================================================================
# StarkEd — Soroban Contract Deployment (Stellar Testnet)
# =============================================================================
# Deploys the StarkEd Soroban contract to Stellar Testnet, initializes each
# instance, and writes the generated Contract IDs to:
#   - deployed_contracts_testnet.env   (fresh, per-run)
#   - .env                              (appended/updated)
#
# The contract crate compiles to a single WASM artifact
# (starked_education_contracts.wasm). We deploy it under four logical roles so
# the platform has dedicated contract instances:
#
#   1. CREDENTIAL_REGISTRY          — issue/verify/revoke credentials
#   2. COURSE_METADATA              — course creation + enrollment
#   3. CREDENTIAL_REGISTRY_EXTENDED — extended registry (cross-chain proofs)
#   4. DYNAMIC_NFT                  — achievement badge lifecycle
#
# Usage:
#   ./scripts/deploy-testnet.sh                # deploy all 4 (Testnet)
#   ./scripts/deploy-testnet.sh credential     # deploy one role
#
# Environment:
#   STELLAR_SECRET  (required)  funded Testnet secret key (S…)
#   STELLAR_ADMIN   (optional)  admin address for initialize();
#                               defaults to the public key of STELLAR_SECRET
#   SOROBAN_RPC     (optional)  defaults to https://soroban-testnet.stellar.org
# =============================================================================

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
# Resolve the repository root (parent of scripts/) so the script works no
# matter which directory it is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/contracts"

NETWORK="${1:-all}"
RPC_URL="${SOROBAN_RPC:-https://soroban-testnet.stellar.org}"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
OUTPUT_ENV="$REPO_ROOT/deployed_contracts_testnet.env"

if [[ -z "${STELLAR_SECRET:-}" ]]; then
  echo "❌ STELLAR_SECRET is not set. Export a funded Testnet secret key first:"
  echo "   export STELLAR_SECRET=\"S...\""
  exit 1
fi

# ─── CLI detection: prefer `soroban`, fall back to `stellar` ────────────────
if command -v soroban &>/dev/null; then
  CLI="soroban"
elif command -v stellar &>/dev/null; then
  CLI="stellar"
else
  echo "❌ Neither 'soroban' nor 'stellar' CLI found."
  echo "   Install with: cargo install --locked stellar-cli"
  exit 1
fi
echo "ℹ️  Using CLI: $CLI"

# ─── Derive admin address from the secret key if not provided ───────────────
if [[ -z "${STELLAR_ADMIN:-}" ]]; then
  if command -v node &>/dev/null; then
    STELLAR_ADMIN=$(cd "$REPO_ROOT" && node -e "
      const sdk = require('@stellar/stellar-sdk');
      console.log(sdk.Keypair.fromSecret(process.env.STELLAR_SECRET).publicKey());
    " 2>/dev/null || true)
  fi
fi
if [[ -z "${STELLAR_ADMIN:-}" ]]; then
  echo "❌ Could not derive STELLAR_ADMIN. Export it explicitly:"
  echo "   export STELLAR_ADMIN=\"G...\""
  exit 1
fi

# ─── Contract roles → WASM artifact ──────────────────────────────────────────
WASM_PATH="$CONTRACTS_DIR/target/wasm32-unknown-unknown/release/starked_education_contracts.wasm"

declare -A CONTRACTS=(
  [credential]="CREDENTIAL_REGISTRY_CONTRACT_ID"
  [course]="COURSE_METADATA_CONTRACT_ID"
  [extended]="CREDENTIAL_REGISTRY_EXTENDED_CONTRACT_ID"
  [nft]="DYNAMIC_NFT_CONTRACT_ID"
)

# ─── 1. Build contracts ──────────────────────────────────────────────────────
echo "=== Building contracts (release, wasm32-unknown-unknown) ==="
( cd "$CONTRACTS_DIR" && cargo build --release --target wasm32-unknown-unknown )

if [[ ! -f "$WASM_PATH" ]]; then
  echo "❌ WASM artifact not found at $WASM_PATH"
  exit 1
fi

# ─── 2. Deploy + initialize ──────────────────────────────────────────────────
: > "$OUTPUT_ENV"
echo "# StarkEd Soroban contracts ($NETWORK) — $(date -u)" >> "$OUTPUT_ENV"

deploy_and_init() {
  local role="$1"
  local env_key="${CONTRACTS[$role]}"
  local wasm="$WASM_PATH"

  echo ""
  echo "=== Deploying '$role' ($env_key) ==="

  local contract_id
  contract_id=$($CLI contract deploy \
    --wasm "$wasm" \
    --source-account "$STELLAR_SECRET" \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    | tail -1)

  contract_id="${contract_id//$'\r'/}"
  echo "✅ Deployed $role → $contract_id"

  echo "=== Initializing '$role' (admin: $STELLAR_ADMIN) ==="
  $CLI contract invoke \
    --id "$contract_id" \
    --source-account "$STELLAR_SECRET" \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    -- initialize \
    --admin "$STELLAR_ADMIN"

  echo "$env_key=$contract_id" >> "$OUTPUT_ENV"
  echo "✅ Initialized + saved to $OUTPUT_ENV"
}

if [[ "$NETWORK" == "all" ]]; then
  for role in "${!CONTRACTS[@]}"; do
    deploy_and_init "$role"
  done
else
  if [[ -z "${CONTRACTS[$NETWORK]:-}" ]]; then
    echo "❌ Unknown contract role: $NETWORK"
    echo "   Valid roles: all, ${!CONTRACTS[@]}"
    exit 1
  fi
  deploy_and_init "$NETWORK"
fi

# ─── 3. Merge into .env (idempotent) ────────────────────────────────────────
echo ""
echo "=== Updating .env ==="
if [[ ! -f "$REPO_ROOT/.env" ]]; then
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
fi
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  if grep -q "^${key}=" "$REPO_ROOT/.env"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$REPO_ROOT/.env" && rm -f "$REPO_ROOT/.env.bak"
  else
    echo "${key}=${value}" >> "$REPO_ROOT/.env"
  fi
done < "$OUTPUT_ENV"

echo ""
echo "🎉 Deployment complete!"
echo "   Contract IDs:  ./$OUTPUT_ENV"
echo "   Merged into:   .env"
echo ""
echo "Next: copy the IDs from $OUTPUT_ENV into the README deployment table."