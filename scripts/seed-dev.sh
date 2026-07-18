#!/bin/bash
set -e

echo "Starting development seed process..."

# Ensure backend container is running
if ! docker compose ps | grep -q backend; then
    echo "Backend container is not running. Please run 'docker compose up -d' first."
    exit 1
fi

echo "Running database migrations..."
docker compose exec backend npm run migrate:up

echo "Running database seed..."
docker compose exec backend npm run seed

echo "Database seeded successfully!"
