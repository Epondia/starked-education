# Database Migration Rollback Procedures

This document outlines the procedures for safely rolling back database migrations in the StarkEd education platform.

## Overview

The migration system supports both **SQL** (`.sql`) and **JavaScript** (`.js`) migration files. Each migration file must include both an "up" (forward) and "down" (rollback) section.

## Migration File Format

### SQL Migrations

Use `-- @undo` or `-- DOWN` to separate the forward and rollback sections:

```sql
-- UP
CREATE TABLE IF NOT EXISTS example (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

-- @undo
DROP TABLE IF EXISTS example;
```

### JavaScript Migrations

Export both `up` and `down` functions:

```javascript
exports.up = async function(db) {
  await db.schema.createTable('example', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
  });
};

exports.down = async function(db) {
  await db.schema.dropTableIfExists('example');
};
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `npm run migrate:up` | Apply all pending migrations |
| `npm run migrate:down` | Rollback the most recent migration (confirms destructive ops) |
| `npm run migrate:status` | Show migration status |
| `npm run migrate:dry-run` | Preview pending migrations without applying |
| `npm run migrate:down-dry-run` | Preview rollback without executing |
| `npm run migrate:rollback-all` | Rollback all applied migrations (confirms destructive ops) |

### Manual CLI usage

```bash
# Apply migrations
ts-node src/utils/migrate.ts up

# Preview what would be applied
ts-node src/utils/migrate.ts up --dry-run

# Rollback last migration (requires explicit opt-in for destructive changes)
ts-node src/utils/migrate.ts down --allow-destructive

# Rollback last 3 migrations
ts-node src/utils/migrate.ts down --steps=3 --allow-destructive

# Preview rollback
ts-node src/utils/migrate.ts down --dry-run

# Show status
ts-node src/utils/migrate.ts status
```

## Destructive Change Safety Checks

The runner refuses to execute a migration that contains **destructive
operations** unless the change is explicitly confirmed. The following are
treated as destructive, in both raw SQL and the Knex schema-builder API:

- `DROP TABLE` / `DROP INDEX` / `DROP COLUMN` / `DROP CONSTRAINT`
- `DROP VIEW` / `DROP SCHEMA` / `DROP DATABASE` / `DROP FUNCTION` / `DROP TRIGGER`
- `TRUNCATE`
- `DELETE FROM` (raw SQL) and `.del()` / `.delete()` (Knex)
- `dropTableIfExists()` / `dropColumn()` / `dropIndex()` / `dropConstraint()` (Knex)

When a destructive operation is detected the migration is **blocked** and a
list of the offending statements (with line numbers) is printed. To proceed:

1. Review the change with `--dry-run` first.
2. Re-run with `--allow-destructive` to confirm.

```bash
# Blocked — prints the destructive statements and refuses to run
ts-node src/utils/migrate.ts down

# Preview what would run (never blocked, only warns)
ts-node src/utils/migrate.ts down --dry-run

# Confirmed — proceeds after explicit opt-in
ts-node src/utils/migrate.ts down --allow-destructive
```

The `npm run migrate:down` and `npm run migrate:rollback-all` scripts already
pass `--allow-destructive` because rolling back is an explicit, intentional
operation. The guard exists for the raw CLI (and for `up` migrations, which
should never contain destructive statements) so that destructive changes are
never applied by accident.

Every migration is also required to declare a **rollback (down) path** before
it can be applied:

- SQL migrations need a `-- @undo` (or `-- DOWN`) section.
- JavaScript migrations need both `up` and `down` exports.

A migration without a rollback path is rejected during the `up` validation
pass — before any migration in the batch is applied — so a migration can never
be applied that could not later be rolled back.

## Dry-Run Mode

Always use `--dry-run` before executing destructive operations:

1. **Before applying**: `npm run migrate:dry-run` — checks which migrations will be applied
2. **Before rolling back**: `npm run migrate:down-dry-run` — checks which migration will be rolled back

Dry-run mode logs what WOULD happen without making any changes to the database or migration state.

## Migration Tracking

The migration state is stored in two places:

1. **File-based tracking**: `backend/migrations/meta/_migrations.json`
   - Records filename, batch number, and timestamp for each applied migration
   - This is the authoritative source for migration state

2. **Database tracking table**: `migration_tracking` (created by migration `003_add_migration_tracking.sql`)
   - Provides an audit trail with execution time, checksums, and error messages
   - Enables querying migration history via SQL

## Rollback Procedures

### Standard Rollback (Single Migration)

```bash
npm run migrate:down
```

### Multi-Step Rollback

```bash
# Rollback the last 2 migrations
ts-node src/utils/migrate.ts down --steps=2 --allow-destructive
```

### Full Rollback

```bash
npm run migrate:rollback-all
```

## Best Practices

1. **Always dry-run first**: Preview changes with `--dry-run` before executing
2. **Test rollbacks**: Regularly test rollback procedures in staging environments
3. **Backup database**: Take a database backup before running migrations in production
4. **One migration per change**: Keep migrations small and focused
5. **Include down migrations**: Every migration MUST have a corresponding down/rollback section
6. **Test both directions**: Verify that `up` followed by `down` returns the database to its original state

## Troubleshooting

### Migration fails to apply

1. Check the error message in the console output
2. Verify the migration file format is correct
3. Check database connectivity and permissions
4. Run `npm run migrate:status` to see current state

### Rollback fails

1. If the rollback is blocked with a "destructive … blocked by safety check" error, review the listed statements and re-run with `--allow-destructive` (after a `--dry-run`).
2. Ensure the migration file has a valid `-- @undo` or `-- DOWN` section
3. Check that the down SQL is valid and doesn't reference non-existent objects
4. Verify no other processes are holding locks on the affected tables

### Corrupted migration state

1. Check `backend/migrations/meta/_migrations.json` for valid JSON
2. If corrupted, restore from backup or manually edit to match actual database state
3. Run `npm run migrate:status` to verify consistency
