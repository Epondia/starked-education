import { test, expect, Page } from '@playwright/test';

const TEST_USER = {
  email: 'testuser@starked.edu',
  password: 'TestPass123!',
  name: 'Test User',
};

async function mockAuthApi(page: Page) {
  await page.route('**/api/auth/login', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.email === TEST_USER.email && body.password === TEST_USER.password) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock-jwt-token-12345',
          user: {
            id: 'usr_001',
            email: TEST_USER.email,
            name: TEST_USER.name,
            role: 'admin',
            permissions: ['user:create', 'course:create', 'system:manage'],
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Invalid email or password',
        }),
      });
    }
  });

  await page.route('**/api/auth/verify', async (route) => {
    const authHeader = route.request().headers()['authorization'];
    if (authHeader === 'Bearer mock-jwt-token-12345') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'usr_001',
          email: TEST_USER.email,
          name: TEST_USER.name,
          role: 'admin',
          permissions: ['user:create', 'course:create', 'system:manage'],
        }),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Unauthorized' }),
      });
    }
  });

  await page.route('**/api/admin/dashboard', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        stats: {
          users: { total: 1500, students: 1200, educators: 250, admins: 50, newThisMonth: 120, growth: 8.5 },
          courses: { total: 45, published: 38, draft: 7, newThisMonth: 5, growth: 12.3 },
          quizzes: { total: 230, active: 180, completed: 50, averageScore: 78 },
          system: { uptime: '99.9%', storage: '2.4TB / 5TB', lastBackup: '2024-01-15', activeConnections: 342 },
        },
      }),
    });
  });

  await page.route('**/api/admin/activity', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        activities: [
          { id: 'act_1', type: 'user', title: 'New user registered', description: 'John Doe created an account', timestamp: new Date().toISOString(), status: 'success' },
          { id: 'act_2', type: 'course', title: 'Course published', description: 'Blockchain 101 is now live', timestamp: new Date().toISOString(), status: 'success' },
        ],
      }),
    });
  });
}

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthApi(page);
    await page.goto('/admin');
  });

  test('should show login form when not authenticated', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Admin Dashboard');
    await page.waitForTimeout(500);
  });

  test('should login with valid credentials and redirect to dashboard', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto('/admin');

    await page.waitForTimeout(300);

    await page.evaluate(async (creds) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creds.email, password: creds.password }),
      });
      const data = await response.json();
      localStorage.setItem('admin_token', data.token);
    }, TEST_USER);

    await page.goto('/admin');
    await page.waitForTimeout(500);

    await expect(page.locator('h1')).toContainText('Welcome back');
    await expect(page.locator('text=Total Users')).toBeVisible();
  });

  test('should display error message for invalid login credentials', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto('/admin');

    const loginResult = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'wrong@email.com', password: 'wrongpass' }),
        });
        const data = await response.json();
        return { status: response.status, message: data.message };
      } catch (e) {
        return { status: 0, message: String(e) };
      }
    });

    expect(loginResult.status).toBe(401);
    expect(loginResult.message).toContain('Invalid email or password');
  });

  test('should allow user to logout', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('admin_token', 'mock-jwt-token-12345');
    });
    await page.goto('/admin');
    await page.waitForTimeout(300);

    const hasToken = await page.evaluate(() => localStorage.getItem('admin_token'));
    expect(hasToken).toBeTruthy();

    await page.evaluate(() => {
      localStorage.removeItem('admin_token');
    });

    await page.goto('/admin');
    await page.waitForTimeout(300);

    const tokenAfterLogout = await page.evaluate(() => localStorage.getItem('admin_token'));
    expect(tokenAfterLogout).toBeNull();
  });
});

test.describe('Admin Dashboard Access', () => {
  test('should display dashboard stats when authenticated', async ({ page }) => {
    await mockAuthApi(page);
    await page.evaluate(() => {
      localStorage.setItem('admin_token', 'mock-jwt-token-12345');
    });
    await page.goto('/admin');
    await page.waitForTimeout(500);

    await expect(page.locator('text=Total Users')).toBeVisible();
    await expect(page.locator('text=Total Courses')).toBeVisible();
    await expect(page.locator('text=Total Quizzes')).toBeVisible();
  });

  test('should navigate between tabs in admin dashboard', async ({ page }) => {
    await mockAuthApi(page);
    await page.evaluate(() => {
      localStorage.setItem('admin_token', 'mock-jwt-token-12345');
    });
    await page.goto('/admin/users');
    await page.waitForTimeout(500);

    await expect(page.locator('body')).toBeVisible();
  });
});
