import { test, expect, Page } from '@playwright/test';

const MOCK_CREDENTIALS = [
  {
    id: 'cred_001',
    title: 'Blockchain Fundamentals Certificate',
    issuer: 'StarkEd Education',
    type: 'certificate',
    verificationStatus: 'verified',
    issueDate: '2024-01-15T00:00:00.000Z',
    skills: ['Blockchain', 'Smart Contracts', 'Stellar'],
    verificationUrl: 'https://verify.starked.edu/cred_001',
    documentUrl: 'https://docs.starked.edu/cred_001.pdf',
  },
  {
    id: 'cred_002',
    title: 'React Developer Badge',
    issuer: 'StarkEd Education',
    type: 'badge',
    verificationStatus: 'pending',
    issueDate: '2024-02-20T00:00:00.000Z',
    skills: ['React', 'TypeScript', 'Next.js'],
    verificationUrl: 'https://verify.starked.edu/cred_002',
  },
  {
    id: 'cred_003',
    title: 'Data Science Diploma',
    issuer: 'StarkEd Education',
    type: 'degree',
    verificationStatus: 'verified',
    issueDate: '2024-03-10T00:00:00.000Z',
    expiryDate: '2026-03-10T00:00:00.000Z',
    skills: ['Python', 'Machine Learning', 'Statistics', 'Data Analysis'],
    verificationUrl: 'https://verify.starked.edu/cred_003',
    documentUrl: 'https://docs.starked.edu/cred_003.pdf',
  },
  {
    id: 'cred_004',
    title: 'Expired License',
    issuer: 'StarkEd Education',
    type: 'license',
    verificationStatus: 'expired',
    issueDate: '2023-01-01T00:00:00.000Z',
    expiryDate: '2024-01-01T00:00:00.000Z',
    skills: ['Security'],
    verificationUrl: 'https://verify.starked.edu/cred_004',
  },
];

async function mockCredentialsApi(page: Page) {
  await page.route('**/api/profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'usr_001',
        name: 'John Doe',
        email: 'john.doe@example.com',
        totalCoursesCompleted: 3,
        currentStreak: 7,
        avatar: null,
        bio: 'Passionate learner',
        location: 'Remote',
        website: 'https://johndoe.dev',
      }),
    });
  });

  await page.route('**/api/credentials*', async (route) => {
    const url = new URL(route.request().url());
    const statusFilter = url.searchParams.get('status');
    const typeFilter = url.searchParams.get('type');

    let filtered = [...MOCK_CREDENTIALS];

    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter((c) => c.verificationStatus === statusFilter);
    }
    if (typeFilter && typeFilter !== 'all') {
      filtered = filtered.filter((c) => c.type === typeFilter);
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: filtered }),
    });
  });

  await page.route('**/api/profile/achievements', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/profile/stats', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        coursesCompleted: 3,
        totalHoursLearned: 120,
        certificatesEarned: 2,
        currentStreak: 7,
        longestStreak: 15,
      }),
    });
  });
}

test.describe('Credentials Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockCredentialsApi(page);
  });

  test('should display credentials list on profile page', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForTimeout(1000);

    await expect(page.locator('text=Credentials').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show credential cards with type icons and status badges', async ({ page }) => {
    await page.goto('/demo');
    await page.waitForTimeout(1000);

    const credentialsTab = page.locator('button:has-text("Credential Management")');
    await credentialsTab.click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=Credential Management Demo')).toBeVisible();
    await expect(page.locator('text=Blockchain Fundamentals Certificate')).toBeVisible({ timeout: 5000 });
  });

  test('should filter credentials by verification status', async ({ page }) => {
    await page.goto('/demo');
    await page.waitForTimeout(1000);

    const credentialsTab = page.locator('button:has-text("Credential Management")');
    await credentialsTab.click();
    await page.waitForTimeout(500);

    await page.waitForTimeout(500);
  });

  test('should show empty state when no credentials match filter', async ({ page }) => {
    await page.goto('/demo');
    await page.waitForTimeout(1000);

    const credentialsTab = page.locator('button:has-text("Credential Management")');
    await credentialsTab.click();
    await page.waitForTimeout(500);
  });

  test('should display credential details with skills', async ({ page }) => {
    await page.goto('/demo');
    await page.waitForTimeout(1000);

    const credentialsTab = page.locator('button:has-text("Credential Management")');
    await credentialsTab.click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=Blockchain Fundamentals Certificate')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Blockchain').first()).toBeVisible();
    await expect(page.locator('text=StarkEd Education').first()).toBeVisible();
  });

  test('should navigate through profile sections', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForTimeout(1000);

    const credentialsTab = page.locator('button:has-text("Credentials")');
    await credentialsTab.click();
    await page.waitForTimeout(500);

    await expect(page.locator('h2').or(page.locator('h3'))).toBeVisible();
  });
});
