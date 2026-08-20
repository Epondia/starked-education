/**
 * Tests for migration rollback safety checks (issue #305).
 *
 * The runner (src/utils/migrate.ts) must:
 *  - require every migration to declare a rollback (down) path before applying,
 *  - guard destructive changes (DROP/TRUNCATE/DELETE) with an explicit opt-in,
 *  - never leave a half-applied state when a migration is invalid,
 *  - round-trip `up` then `down` back to the original state.
 *
 * We exercise the real runner against isolated temp directories so no database
 * or shared migration metadata is touched.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  migrateUp,
  migrateDown,
  detectDestructiveOperations,
  validateMigrationRollbackPath,
} from '../src/utils/migrate';

const CREATE_USERS_SQL = `-- UP
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY
);

-- @undo
DROP TABLE IF EXISTS users;
`;

const CREATE_COURSES_JS = `exports.up = async function (knex) {
  await knex.schema.createTable('courses', function (table) {
    table.increments('id').primary();
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('courses');
};
`;

const DESTRUCTIVE_UP_SQL = `-- UP
DROP TABLE IF EXISTS legacy_data;

-- @undo
CREATE TABLE IF NOT EXISTS legacy_data (
    id SERIAL PRIMARY KEY
);
`;

const MISSING_UNDO_SQL = `-- UP
CREATE TABLE IF NOT EXISTS missing_undo (
    id SERIAL PRIMARY KEY
);
`;

const MISSING_DOWN_JS = `exports.up = async function (knex) {
  await knex.schema.createTable('bad_migration', function (table) {
    table.increments('id').primary();
  });
};
`;

interface Fixture {
  dir: string;
  metaFile: string;
  cleanup: () => void;
}

function setupFixture(migrations: Record<string, string>): Fixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-safety-'));
  for (const [name, content] of Object.entries(migrations)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  const metaFile = path.join(dir, 'meta', '_migrations.json');
  return {
    dir,
    metaFile,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

function readState(metaFile: string): { applied: Array<{ filename: string }>; lastBatch: number } {
  return JSON.parse(fs.readFileSync(metaFile, 'utf8'));
}

describe('migration rollback safety (issue #305)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('detectDestructiveOperations', () => {
    test('detects raw SQL destructive operations with their line numbers', () => {
      const sql = `-- UP\nDROP TABLE users;\nTRUNCATE sessions;\nDELETE FROM audit_log;\n`;
      const matches = detectDestructiveOperations(sql);
      const operations = matches.map(m => m.operation);

      expect(operations).toContain('DROP TABLE');
      expect(operations).toContain('TRUNCATE');
      expect(operations).toContain('DELETE FROM');

      const drop = matches.find(m => m.operation === 'DROP TABLE');
      expect(drop).toBeDefined();
      expect(drop!.line).toBe(2);
    });

    test('detects Knex schema-builder destructive operations in JS migrations', () => {
      const js = `exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('courses');
  await knex.schema.alterTable('content', (t) => t.dropColumn('current_version'));
};`;
      const matches = detectDestructiveOperations(js);
      const operations = matches.map(m => m.operation);

      expect(operations).toContain('DROP TABLE (knex)');
      expect(operations).toContain('DROP COLUMN (knex)');
    });

    test('returns an empty list for non-destructive SQL', () => {
      expect(detectDestructiveOperations('CREATE TABLE foo (id SERIAL PRIMARY KEY);')).toEqual([]);
    });
  });

  describe('validateMigrationRollbackPath', () => {
    test('accepts SQL with a -- @undo section', () => {
      const fixture = setupFixture({ '001_ok.sql': CREATE_USERS_SQL });
      try {
        expect(() => validateMigrationRollbackPath(path.join(fixture.dir, '001_ok.sql'))).not.toThrow();
      } finally {
        fixture.cleanup();
      }
    });

    test('rejects SQL without a -- @undo section', () => {
      const fixture = setupFixture({ '001_missing.sql': MISSING_UNDO_SQL });
      try {
        expect(() => validateMigrationRollbackPath(path.join(fixture.dir, '001_missing.sql')))
          .toThrow(/rollback|@undo|DOWN/);
      } finally {
        fixture.cleanup();
      }
    });

    test('rejects JS migrations without a down function', () => {
      const fixture = setupFixture({ '001_bad.js': MISSING_DOWN_JS });
      try {
        expect(() => validateMigrationRollbackPath(path.join(fixture.dir, '001_bad.js')))
          .toThrow(/up.*down|down.*up|rollback/i);
      } finally {
        fixture.cleanup();
      }
    });

    test('accepts JS migrations with up and down functions', () => {
      const fixture = setupFixture({ '001_courses.js': CREATE_COURSES_JS });
      try {
        expect(() => validateMigrationRollbackPath(path.join(fixture.dir, '001_courses.js'))).not.toThrow();
      } finally {
        fixture.cleanup();
      }
    });
  });

  describe('migrateUp / migrateDown round-trip', () => {
    test('applies migrations then rolls them back to the original state', async () => {
      const fixture = setupFixture({
        '001_create_users.sql': CREATE_USERS_SQL,
        '002_create_courses.js': CREATE_COURSES_JS,
      });

      try {
        // Up is non-destructive, so it must succeed WITHOUT --allow-destructive.
        await migrateUp(false, { migrationsDir: fixture.dir, metaFile: fixture.metaFile });

        let state = readState(fixture.metaFile);
        expect(state.applied.map(r => r.filename)).toEqual([
          '001_create_users.sql',
          '002_create_courses.js',
        ]);

        // Rolling back the JS migration drops a table → requires opt-in.
        await migrateDown(1, false, {
          migrationsDir: fixture.dir,
          metaFile: fixture.metaFile,
          allowDestructive: true,
        });
        state = readState(fixture.metaFile);
        expect(state.applied.map(r => r.filename)).toEqual(['001_create_users.sql']);

        // Rolling back the SQL migration also drops a table → requires opt-in.
        await migrateDown(1, false, {
          migrationsDir: fixture.dir,
          metaFile: fixture.metaFile,
          allowDestructive: true,
        });
        state = readState(fixture.metaFile);
        expect(state.applied).toEqual([]);
        expect(state.lastBatch).toBe(0);
      } finally {
        fixture.cleanup();
      }
    });
  });

  describe('destructive change guard', () => {
    test('blocks a destructive up migration without --allow-destructive', async () => {
      const fixture = setupFixture({ '001_destructive.sql': DESTRUCTIVE_UP_SQL });
      try {
        await expect(
          migrateUp(false, { migrationsDir: fixture.dir, metaFile: fixture.metaFile }),
        ).rejects.toThrow(/safety check|allow-destructive/i);

        // Nothing should have been recorded (no half-applied state).
        const state = readState(fixture.metaFile);
        expect(state.applied).toEqual([]);
      } finally {
        fixture.cleanup();
      }
    });

    test('allows a destructive up migration when --allow-destructive is set', async () => {
      const fixture = setupFixture({ '001_destructive.sql': DESTRUCTIVE_UP_SQL });
      try {
        await migrateUp(false, {
          migrationsDir: fixture.dir,
          metaFile: fixture.metaFile,
          allowDestructive: true,
        });
        const state = readState(fixture.metaFile);
        expect(state.applied.map(r => r.filename)).toEqual(['001_destructive.sql']);
      } finally {
        fixture.cleanup();
      }
    });

    test('blocks a destructive down (rollback) without --allow-destructive', async () => {
      const fixture = setupFixture({ '001_create_users.sql': CREATE_USERS_SQL });
      try {
        await migrateUp(false, { migrationsDir: fixture.dir, metaFile: fixture.metaFile });

        await expect(
          migrateDown(1, false, { migrationsDir: fixture.dir, metaFile: fixture.metaFile }),
        ).rejects.toThrow(/safety check|allow-destructive/i);

        // The rollback was blocked, so the migration must still be applied.
        const state = readState(fixture.metaFile);
        expect(state.applied.map(r => r.filename)).toEqual(['001_create_users.sql']);
      } finally {
        fixture.cleanup();
      }
    });
  });

  describe('failed migration does not leave a half-applied state', () => {
    test('a migration missing its rollback path is rejected before anything is applied', async () => {
      const fixture = setupFixture({
        '001_create_users.sql': CREATE_USERS_SQL,
        '002_missing_undo.sql': MISSING_UNDO_SQL,
      });
      try {
        await expect(
          migrateUp(false, { migrationsDir: fixture.dir, metaFile: fixture.metaFile }),
        ).rejects.toThrow(/rollback|@undo|DOWN/);

        // Pre-validation fails before any migration is applied.
        const state = readState(fixture.metaFile);
        expect(state.applied).toEqual([]);
      } finally {
        fixture.cleanup();
      }
    });
  });

  describe('dry-run', () => {
    test('does not modify migration state', async () => {
      const fixture = setupFixture({ '001_create_users.sql': CREATE_USERS_SQL });
      try {
        await migrateUp(true, { migrationsDir: fixture.dir, metaFile: fixture.metaFile });
        const state = readState(fixture.metaFile);
        expect(state.applied).toEqual([]);
        expect(state.lastBatch).toBe(0);
      } finally {
        fixture.cleanup();
      }
    });
  });
});
