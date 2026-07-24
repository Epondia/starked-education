# Deployment Guide

## Prerequisites
- Rust toolchain with `wasm32v1-none` target
- Stellar CLI (`stellar`) installed
- Stellar account with funded XLM

## Deploy to Testnet

```bash
export STELLAR_SECRET="your-testnet-secret-key"
./scripts/deploy.sh testnet
```

## Deploy to Mainnet

```bash
export STELLAR_SECRET="your-mainnet-secret-key"
./scripts/deploy.sh mainnet
```

## Deploy Specific Contract

```bash
./scripts/deploy.sh testnet credential_registry
```

## Verify Deployment

```bash
./scripts/verify.sh testnet
```

## Contract Addresses

After deployment, contract addresses are saved to `deployed_contracts_{network}.env`.
