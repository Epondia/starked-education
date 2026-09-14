import fs from 'fs';
import path from 'path';
import logger from './logger';

// Relative path configuration matching requirement spec matching schema
const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, '../../migrations');
const DEFAULT_META_FILE = path.join(DEFAULT_MIGRATIONS_DIR, 'meta/_migrations.json');

interface MigrationRecord {
  filename: string;
  appliedAt: string;
  batch: number;
}

interface MigrationState {
  applied: MigrationRecord[];
  lastBatch: number;
}

/**
 * Runtime options for the migration runner. Kept separate from the CLI so the
 * runner can be unit-tested against isolated migrations/metadata directories.
 */
export interface MigrationOptions {
  /** Directory containing migration files. Defaults to `backend/migrations`. */
  migrationsDir?: string;
  /** Path to the JSON metadata file tracking applied migrations. */
  metaFile?: string;
  /** Allow destructive migrations (DROP/TRUNCATE/DELETE) without failing. */
  allowDestructive?: boolean;
}

export interface DestructiveMatch {
  /** Human-readable name of the destructive operation, e.g. "DROP TABLE". */
  operation: string;
  /** 1-based line number of the first match in the migration source. */
  line: number;
  /** Trimmed source line containing the match (truncated for readability). */
  statement: string;
}

/**
 * Destructive operations that require explicit confirmation before running.
 * Covers both raw SQL and the Knex schema-builder API used by JS migrations.
 */
