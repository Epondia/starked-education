# Local Development Guide

This guide explains how to set up the StarkEd project for local development using Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Services overview

The `docker-compose.yml` file sets up the following services:
- **backend**: Node.js backend API (Port: 5000)
- **frontend**: Next.js frontend (Port: 3000)
- **postgres**: PostgreSQL database (Port: 5432)
- **redis**: Redis cache (Port: 6379)
- **ipfs**: IPFS node for decentralized storage (Ports: 4001, 5001, 8080)

## Getting Started

1. **Start all services**:
   ```bash
   docker compose up -d --build
   ```

2. **Seed the database**:
   Once the containers are running and healthy, run the migrations and seed the database with initial development data:
   ```bash
   bash scripts/seed-dev.sh
   ```

## Hot Reloading

Both the backend and frontend are configured with volume mounts. Changes you make to the source code on your host machine will be immediately reflected inside the running containers, triggering a hot reload for Next.js (frontend) and nodemon (backend).

## Health Checks

All containers are equipped with health checks. You can check the status of your services by running:
```bash
docker compose ps
```

## Clean Environment

If you need to wipe all data (database, redis, ipfs) and start fresh, run:
```bash
docker compose down --volumes --remove-orphans
```
