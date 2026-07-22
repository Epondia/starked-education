import fs from 'fs';
import path from 'path';
import logger from './logger';

// Relative path configuration matching requirement spec matching schema
const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');
const META_FILE = path.join(MIGRATIONS_DIR, 'meta/_migrations.json');

interface MigrationRecord {
  filename: string;
  appliedAt: string;
  batch: number;
}

interface MigrationState {
  applied: MigrationRecord[];
  lastBatch: number;
}

function loadState(): MigrationState {
  // Default state for new installations
  const defaultState: MigrationState = { applied: [], lastBatch: 0 };

  if (!fs.existsSync(META_FILE)) {
    const parentDir = path.dirname(META_FILE);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(META_FILE, JSON.stringify(defaultState, null, 2));
    return defaultState;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));

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
      saveState(migrated);
      return migrated;
    }

    return raw as MigrationState;
  } catch (err) {
    logger.error('Failed to parse migration metadata tracking state file. Corrupted JSON structure.');
    throw err;
  }
}

function saveState(state: MigrationState): void {
  fs.writeFileSync(META_FILE, JSON.stringify(state, null, 2));
}

/** Get all migration files (.sql and .js), sorted numerically */
function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    return [];
  }
  return fs.readdirSync(MIGRATIONS_DIR)
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

export async function migrateUp(dryRun: boolean = false): Promise<void> {
  const state = loadState();
  const allFiles = getMigrationFiles();

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

  const batch = state.lastBatch + 1;
  logger.info(`Found ${pending.length} pending migrations. Starting migration process...`);
  if (dryRun) {
    logger.info('=== DRY-RUN MODE: No changes will be made ===');
  }

  for (const file of pending) {
    logger.info(`Applying migration: ${file}`);
    try {
      const filePath = path.join(MIGRATIONS_DIR, file);

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
        saveState(state);
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
): Promise<void> {
  const state = loadState();
  if (state.applied.length === 0) {
    logger.warn('No applied migrations found to roll back.');
    return;
  }

  if (dryRun) {
    logger.info('=== DRY-RUN MODE: No changes will be made ===');
  }

  const toRollback = Math.min(steps, state.applied.length);
  logger.info(`Rolling back ${toRollback} migration(s)...`);

  for (let i = 0; i < toRollback; i++) {
    const record = state.applied[state.applied.length - 1];
    const file = record.filename;
    const filePath = path.join(MIGRATIONS_DIR, file);

    logger.info(`Initiating migration rollback sequence for: ${file}`);

    try {
      if (file.endsWith('.sql')) {
        const downSql = extractDownSql(filePath);
        await executeSql(downSql, dryRun);
      } else if (file.endsWith('.js')) {
        await executeJsMigration(filePath, 'down', dryRun);
      }

      if (!dryRun) {
        state.applied.pop();
        // Decrement lastBatch if the last migration was rolled back
        if (state.applied.length === 0) {
          state.lastBatch = 0;
        }
        saveState(state);
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
  console.log(`Tracking Storage File: ${META_FILE}`);
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

  if (command === 'up') {
    const dryRun = process.argv.includes('--dry-run');
    migrateUp(dryRun).catch(() => process.exit(1));
  } else if (command === 'down') {
    const dryRun = process.argv.includes('--dry-run');
    const stepsArg = process.argv.find(arg => arg.startsWith('--steps='));
    const steps = stepsArg ? parseInt(stepsArg.split('=')[1], 10) : 1;
    migrateDown(steps, dryRun).catch(() => process.exit(1));
  } else if (command === 'status') {
    migrationStatus();
  } else {
    console.log('Usage: ts-node migrate.ts [up | down | status] [--dry-run] [--steps=N]');
    console.log('  up         - Apply all pending migrations');
    console.log('  down       - Rollback the most recent migration');
    console.log('  status     - Show migration status');
    console.log('  --dry-run  - Preview changes without executing them');
    console.log('  --steps=N  - Number of migrations to rollback (default: 1)');
    process.exit(1);
  }
}