const DESTRUCTIVE_PATTERNS: Array<{ operation: string; pattern: RegExp }> = [
  { operation: 'DROP TABLE', pattern: /\bDROP\s+TABLE\b/gi },
  { operation: 'DROP INDEX', pattern: /\bDROP\s+INDEX\b/gi },
  { operation: 'DROP COLUMN', pattern: /\bDROP\s+COLUMN\b/gi },
  { operation: 'DROP CONSTRAINT', pattern: /\bDROP\s+CONSTRAINT\b/gi },
  { operation: 'DROP VIEW', pattern: /\bDROP\s+(?:MATERIALIZED\s+)?VIEW\b/gi },
  { operation: 'DROP SCHEMA', pattern: /\bDROP\s+SCHEMA\b/gi },
  { operation: 'DROP DATABASE', pattern: /\bDROP\s+DATABASE\b/gi },
  { operation: 'DROP FUNCTION', pattern: /\bDROP\s+FUNCTION\b/gi },
  { operation: 'DROP TRIGGER', pattern: /\bDROP\s+TRIGGER\b/gi },
  { operation: 'TRUNCATE', pattern: /\bTRUNCATE\b/gi },
  { operation: 'DELETE FROM', pattern: /\bDELETE\s+FROM\b/gi },
  // Knex schema builder equivalents used by JavaScript migrations
  { operation: 'DROP TABLE (knex)', pattern: /\bdropTable(?:IfExists)?\s*\(/gi },
  { operation: 'DROP COLUMN (knex)', pattern: /\bdropColumn\s*\(/gi },
  { operation: 'DROP INDEX (knex)', pattern: /\bdropIndex\s*\(/gi },
  { operation: 'DROP CONSTRAINT (knex)', pattern: /\bdropConstraint\s*\(/gi },
  { operation: 'TRUNCATE (knex)', pattern: /\btruncate\s*\(/gi },
  { operation: 'DELETE (knex)', pattern: /\.(?:del|delete)\s*\(\s*\)/gi },
];

function loadState(metaFile: string = DEFAULT_META_FILE): MigrationState {
  // Default state for new installations
  const defaultState: MigrationState = { applied: [], lastBatch: 0 };

  if (!fs.existsSync(metaFile)) {
    const parentDir = path.dirname(metaFile);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(metaFile, JSON.stringify(defaultState, null, 2));
    return defaultState;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(metaFile, 'utf8'));

    // Migrate from legacy format (string[]) to new format (MigrationRecord[])
    if (Array.isArray(raw.applied) && raw.applied.length > 0 && typeof raw.applied[0] === 'string') {
      const migrated: MigrationState = {
        applied: raw.applied.map((filename: string, idx: number) => ({
          filename,
          appliedAt: new Date().toISOString(),
          batch: idx + 1,
        })),
        lastBatch: raw.applied.length,
      };
      saveState(migrated, metaFile);
      return migrated;
    }

    return raw as MigrationState;
  } catch (err) {
    logger.error('Failed to parse migration metadata tracking state file. Corrupted JSON structure.');
    throw err;
  }
}

function saveState(state: MigrationState, metaFile: string = DEFAULT_META_FILE): void {
  fs.writeFileSync(metaFile, JSON.stringify(state, null, 2));
}

/** Get all migration files (.sql and .js), sorted numerically */
function getMigrationFiles(migrationsDir: string = DEFAULT_MIGRATIONS_DIR): string[] {
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
    return [];
  }
  return fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql') || file.endsWith('.js'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

/** Extract the "up" SQL from a migration file */
function extractUpSql(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.js')) {
    return content; // JS files are handled via dynamic require
  }
  return content.split(/--\s*@undo|--\s*DOWN/i)[0].trim();
}

/** Extract the "down" SQL from a migration file */
function extractDownSql(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  if (filePath.endsWith('.js')) {
    return content; // JS files are handled via dynamic require
  }
  const parts = content.split(/--\s*@undo|--\s*DOWN/i);
  if (parts.length < 2) {
    throw new Error(
      `Rollback syntax declaration pattern not found within target file: ${path.basename(filePath)}. ` +
      `Ensure '-- @undo' or '-- DOWN' is declared.`
    );
  }
  return parts[1].trim();
}

/**
 * Detect destructive operations (DROP/TRUNCATE/DELETE) in a migration source.
 * Returns matches sorted by line number.
 */
export function detectDestructiveOperations(content: string): DestructiveMatch[] {
  const matches: DestructiveMatch[] = [];
  const seen = new Set<string>();

  for (const { operation, pattern } of DESTRUCTIVE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      const statement = (content.split('\n')[line - 1] || '').trim().slice(0, 120);
      const key = `${operation}:${line}`;
      if (!seen.has(key)) {
        seen.add(key);
        matches.push({ operation, line, statement });
      }
    }
  }

  return matches.sort((a, b) => a.line - b.line);
}

/**
 * Return the portion of a migration file that runs in a given direction.
 * For SQL files this is the up/down split at `-- @undo`/`-- DOWN`. For JS
 * files the up section is everything before the `down` function definition and
 * the down section is everything from that definition onward.
 */
function extractDirectionalContent(filePath: string, direction: 'up' | 'down'): string {
  if (filePath.endsWith('.sql')) {
    return direction === 'up' ? extractUpSql(filePath) : extractDownSql(filePath);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const downBoundary = content.match(/(?:exports\.down\b|(?:async\s+)?function\s+down\s*\()/);
  if (direction === 'up') {
    return downBoundary ? content.slice(0, downBoundary.index) : content;
  }
  return downBoundary ? content.slice(downBoundary.index) : content;
}

/**
 * Verify a migration file declares a rollback (down) path before it can be
 * applied. Rejecting a migration at validation time prevents a migration from
 * being applied that could never be rolled back.
 */
export function validateMigrationRollbackPath(filePath: string): void {
  const content = fs.readFileSync(filePath, 'utf8');
  const basename = path.basename(filePath);

  if (filePath.endsWith('.sql')) {
    try {
      extractDownSql(filePath);
    } catch (err) {
      throw new Error(
        `Migration [${basename}] is missing a rollback (down) section. ` +
        `Add a '-- @undo' or '-- DOWN' section after the forward (up) statements.`
      );
    }
    return;
  }

  if (filePath.endsWith('.js')) {
    const hasUp = /(?:exports\.up\b|function\s+up\s*\(|async\s+function\s+up\s*\(|\bup\s*[,}])/.test(content);
    const hasDown = /(?:exports\.down\b|function\s+down\s*\(|async\s+function\s+down\s*\(|\bdown\s*[,}])/.test(content);
    if (!hasUp || !hasDown) {
      throw new Error(
        `Migration [${basename}] must export both an 'up' and a 'down' function so it can be safely rolled back.`
      );
    }
  }
}

/**
 * Guard against running destructive operations without explicit opt-in.
 * Throws when destructive SQL is detected and `allowDestructive` is false;
 * logs a warning (but proceeds) when the operator has opted in.
 */
function guardDestructiveOperations(
  matches: DestructiveMatch[],
  file: string,
  direction: 'up' | 'down',
  allowDestructive: boolean,
): void {
  if (matches.length === 0) return;

  const summary = matches
    .map(m => `    - line ${m.line}: ${m.operation}${m.statement ? ` — ${m.statement}` : ''}`)
    .join('\n');

  if (allowDestructive) {
    logger.warn(
      `Proceeding with destructive ${direction} migration [${file}] (--allow-destructive):\n${summary}`
    );
    return;
  }

  throw new Error(
    `Destructive ${direction} migration [${file}] blocked by safety check.\n` +
    `Detected:\n${summary}\n` +
    `Review the changes with '--dry-run', then re-run with '--allow-destructive' to confirm.`
  );
}

/** Execute a SQL migration against the database (placeholder for real DB driver) */
async function executeSql(_sql: string, _dryRun: boolean = false): Promise<void> {
  if (_dryRun) {
    logger.info('[DRY-RUN] Would execute SQL:\n' + _sql.substring(0, 200) + '...');
    return;
  }
  // In production, dispatch to database driver:
  // await db.query(_sql);
  logger.debug('Executed SQL migration successfully');
}

/** Execute a JS migration against the database (placeholder for real DB driver) */
async function executeJsMigration(
  _filePath: string,
  _direction: 'up' | 'down',
  _dryRun: boolean = false,
): Promise<void> {
  if (_dryRun) {
    logger.info(`[DRY-RUN] Would execute JS migration: ${path.basename(_filePath)} (${_direction})`);
    return;
  }
  // In production, dynamically require and execute:
  // const migration = require(_filePath);
  // if (_direction === 'up') await migration.up(db);
  // else await migration.down(db);
  logger.debug(`Executed JS migration: ${path.basename(_filePath)} (${_direction})`);
}

export async function migrateUp(
  dryRun: boolean = false,
  options: MigrationOptions = {},
): Promise<void> {
  const migrationsDir = options.migrationsDir || DEFAULT_MIGRATIONS_DIR;
  const metaFile = options.metaFile || DEFAULT_META_FILE;

  const state = loadState(metaFile);
  const allFiles = getMigrationFiles(migrationsDir);

  if (allFiles.length === 0) {
    logger.info('No migration files found.');
    return;
  }

  const appliedFilenames = new Set(state.applied.map(r => r.filename));
  const pending = allFiles.filter(file => !appliedFilenames.has(file));

  if (pending.length === 0) {
    logger.info('No pending migrations to apply. Database schema is fully functional.');
    return;
  }

  // Validate every pending migration BEFORE applying any of them, so a single
  // migration without a rollback path cannot leave a half-applied state.
  for (const file of pending) {
    validateMigrationRollbackPath(path.join(migrationsDir, file));
  }

  const batch = state.lastBatch + 1;
  logger.info(`Found ${pending.length} pending migrations. Starting migration process...`);
  if (dryRun) {
    logger.info('=== DRY-RUN MODE: No changes will be made ===');
  }

  for (const file of pending) {
    logger.info(`Applying migration: ${file}`);
    const filePath = path.join(migrationsDir, file);

    const destructive = detectDestructiveOperations(
      extractDirectionalContent(filePath, 'up'),
    );
    if (dryRun) {
      if (destructive.length > 0) {
        logger.warn(`[DRY-RUN] Destructive operations detected in up migration [${file}]:`);
        destructive.forEach(m => logger.warn(`    - line ${m.line}: ${m.operation}`));
      }
    } else {
      guardDestructiveOperations(destructive, file, 'up', !!options.allowDestructive);
    }

    try {
      if (file.endsWith('.sql')) {
        const upSql = extractUpSql(filePath);
        await executeSql(upSql, dryRun);
      } else if (file.endsWith('.js')) {
        await executeJsMigration(filePath, 'up', dryRun);
      }

      if (!dryRun) {
        state.applied.push({
          filename: file,
          appliedAt: new Date().toISOString(),
          batch,
        });
        state.lastBatch = batch;
        saveState(state, metaFile);
      }

      logger.info(`Successfully migrated up: ${file}`);
    } catch (err) {
      logger.error(`Migration script execution failure at file [${file}]:`, err);
      throw err;
    }
  }

  if (dryRun) {
    logger.info('=== DRY-RUN COMPLETE: No changes were made ===');
  }
}

export async function migrateDown(
  steps: number = 1,
  dryRun: boolean = false,
  options: MigrationOptions = {},
): Promise<void> {
  const migrationsDir = options.migrationsDir || DEFAULT_MIGRATIONS_DIR;
  const metaFile = options.metaFile || DEFAULT_META_FILE;

  const state = loadState(metaFile);
  if (state.applied.length === 0) {
    logger.warn('No applied migrations found to roll back.');
    return;
  }

  if (dryRun) {
    logger.info('=== DRY-RUN MODE: No changes will be made ===');
  }

  const toRollback = Math.min(steps, state.applied.length);
  logger.info(`Rolling back ${toRollback} migration(s)...`);

  // Migrations to roll back, most recently applied first.
  const targets = state.applied.slice(-toRollback).reverse();

  // Pre-validate every rollback target (rollback path + destructive guard)
  // BEFORE executing any of them, so a multi-step rollback cannot silently
  // apply only part of the requested change.
  for (const record of targets) {
    const file = record.filename;
    const filePath = path.join(migrationsDir, file);

    validateMigrationRollbackPath(filePath);

    const destructive = detectDestructiveOperations(
      extractDirectionalContent(filePath, 'down'),
    );
    if (dryRun) {
      if (destructive.length > 0) {
        logger.warn(`[DRY-RUN] Destructive operations detected in down migration [${file}]:`);
        destructive.forEach(m => logger.warn(`    - line ${m.line}: ${m.operation}`));
      }
    } else {
      guardDestructiveOperations(destructive, file, 'down', !!options.allowDestructive);
    }
  }

  for (const record of targets) {
    const file = record.filename;
    const filePath = path.join(migrationsDir, file);

    logger.info(`Initiating migration rollback sequence for: ${file}`);

    try {
      if (file.endsWith('.sql')) {
        const downSql = extractDownSql(filePath);
        await executeSql(downSql, dryRun);
      } else if (file.endsWith('.js')) {
        await executeJsMigration(filePath, 'down', dryRun);
      }

      if (!dryRun) {
        const idx = state.applied.findIndex(r => r.filename === file);
        if (idx >= 0) {
          state.applied.splice(idx, 1);
        }
        // Decrement lastBatch if the last migration was rolled back
        if (state.applied.length === 0) {
          state.lastBatch = 0;
        }
        saveState(state, metaFile);
      }

      logger.info(`Successfully rolled back migration: ${file}`);
    } catch (err) {
      logger.error(`Migration down execution failure processing file [${file}]:`, err);
      throw err;
    }
  }

  if (dryRun) {
    logger.info('=== DRY-RUN COMPLETE: No changes were made ===');
  }
}

export function migrationStatus(): void {
  const state = loadState();
  const allFiles = getMigrationFiles();

  console.log('\n========= MIGRATION SYSTEM STATUS =========');
  console.log(`Tracking Storage File: ${DEFAULT_META_FILE}`);
  console.log(`Total Migrations: ${allFiles.length}`);
  console.log(`Applied: ${state.applied.length}`);
  console.log(`Pending: ${allFiles.length - state.applied.length}\n`);

  if (allFiles.length === 0) {
    console.log(' No migration files found inside migrations directory.');
    return;
  }

  const appliedFilenames = new Set(state.applied.map(r => r.filename));

  allFiles.forEach(file => {
    const isApplied = appliedFilenames.has(file);
    const record = state.applied.find(r => r.filename === file);
    const appliedInfo = record
      ? ` (batch #${record.batch}, ${record.appliedAt})`
      : '';
    console.log(` [${isApplied ? '✔ APPLIED' : '  PENDING '}] ${file}${appliedInfo}`);
  });

  console.log('===========================================\n');

  // Show rollback preview
  if (state.applied.length > 0) {
    console.log('Next rollback would target:');
    console.log(`  → ${state.applied[state.applied.length - 1].filename}`);
    console.log('');
  }
}

// Execute command line directives directly if run as a target execution binary
if (require.main === module) {
  const command = process.argv[2];
  const hasFlag = (flag: string) => process.argv.includes(flag);

  if (command === 'up') {
    const dryRun = hasFlag('--dry-run');
    const allowDestructive = hasFlag('--allow-destructive');
    migrateUp(dryRun, { allowDestructive }).catch(() => process.exit(1));
  } else if (command === 'down') {
    const dryRun = hasFlag('--dry-run');
    const allowDestructive = hasFlag('--allow-destructive');
    const stepsArg = process.argv.find(arg => arg.startsWith('--steps='));
    const steps = stepsArg ? parseInt(stepsArg.split('=')[1], 10) : 1;
    migrateDown(steps, dryRun, { allowDestructive }).catch(() => process.exit(1));
  } else if (command === 'status') {
    migrationStatus();
  } else {
    console.log('Usage: ts-node migrate.ts [up | down | status] [--dry-run] [--steps=N] [--allow-destructive]');
    console.log('  up                  - Apply all pending migrations');
    console.log('  down                - Rollback the most recent migration');
    console.log('  status              - Show migration status');
    console.log('  --dry-run           - Preview changes without executing them');
    console.log('  --steps=N           - Number of migrations to rollback (default: 1)');
    console.log('  --allow-destructive - Confirm destructive operations (DROP/TRUNCATE/DELETE)');
    process.exit(1);
  }
}
