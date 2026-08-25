/**
 * Unit tests for the Postgres-backed user store (issue #390).
 *
 * The `../utils/database` module is mocked with a tiny in-memory fake so the
 * SQL the store issues can be asserted without a live Postgres instance.
 */

jest.mock('../../utils/database', () => {
  const store = new Map();
  const query = jest.fn(async (text, params = []) => {
    // Schema bootstrap — no-op.
    if (/CREATE TABLE IF NOT EXISTS users/i.test(text)) {
      return { rows: [] };
    }

    if (/^INSERT INTO users/i.test(text)) {
      const [id, username, email, password, role] = params;
      if (
        Array.from(store.values()).some(
          (u) => u.username === username || u.email === email,
        )
      ) {
        const error = new Error('duplicate key value violates unique constraint');
        error.code = '23505';
        throw error;
      }
      const now = new Date();
      const row = { id, username, email, password, role, created_at: now, updated_at: now };
      store.set(id, row);
      return { rows: [row] };
    }

    if (/^UPDATE users/i.test(text)) {
      const id = params[params.length - 1];
      const existing = store.get(id);
      if (!existing) return { rows: [] };
      const updates = Object.fromEntries(
        params.slice(0, -1).map((value, index) => [
          text.match(/(?:username|email|password|role) = \$\d+/g)[index].split(' ')[0],
          value,
        ]),
      );
      const updated = { ...existing, ...updates, updated_at: new Date() };
      store.set(id, updated);
      return { rows: [updated] };
    }

    if (/^DELETE FROM users/i.test(text)) {
      const id = params[0];
      const existed = store.delete(id);
      return { rows: existed ? [{ id }] : [] };
    }

    if (/COUNT\(\*\)/.test(text)) {
      const whereRole = /role = \$\d+/.test(text);
      const total = whereRole
        ? Array.from(store.values()).filter((u) => u.role === params[0]).length
        : store.size;
      return { rows: [{ total }] };
    }

    if (/^SELECT/.test(text)) {
      const idFilter = /id = \$1/.test(text);
      if (idFilter) {
        const row = store.get(params[0]);
        return { rows: row ? [row] : [] };
      }
      const orFilter = /username = \$1 OR email = \$1/.test(text);
      if (orFilter) {
        const row = Array.from(store.values()).find(
          (u) => u.username === params[0] || u.email === params[0],
        );
        return { rows: row ? [row] : [] };
      }
      const usernameFilter = /username = \$1/.test(text);
      if (usernameFilter) {
        const row = Array.from(store.values()).find((u) => u.username === params[0]);
        return { rows: row ? [row] : [] };
      }
      const emailFilter = /email = \$1/.test(text);
      if (emailFilter) {
        const row = Array.from(store.values()).find((u) => u.email === params[0]);
        return { rows: row ? [row] : [] };
      }
      // List query: filter by role if a WHERE clause references a role param.
      let rows = Array.from(store.values());
      if (/WHERE role = \$\d+/.test(text) && params[0]) {
        rows = rows.filter((u) => u.role === params[0]);
      }
      const limit = params[params.length - 2];
      const offset = params[params.length - 1];
      return { rows: rows.slice(offset, offset + limit) };
    }

    return { rows: [] };
  });

  return { query };
});

