import { Page, expect } from '@playwright/test';

/**
 * Authentication helper utilities for StarkEd E2E tests.
 *
 * These helpers simulate user authentication flows so tests can focus
 * on verifying behavior rather than repeating login steps.
 */

export interface TestUser {
  email: string;
  password: string;
  username: string;
  role: 'student' | 'educator' | 'admin';
}

export const TEST_USERS: Record<string, TestUser> = {
  student: {
    email: 'student@starked.test',
    password: 'TestPass123!',
    username: 'teststudent',
    role: 'student',
  },
  educator: {
    email: 'educator@starked.test',
    password: 'TestPass123!',
    username: 'testeducator',
    role: 'educator',
  },
  admin: {
    email: 'admin@starked.test',
    password: 'TestPass123!',
    username: 'testadmin',
    role: 'admin',
  },
};

/**
 * Log in as a specific user type.
 * Navigates to login page, fills credentials, and submits.
 */
export async function loginAs(page: Page, userType: keyof typeof TEST_USERS): Promise<void> {
  const user = TEST_USERS[userType];

  await page.goto('/login');
  await page.waitForSelector('[data-testid="login-form"]', { timeout: 10000 });

  await page.fill('[data-testid="email-input"]', user.email);
  await page.fill('[data-testid="password-input"]', user.password);
  await page.click('[data-testid="login-submit"]');

  // Wait for successful login redirect
  await page.waitForURL('**/dashboard', { timeout: 15000 });
}

/**
 * Register a new user account.
 */
export async function registerUser(
  page: Page,
  user: TestUser,
): Promise<void> {
  await page.goto('/register');
  await page.waitForSelector('[data-testid="register-form"]', { timeout: 10000 });

  await page.fill('[data-testid="username-input"]', user.username);
  await page.fill('[data-testid="email-input"]', user.email);
  await page.fill('[data-testid="password-input"]', user.password);
  await page.fill('[data-testid="confirm-password-input"]', user.password);
  await page.click('[data-testid="register-submit"]');

  // Wait for successful registration redirect
  await page.waitForURL('**/dashboard', { timeout: 15000 });
}

/**
 * Log out the current user.
 */
export async function logout(page: Page): Promise<void> {
  await page.click('[data-testid="user-menu"]');
  await page.click('[data-testid="logout-button"]');
  await page.waitForURL('**/login', { timeout: 10000 });
}

/**
 * Assert the user is redirected to the login page (requires auth).
 */
export async function expectRequiresAuth(page: Page, targetPath: string): Promise<void> {
  await page.goto(targetPath);
  await page.waitForURL('**/login*', { timeout: 10000 });
  expect(page.url()).toContain('/login');
}
