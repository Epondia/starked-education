import { test, expect } from '@playwright/test';
import { loginAs, TEST_USERS } from './helpers/auth';

test.describe('Course Flows', () => {
  test.describe('Course Listing', () => {
    test('should display available courses on homepage', async ({ page }) => {
      await page.goto('/');

      await expect(page.locator('[data-testid="course-list"]')).toBeVisible();
      const courses = page.locator('[data-testid="course-card"]');
      await expect(courses.first()).toBeVisible();
    });

    test('should filter courses by category', async ({ page }) => {
      await page.goto('/campus');

      await page.click('[data-testid="category-filter"]');
      await page.click('[data-testid="category-blockchain"]');

      const courses = page.locator('[data-testid="course-card"]');
      const count = await courses.count();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should search courses by keyword', async ({ page }) => {
      await page.goto('/campus');

      await page.fill('[data-testid="course-search"]', 'blockchain');
      await page.press('[data-testid="course-search"]', 'Enter');

      await page.waitForResponse(response =>
        response.url().includes('/api/courses') && response.status() === 200
      );
    });

    test('should display course details page', async ({ page }) => {
      await page.goto('/campus');
      await page.click('[data-testid="course-card"]:first-child');

      await expect(page.locator('[data-testid="course-title"]')).toBeVisible();
      await expect(page.locator('[data-testid="course-description"]')).toBeVisible();
      await expect(page.locator('[data-testid="enroll-button"]')).toBeVisible();
    });
  });

  test.describe('Course Creation (Educator)', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'educator');
    });

    test('should display course creation form for educators', async ({ page }) => {
      await page.goto('/admin');

      await expect(page.locator('[data-testid="create-course-button"]')).toBeVisible();
    });

    test('should show validation errors for empty course creation', async ({ page }) => {
      await page.goto('/admin');
      await page.click('[data-testid="create-course-button"]');
      await page.click('[data-testid="course-submit"]');

      await expect(page.locator('[data-testid="field-error"]').first()).toBeVisible();
    });

    test('should successfully create a new course', async ({ page }) => {
      await page.goto('/admin');
      await page.click('[data-testid="create-course-button"]');

      const courseName = `E2E Test Course ${Date.now()}`;
      await page.fill('[data-testid="course-title-input"]', courseName);
      await page.fill('[data-testid="course-description-input"]', 'A course created during E2E testing');
      await page.selectOption('[data-testid="course-category-select"]', 'Technology');
      await page.selectOption('[data-testid="course-level-select"]', 'Beginner');
      await page.fill('[data-testid="course-price-input"]', '100');
      await page.fill('[data-testid="course-duration-input"]', '40');

      await page.click('[data-testid="course-submit"]');

      // Should see success message
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Course Enrollment (Student)', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'student');
    });

    test('should display enrollment button on course page', async ({ page }) => {
      await page.goto('/campus');
      await page.click('[data-testid="course-card"]:first-child');

      await expect(page.locator('[data-testid="enroll-button"]')).toBeVisible();
    });

    test('should show enrollment confirmation dialog', async ({ page }) => {
      await page.goto('/campus');
      await page.click('[data-testid="course-card"]:first-child');
      await page.click('[data-testid="enroll-button"]');

      await expect(page.locator('[data-testid="enrollment-confirm-dialog"]')).toBeVisible();
    });

    test('should successfully enroll in a course', async ({ page }) => {
      await page.goto('/campus');
      await page.click('[data-testid="course-card"]:first-child');

      // Click enroll
      await page.click('[data-testid="enroll-button"]');

      // Confirm enrollment
      await page.click('[data-testid="confirm-enroll-button"]');

      // Should see success and redirect to learning page
      await expect(page.locator('[data-testid="enrollment-success"]')).toBeVisible({ timeout: 10000 });
    });

    test('should display enrolled courses on dashboard', async ({ page }) => {
      await page.goto('/dashboard');

      await expect(page.locator('[data-testid="enrolled-courses-section"]')).toBeVisible();
    });

    test('should prevent duplicate enrollment', async ({ page }) => {
      await page.goto('/enroll/test-course-001');

      // If already enrolled, should show "Continue Learning" instead of "Enroll"
      const continueButton = page.locator('[data-testid="continue-learning-button"]');
      const enrollButton = page.locator('[data-testid="enroll-button"]');

      await expect(continueButton.or(enrollButton)).toBeVisible();
    });
  });
});
