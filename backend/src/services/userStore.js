/**
 * UserStore — PostgreSQL-backed persistence for application user accounts.
 *
 * Replaces the module-level in-memory `Map` that previously lived in
 * `routes/auth.js`, so registered users, password hashes and role
 * assignments survive process restarts and redeploys (issue #390).
 *
 * The schema is defined in `migrations/005_create_users.sql`. Because the
 * repo's migration runner only validates/tracks migrations (it does not
 * execute them), the store self-provisions the table with an idempotent
 * `CREATE TABLE IF NOT EXISTS` on first use — the same pattern `seed.ts`
 * uses — so the endpoints work on any fresh database.
 *
 * IDs are generated with `crypto.randomUUID()` instead of
 * `Date.now().toString()`, which produced duplicate ids for concurrent
 * registrations in the same millisecond.
 */

const crypto = require('crypto');
const { query } = require('../utils/database');

// Columns selected for every read, in a fixed order so RETURNING rows and
// SELECT rows map through the same code path.
const USER_COLUMNS = 'id, username, email, password, role, created_at, updated_at';

// One-time schema bootstrap. Memoized as a promise so concurrent first
// requests share a single DDL run instead of racing each other.
let schemaReadyPromise = null;

function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'student',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `).catch((error) => {
      // Allow a retry on the next request rather than permanently wedging
      // the module on a transient connection failure.
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

/**
 * Map a Postgres row (snake_case) to the camelCase shape the auth routes
 * previously stored in the in-memory Map, so response bodies are unchanged.
 */
function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    password: row.password,
    role: row.role,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

/**
 * Create a user. Returns the stored row (including the password hash).
 * Throws a Postgres unique-violation error (code 23505) if the username or
 * email already exists — callers map that to a 409.
 */
async function createUser({ username, email, password, role }) {
  await ensureSchema();
  const id = crypto.randomUUID();
  const { rows } = await query(
    `INSERT INTO users (id, username, email, password, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${USER_COLUMNS}`,
    [id, username, email, password, role],
  );
  return rowToUser(rows[0]);
}

/** Find a user by username OR email (used by login and register checks). */
async function findByUsernameOrEmail(value) {
  await ensureSchema();
  const { rows } = await query(
    `SELECT ${USER_COLUMNS} FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
    [value],
  );
  return rowToUser(rows[0] || null);
}

/** Find a user by id (used by profile, assign-role and delete handlers). */
async function findById(id) {
  await ensureSchema();
  const { rows } = await query(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return rowToUser(rows[0] || null);
}

/**
 * Find a user by username. Pass `excludeId` to ignore the caller's own row
 * when checking whether a username is taken during a profile update.
 */
async function findByUsername(username, excludeId) {
  await ensureSchema();
  const { rows } = excludeId
    ? await query(
        `SELECT ${USER_COLUMNS} FROM users WHERE username = $1 AND id <> $2 LIMIT 1`,
        [username, excludeId],
      )
    : await query(`SELECT ${USER_COLUMNS} FROM users WHERE username = $1 LIMIT 1`, [username]);
  return rowToUser(rows[0] || null);
}

/** Find a user by email. Pass `excludeId` to ignore the caller's own row. */
async function findByEmail(email, excludeId) {
  await ensureSchema();
  const { rows } = excludeId
    ? await query(
        `SELECT ${USER_COLUMNS} FROM users WHERE email = $1 AND id <> $2 LIMIT 1`,
        [email, excludeId],
      )
    : await query(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1 LIMIT 1`, [email]);
  return rowToUser(rows[0] || null);
}

/**
 * Update a user's fields. Only whitelisted columns are accepted; `updated_at`
 * is bumped automatically. Returns the updated row (or null if not found).
 */
async function updateUser(id, fields) {
  await ensureSchema();
  const allowed = ['username', 'email', 'password', 'role'];
  const sets = [];
  const values = [];

  for (const column of allowed) {
    if (fields[column] !== undefined) {
      values.push(fields[column]);
      sets.push(`${column} = $${values.length}`);
    }
  }

  if (sets.length === 0) {
    return findById(id);
  }

  values.push(id);
  sets.push('updated_at = CURRENT_TIMESTAMP');
  const { rows } = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${USER_COLUMNS}`,
    values,
  );
  return rowToUser(rows[0] || null);
}

/** Delete a user by id. Returns true when a row was removed. */
async function deleteUser(id) {
  await ensureSchema();
  const { rows } = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

/**
 * List users with optional role filter and offset pagination. Returns the
 * full rows (including password hashes); callers strip what they expose.
 */
async function listUsers({ role, page = 1, limit = 10 } = {}) {
  await ensureSchema();
  const offset = (page - 1) * limit;
  const where = [];
  const values = [];

  if (role) {
    values.push(role);
    where.push(`role = $${values.length}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const [rowsResult, countResult] = await Promise.all([
    query(
      `SELECT ${USER_COLUMNS} FROM users ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM users ${whereClause}`, values),
  ]);

  return {
    users: rowsResult.rows.map(rowToUser),
    total: countResult.rows[0]?.total || 0,
  };
}

module.exports = {
  createUser,
  findByUsernameOrEmail,
  findById,
  findByUsername,
  findByEmail,
  updateUser,
  deleteUser,
  listUsers,
};
