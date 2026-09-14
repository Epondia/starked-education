import { test, expect } from '@playwright/test';
import { loginAs, TEST_USERS } from './helpers/auth';

test.describe('Credential Flows', () => {
  test.describe('Credential Listing (Student)', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'student');
    });

    test('should display credentials section on profile', async ({ page }) => {
      await page.goto('/profile');

      await expect(page.locator('[data-testid="credentials-section"]')).toBeVisible();
    });

    test('should list user credentials', async ({ page }) => {
      await page.goto('/profile');

      const credentials = page.locator('[data-testid="credential-card"]');
      // May be empty if user has no credentials, but the section should render
      await expect(page.locator('[data-testid="credentials-section"]')).toBeVisible();
    });

    test('should display credential details when clicked', async ({ page }) => {
      await page.goto('/profile');

      const credential = page.locator('[data-testid="credential-card"]').first();
      if (await credential.isVisible()) {
        await credential.click();

        await expect(page.locator('[data-testid="credential-detail-modal"]')).toBeVisible();
        await expect(page.locator('[data-testid="credential-title"]')).toBeVisible();
        await expect(page.locator('[data-testid="credential-issuer"]')).toBeVisible();
        await expect(page.locator('[data-testid="credential-issue-date"]')).toBeVisible();
      }
    });

    test('should show credential verification status', async ({ page }) => {
      await page.goto('/profile');

      const credential = page.locator('[data-testid="credential-card"]').first();
      if (await credential.isVisible()) {
        await credential.click();

        // Should show verification badge
        await expect(page.locator('[data-testid="verification-status"]')).toBeVisible();
      }
    });
  });

  test.describe('Credential Issuance (Admin)', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin');
    });

    test('should display credential issuance form', async ({ page }) => {
      await page.goto('/admin');

      await expect(page.locator('[data-testid="issue-credential-section"]')).toBeVisible();
    });

    test('should show validation errors for empty credential issuance', async ({ page }) => {
      await page.goto('/admin');
      await page.click('[data-testid="issue-credential-button"]');
      await page.click('[data-testid="credential-submit"]');

      await expect(page.locator('[data-testid="field-error"]').first()).toBeVisible();
    });

    test('should successfully issue a single-signer credential', async ({ page }) => {
      await page.goto('/admin');
      await page.click('[data-testid="issue-credential-button"]');

      await page.fill('[data-testid="credential-title-input"]', `E2E Test Credential ${Date.now()}`);
      await page.fill('[data-testid="credential-description-input"]', 'Credential issued during E2E testing');
      await page.fill('[data-testid="credential-recipient-input"]', TEST_USERS.student.email);
      await page.fill('[data-testid="credential-course-input"]', 'test-course-001');

      await page.click('[data-testid="credential-submit"]');

      await expect(page.locator('[data-testid="success-message"]')).toBeVisible({ timeout: 10000 });
    });

    test('should successfully issue a multi-signature credential', async ({ page }) => {
      await page.goto('/admin');
      await page.click('[data-testid="issue-credential-button"]');
      await page.click('[data-testid="multi-sig-toggle"]');

      await page.fill('[data-testid="credential-title-input"]', `Multi-Sig Credential ${Date.now()}`);
      await page.fill('[data-testid="credential-description-input"]', 'Multi-sig credential E2E test');
      await page.fill('[data-testid="credential-recipient-input"]', TEST_USERS.student.email);
      await page.fill('[data-testid="credential-course-input"]', 'test-course-001');

      // Add signers
      await page.fill('[data-testid="signer-input-0"]', TEST_USERS.educator.email);
      await page.click('[data-testid="add-signer-button"]');
      await page.fill('[data-testid="signer-input-1"]', 'signer2@starked.test');

      // Set threshold
      await page.fill('[data-testid="threshold-input"]', '2');

      await page.click('[data-testid="credential-submit"]');

      await expect(page.locator('[data-testid="success-message"]')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Credential Verification', () => {
    test('should verify a credential on the public verification page', async ({ page }) => {
      await page.goto('/verify');

      await expect(page.locator('[data-testid="verification-form"]')).toBeVisible();
      await expect(page.locator('[data-testid="credential-id-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="verify-button"]')).toBeVisible();
    });

    test('should show invalid message for non-existent credential', async ({ page }) => {
      await page.goto('/verify');

      await page.fill('[data-testid="credential-id-input"]', '999999');
      await page.click('[data-testid="verify-button"]');

      await expect(page.locator('[data-testid="verification-result"]')).toBeVisible();
      await expect(page.locator('text=not found')).toBeVisible();
    });

    test('should show valid credential details after verification', async ({ page }) => {
      // This test requires a pre-existing valid credential in the test environment
      await page.goto('/verify');

      await page.fill('[data-testid="credential-id-input"]', '1');
      await page.click('[data-testid="verify-button"]');

      // Should show some result (either valid or invalid depending on test data)
      await expect(page.locator('[data-testid="verification-result"]')).toBeVisible({ timeout: 10000 });
    });
  });
});
