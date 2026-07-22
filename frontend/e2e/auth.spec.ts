import { test, expect } from '@playwright/test';
import { loginAs, registerUser, logout, expectRequiresAuth, TEST_USERS } from './helpers/auth';

test.describe('Authentication Flows', () => {
  test.describe('Registration', () => {
    test('should display registration form with all required fields', async ({ page }) => {
      await page.goto('/register');

      await expect(page.locator('[data-testid="register-form"]')).toBeVisible();
      await expect(page.locator('[data-testid="username-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="confirm-password-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="register-submit"]')).toBeVisible();
    });

    test('should show validation errors for empty form submission', async ({ page }) => {
      await page.goto('/register');
      await page.click('[data-testid="register-submit"]');

      // Should show validation errors
      await expect(page.locator('[data-testid="field-error"]').first()).toBeVisible();
    });

    test('should show error for mismatched passwords', async ({ page }) => {
      await page.goto('/register');

      await page.fill('[data-testid="username-input"]', 'newuser');
      await page.fill('[data-testid="email-input"]', 'newuser@test.com');
      await page.fill('[data-testid="password-input"]', 'Password123!');
      await page.fill('[data-testid="confirm-password-input"]', 'DifferentPassword123!');
      await page.click('[data-testid="register-submit"]');

      await expect(page.locator('text=Passwords do not match')).toBeVisible();
    });

    test('should show error for weak password', async ({ page }) => {
      await page.goto('/register');

      await page.fill('[data-testid="username-input"]', 'newuser');
      await page.fill('[data-testid="email-input"]', 'newuser@test.com');
      await page.fill('[data-testid="password-input"]', '123');
      await page.fill('[data-testid="confirm-password-input"]', '123');
      await page.click('[data-testid="register-submit"]');

      await expect(page.locator('[data-testid="field-error"]').first()).toBeVisible();
    });

    test('should successfully register a new student account', async ({ page }) => {
      const uniqueUser = {
        ...TEST_USERS.student,
        email: `test-${Date.now()}@starked.test`,
        username: `student-${Date.now()}`,
      };

      await registerUser(page, uniqueUser);

      // Should be redirected to dashboard after registration
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(page.locator('[data-testid="welcome-message"]')).toBeVisible();
    });
  });

  test.describe('Login', () => {
    test('should display login form with email and password fields', async ({ page }) => {
      await page.goto('/login');

      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
      await expect(page.locator('[data-testid="email-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="password-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="login-submit"]')).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.fill('[data-testid="email-input"]', 'wrong@email.com');
      await page.fill('[data-testid="password-input"]', 'WrongPassword123!');
      await page.click('[data-testid="login-submit"]');

      await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
    });

    test('should successfully log in with valid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.fill('[data-testid="email-input"]', TEST_USERS.student.email);
      await page.fill('[data-testid="password-input"]', TEST_USERS.student.password);
      await page.click('[data-testid="login-submit"]');

      await page.waitForURL('**/dashboard', { timeout: 15000 });
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });

    test('should redirect to originally requested page after login', async ({ page }) => {
      // Try to access a protected page
      await page.goto('/profile');
      await page.waitForURL('**/login*', { timeout: 10000 });

      // Login
      await page.fill('[data-testid="email-input"]', TEST_USERS.student.email);
      await page.fill('[data-testid="password-input"]', TEST_USERS.student.password);
      await page.click('[data-testid="login-submit"]');

      // Should redirect back to profile
      await page.waitForURL('**/profile', { timeout: 15000 });
    });
  });

  test.describe('Logout', () => {
    test('should successfully log out and redirect to login', async ({ page }) => {
      await loginAs(page, 'student');
      await logout(page);

      await expect(page).toHaveURL(/\/login/);
    });

    test('should clear session on logout', async ({ page }) => {
      await loginAs(page, 'student');
      await logout(page);

      // Try to access protected page after logout
      await expectRequiresAuth(page, '/profile');
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect unauthenticated users to login', async ({ page }) => {
      await expectRequiresAuth(page, '/profile');
    });

    test('should redirect unauthenticated users from admin pages', async ({ page }) => {
      await expectRequiresAuth(page, '/admin');
    });

    test('should allow authenticated users to access protected pages', async ({ page }) => {
      await loginAs(page, 'student');
      await page.goto('/profile');
      await expect(page.locator('[data-testid="profile-page"]')).toBeVisible();
    });
  });
});
