import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for accessibility (WCAG 2.1 A & AA) audits.
 *
 * Mirrors the `npm run dev` style of `webServer` so the tests run against the
 * real production bundle (no dev-only HMR scripts polluting the axe-scan).
 *
 * @see https://playwright.dev/docs/test-configuration
 * @see https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright
 */
export default defineConfig({
  testDir: './e2e',
  // The accessibility suite is small; running it serially keeps axe-core's
  // global state predictable (it injects a script into the page and the
  // scanner waits for visible stability).
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Default viewport — mobile-specific audits are out of scope for this PR
    // (PR #95 covers the desktop WCAG DoD items).
    viewport: { width: 1280, height: 720 },
    // We test against the production build for stable axe results.
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
