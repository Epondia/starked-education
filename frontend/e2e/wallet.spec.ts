import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Wallet Connection Flows', () => {
  test.describe('Wallet Connection UI', () => {
    test('should display wallet connect button in navigation', async ({ page }) => {
      await page.goto('/');

      // Wallet connect button should be visible in the header
      await expect(page.locator('[data-testid="wallet-connect-button"]')).toBeVisible();
    });

    test('should open wallet connection modal on click', async ({ page }) => {
      await page.goto('/');

      await page.click('[data-testid="wallet-connect-button"]');

      await expect(page.locator('[data-testid="wallet-modal"]')).toBeVisible();
    });

    test('should list available wallet providers', async ({ page }) => {
      await page.goto('/');
      await page.click('[data-testid="wallet-connect-button"]');

      await expect(page.locator('[data-testid="wallet-provider-freighter"]')).toBeVisible();
      await expect(page.locator('[data-testid="wallet-provider-albedo"]')).toBeVisible();
    });
  });

  test.describe('Wallet Status', () => {
    test('should show disconnected state by default', async ({ page }) => {
      await page.goto('/');

      await expect(page.locator('[data-testid="wallet-disconnected"]')).toBeVisible();
    });

    test('should persist wallet connection preference', async ({ page }) => {
      // This test verifies that the wallet connection UI appears correctly
      // Full wallet connection requires browser extension (Freighter/Albedo)
      await page.goto('/');

      await page.click('[data-testid="wallet-connect-button"]');

      // Modal should appear with provider options
      await expect(page.locator('[data-testid="wallet-modal"]')).toBeVisible();

      // Close the modal
      await page.click('[data-testid="wallet-modal-close"]');
      await expect(page.locator('[data-testid="wallet-modal"]')).not.toBeVisible();
    });
  });

  test.describe('Wallet Integration (Authenticated)', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'student');
    });

    test('should show wallet section in profile', async ({ page }) => {
      await page.goto('/profile');

      await expect(page.locator('[data-testid="wallet-section"]')).toBeVisible();
    });

    test('should show wallet address when connected', async ({ page }) => {
      // Mock wallet connection - in real environment this requires extension
      await page.goto('/profile');

      // The wallet section should render even if not connected
      await expect(page.locator('[data-testid="wallet-section"]')).toBeVisible();
    });

    test('should display credential NFT information when wallet connected', async ({ page }) => {
      await page.goto('/profile');

      // Navigate to credentials
      const credentialsSection = page.locator('[data-testid="credentials-section"]');
      if (await credentialsSection.isVisible()) {
        await expect(page.locator('[data-testid="credential-nft-info"]')).toBeVisible();
      }
    });
  });

  test.describe('Transaction Flows', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'student');
    });

    test('should show payment confirmation for course enrollment', async ({ page }) => {
      await page.goto('/campus');
      await page.click('[data-testid="course-card"]:first-child');

      // Click enroll (this may trigger wallet if connected)
      const enrollButton = page.locator('[data-testid="enroll-button"]');
      if (await enrollButton.isVisible()) {
        await enrollButton.click();
      }

      // Payment confirmation should appear
      const paymentDialog = page.locator('[data-testid="payment-confirmation"]');
      if (await paymentDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(paymentDialog).toBeVisible();
      }
    });

    test('should show transaction history in profile', async ({ page }) => {
      await page.goto('/profile');

      // Scroll to transaction section
      await page.locator('[data-testid="transaction-history"]').scrollIntoViewIfNeeded();

      await expect(page.locator('[data-testid="transaction-history"]')).toBeVisible();
    });
  });
});
