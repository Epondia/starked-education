/**
 * Unit tests for the Postgres-backed course store (issue #391).
 *
 * `../utils/database` is mocked with a tiny in-memory fake so the filter /
 * sort / pagination SQL the store issues can be exercised without a live
 * Postgres instance.
 */

jest.mock('../../utils/database', () => {
  const store = [];
  let nextId = 1;

  const query = jest.fn(async (text, params = []) => {
    // Test-only hook to reset the in-memory table between tests.
    if (text === '__CLEAR__') {
      store.length = 0;
      nextId = 1;
      return { rows: [] };
    }

    if (/CREATE TABLE IF NOT EXISTS courses/i.test(text)) {
      return { rows: [] };
    }

    if (/^INSERT INTO courses/i.test(text)) {
      const [title, category, level, rating, enrollmentCount] = params;
      store.push({
        id: `course_${nextId++}`,
        title,
        category,
        level,
        rating,
        enrollment_count: enrollmentCount,
      });
      return { rows: [] };
    }

    if (/COUNT\(\*\)/.test(text)) {
      let rows = [...store];
      rows = applyWhere(rows, text, params);
      return { rows: [{ total: rows.length }] };
    }

    if (/^SELECT/.test(text)) {
      let rows = applyWhere([...store], text, params);

      const orderMatch = text.match(/ORDER BY (\w+(?:, \w+)?(?: (?:DESC|ASC))?)/);
      if (orderMatch) {
        const [col, dir] = orderMatch[1].split(',')[0].trim().split(' ');
        rows.sort((a, b) => {
          const cmp = (a[col] ?? 0) < (b[col] ?? 0) ? -1 : (a[col] ?? 0) > (b[col] ?? 0) ? 1 : 0;
          return dir === 'DESC' ? -cmp : cmp;
        });
      }

      const limit = params[params.length - 2];
      const offset = params[params.length - 1];
      return { rows: rows.slice(offset, offset + limit) };
    }

    return { rows: [] };
  });

  function applyWhere(rows, text, params) {
    let paramIndex = 0;
    if (/title ILIKE \$1/.test(text)) {
      const pattern = params[paramIndex++].replace(/%/g, '');
      rows = rows.filter(
        (r) =>
          (r.title || '').toLowerCase().includes(pattern.toLowerCase()) ||
          (r.description || '').toLowerCase().includes(pattern.toLowerCase()),
      );
    }
    const catMatch = text.match(/category = ANY\(\$(\d+)\)/);
    if (catMatch) {
      const cats = params[Number(catMatch[1]) - 1];
      rows = rows.filter((r) => cats.includes(r.category));
    }
    const levelMatch = text.match(/level = ANY\(\$(\d+)\)/);
    if (levelMatch) {
      const levels = params[Number(levelMatch[1]) - 1];
      rows = rows.filter((r) => levels.includes(r.level));
    }
    return rows;
  }

  return { query };
});

const courseStore = require('../courseStore');

async function seedCourse({ title, category, level, rating = 3.0, enrollmentCount = 10 }) {
  const { query } = require('../../utils/database');
  await query('INSERT INTO courses', [title, category, level, rating, enrollmentCount]);
}

describe('courseStore (issue #391)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const { query } = require('../../utils/database');
    await query('__CLEAR__');
    // Seed a small catalog through the fake query layer.
    await seedCourse({ title: 'Blockchain Basics', category: 'blockchain', level: 'beginner', rating: 4.7, enrollmentCount: 500 });
    await seedCourse({ title: 'Web3 Fundamentals', category: 'web3', level: 'beginner', rating: 4.2, enrollmentCount: 300 });
    await seedCourse({ title: 'Smart Contract Auditing', category: 'smart-contracts', level: 'advanced', rating: 4.9, enrollmentCount: 120 });
    await seedCourse({ title: 'DeFi Yield Strategies', category: 'defi', level: 'intermediate', rating: 3.8, enrollmentCount: 900 });
  });

  test('returns all rows and the total when no filters are applied', async () => {
    const result = await courseStore.listCourses({ limit: 10 });
    expect(result.total).toBe(4);
    expect(result.items).toHaveLength(4);
  });

  test('filters by search query across title fields', async () => {
    const result = await courseStore.listCourses({ q: 'blockchain', limit: 10 });
    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe('Blockchain Basics');
  });

  test('filters by category list', async () => {
    const result = await courseStore.listCourses({ categories: ['web3', 'defi'], limit: 10 });
    expect(result.total).toBe(2);
    expect(result.items.map((c) => c.title).sort()).toEqual([
      'DeFi Yield Strategies',
      'Web3 Fundamentals',
    ]);
  });

  test('filters by level list', async () => {
    const result = await courseStore.listCourses({ levels: ['beginner'], limit: 10 });
    expect(result.total).toBe(2);
    expect(result.items.map((c) => c.title)).toEqual(
      expect.arrayContaining(['Blockchain Basics', 'Web3 Fundamentals']),
    );
  });

  test('combines query, category and level filters', async () => {
    const result = await courseStore.listCourses({
      q: 'smart',
      categories: ['smart-contracts'],
      levels: ['advanced'],
      limit: 10,
    });
    expect(result.total).toBe(1);
    expect(result.items[0].title).toBe('Smart Contract Auditing');
  });

  test('sorts by the requested key (popular = enrollment desc)', async () => {
    const result = await courseStore.listCourses({ sort: 'popular', limit: 10 });
    expect(result.items[0].title).toBe('DeFi Yield Strategies');
    expect(result.items[1].title).toBe('Blockchain Basics');
  });

  test('applies offset pagination', async () => {
    const page1 = await courseStore.listCourses({ limit: 2, offset: 0 });
    const page2 = await courseStore.listCourses({ limit: 2, offset: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    const ids = [...page1.items, ...page2.items].map((c) => c.id);
    expect(new Set(ids).size).toBe(4);
  });

  test('returns an honest empty result for an empty table', async () => {
    const { query } = require('../../utils/database');
    await query('__CLEAR__');
    const result = await courseStore.listCourses({ limit: 10 });
    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
  });
});