const userStore = require('../userStore');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('userStore (issue #390)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createUser stores a uuid id and maps snake_case rows to camelCase', async () => {
    const user = await userStore.createUser({
      username: 'alice',
      email: 'alice@example.com',
      password: 'hashed-password',
      role: 'student',
    });

    expect(user.id).toMatch(UUID_RE);
    expect(user.username).toBe('alice');
    expect(user.email).toBe('alice@example.com');
    expect(user.password).toBe('hashed-password');
    expect(user.role).toBe('student');
    expect(user.createdAt).toEqual(expect.any(String));
    expect(user.updatedAt).toEqual(expect.any(String));
  });

  test('generate unique ids for concurrent registrations', async () => {
    const [a, b] = await Promise.all([
      userStore.createUser({
        username: 'a',
        email: 'a@example.com',
        password: 'x',
        role: 'student',
      }),
      userStore.createUser({
        username: 'b',
        email: 'b@example.com',
        password: 'x',
        role: 'student',
      }),
    ]);
    expect(a.id).not.toBe(b.id);
  });

  test('createUser rejects duplicate username/email with a 23505 unique violation', async () => {
    await userStore.createUser({
      username: 'alice',
      email: 'alice@example.com',
      password: 'x',
      role: 'student',
    });
    await expect(
      userStore.createUser({
        username: 'alice',
        email: 'other@example.com',
        password: 'x',
        role: 'student',
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  test('findByUsernameOrEmail matches username or email', async () => {
    await userStore.createUser({
      username: 'bob',
      email: 'bob@example.com',
      password: 'x',
      role: 'educator',
    });

    const byUsername = await userStore.findByUsernameOrEmail('bob');
    const byEmail = await userStore.findByUsernameOrEmail('bob@example.com');
    const missing = await userStore.findByUsernameOrEmail('nobody');

    expect(byUsername.username).toBe('bob');
    expect(byEmail.username).toBe('bob');
    expect(missing).toBeNull();
  });

  test('findById and findById for unknown ids return null', async () => {
    const created = await userStore.createUser({
      username: 'carol',
      email: 'carol@example.com',
      password: 'x',
      role: 'student',
    });
    const found = await userStore.findById(created.id);
    expect(found.id).toBe(created.id);
    expect(await userStore.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  test('findByUsername/findByEmail support excludeId for conflict checks', async () => {
    const user = await userStore.createUser({
      username: 'dave',
      email: 'dave@example.com',
      password: 'x',
      role: 'student',
    });
    // Excluding the owner's own row returns null (the check passes).
    expect(await userStore.findByUsername('dave', user.id)).toBeNull();
    expect(await userStore.findByEmail('dave@example.com', user.id)).toBeNull();
    // Without exclusion the same row is found (the check fails).
    expect((await userStore.findByUsername('dave')).id).toBe(user.id);
  });

  test('updateUser persists only changed fields and bumps updated_at', async () => {
    const created = await userStore.createUser({
      username: 'erin',
      email: 'erin@example.com',
      password: 'old-hash',
      role: 'student',
    });

    const before = Date.parse(created.updatedAt);
    const updated = await userStore.updateUser(created.id, { role: 'admin' });
    const after = Date.parse(updated.updatedAt);

    expect(updated.role).toBe('admin');
    expect(updated.username).toBe('erin');
    expect(updated.password).toBe('old-hash');
    expect(after).toBeGreaterThanOrEqual(before);

    const reloaded = await userStore.findById(created.id);
    expect(reloaded.role).toBe('admin');
  });

  test('listUsers applies role filter and pagination', async () => {
    await userStore.createUser({
      username: 'f1',
      email: 'f1@example.com',
      password: 'x',
      role: 'student',
    });
    await userStore.createUser({
      username: 'f2',
      email: 'f2@example.com',
      password: 'x',
      role: 'student',
    });
    await userStore.createUser({
      username: 'f3',
      email: 'f3@example.com',
      password: 'x',
      role: 'admin',
    });

    const all = await userStore.listUsers({ page: 1, limit: 10 });
    expect(all.total).toBe(3);
    expect(all.users).toHaveLength(3);

    const students = await userStore.listUsers({ role: 'student', page: 1, limit: 1 });
    expect(students.total).toBe(2);
    expect(students.users).toHaveLength(1);
  });

  test('deleteUser removes the row and reports existence', async () => {
    const created = await userStore.createUser({
      username: 'grace',
      email: 'grace@example.com',
      password: 'x',
      role: 'student',
    });
    expect(await userStore.deleteUser(created.id)).toBe(true);
    expect(await userStore.findById(created.id)).toBeNull();
    expect(await userStore.deleteUser(created.id)).toBe(false);
  });
});
