/**
 * CourseStore — PostgreSQL-backed course catalog for the listing endpoint.
 *
 * Replaces the generated mock items in `routes/courses.js`'s `GET /`
 * handler (issue #391). The schema is defined in
 * `migrations/005_create_courses.sql`; because the repo's migration runner
 * validates but does not execute migrations, the store self-provisions the
 * table with an idempotent `CREATE TABLE IF NOT EXISTS` on first use (the
 * same pattern `seed.ts` uses).
 */

const { query } = require('../utils/database');

const COURSE_COLUMNS =
  'id, title, short_description, description, category, level, language, ' +
  'duration_hours, price, rating, review_count, enrollment_count, provider, ' +
  'thumbnail, tags, skills';

// Sort options accepted by the listing schema, mapped to ORDER BY clauses.
// `relevance` has no search index to back it yet, so it falls back to a
// deterministic quality ordering (rating, then review volume) — documented
// rather than faked.
const SORT_ORDERS = {
  relevance: 'rating DESC, review_count DESC',
  newest: 'created_at DESC',
  popular: 'enrollment_count DESC',
  rating: 'rating DESC',
  duration: 'duration_hours ASC',
  'price-low': 'price ASC',
  'price-high': 'price DESC',
};

// One-time schema bootstrap, memoized so concurrent first requests share a
// single DDL run.
let schemaReadyPromise = null;

function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = query(`
      CREATE TABLE IF NOT EXISTS courses (
        id UUID PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        short_description TEXT,
        description TEXT,
        category VARCHAR(100),
        level VARCHAR(50),
        language VARCHAR(10) NOT NULL DEFAULT 'en',
        duration_hours NUMERIC(5, 1) NOT NULL DEFAULT 0,
        price NUMERIC(10, 2) NOT NULL DEFAULT 0,
        rating NUMERIC(3, 2) NOT NULL DEFAULT 0,
        review_count INTEGER NOT NULL DEFAULT 0,
        enrollment_count INTEGER NOT NULL DEFAULT 0,
        provider VARCHAR(200),
        thumbnail TEXT NOT NULL DEFAULT '',
        tags TEXT[] NOT NULL DEFAULT '{}',
        skills TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

/**
 * List courses with the same filter/pagination semantics the mock generator
 * simulated: full-text-ish search on title/description, category and level
 * filters, a validated sort key, and offset pagination. Returns raw rows plus
 * the total count; callers map rows to the API response shape.
 */
async function listCourses({
  q,
  categories = [],
  levels = [],
  sort = 'relevance',
  offset = 0,
  limit = 12,
}) {
  await ensureSchema();

  const where = [];
  const values = [];

  if (q) {
    values.push(`%${q}%`);
    where.push(
      `(title ILIKE $${values.length} OR short_description ILIKE $${values.length} OR description ILIKE $${values.length})`,
    );
  }
  if (categories.length > 0) {
    values.push(categories);
    where.push(`category = ANY($${values.length})`);
  }
  if (levels.length > 0) {
    values.push(levels);
    where.push(`level = ANY($${values.length})`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = SORT_ORDERS[sort] || SORT_ORDERS.relevance;

  const [itemsResult, countResult] = await Promise.all([
    query(
      `SELECT ${COURSE_COLUMNS} FROM courses ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM courses ${whereClause}`, values),
  ]);

  return {
    items: itemsResult.rows,
    total: countResult.rows[0]?.total || 0,
  };
}

module.exports = {
  listCourses,
};
