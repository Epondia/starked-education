import { test, expect, Page } from '@playwright/test';

const MOCK_COURSE = {
  id: 'course_001',
  title: 'Introduction to Blockchain Development',
  description: 'Learn the fundamentals of blockchain technology and smart contract development using Stellar.',
  instructor: 'Dr. Sarah Johnson',
  price: 50,
  currency: 'XLM',
  duration: '8 weeks',
  level: 'beginner',
  category: 'Blockchain',
  maxStudents: 100,
  currentEnrollments: 45,
  startDate: '2024-04-01',
  endDate: '2024-05-26',
};

async function mockEnrollmentApi(page: Page) {
  await page.route('**/api/enroll', async (route) => {
    if (route.request().method() === 'POST') {
      const body = JSON.parse(route.request().postData() || '{}');
      if (body.studentId && body.courseId) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              id: 'enr_' + Date.now(),
              ...body,
              status: 'confirmed',
              enrollmentDate: new Date().toISOString(),
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: { message: 'Missing required fields' } }),
        });
      }
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    }
  });

  await page.route('**/api/payments/stellar/create', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          paymentId: 'pay_' + Date.now(),
          gatewayData: {
            destination: 'GBB4WQHRRM3KOI6Y7I5X4PU5P6W7YQ5U4J5V6W7X8Y9Z0A1B2C3D4E5F6',
            memo: 'Course Enrollment',
          },
          amount: 50,
          assetCode: 'XLM',
        },
      }),
    });
  });

  await page.route('**/api/payments/stellar/submit', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.paymentIntentId && body.signedTransactionXDR) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            transaction: {
              id: 'txn_' + Date.now(),
              hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
              status: 'completed',
            },
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Payment failed: Invalid transaction data',
        }),
      });
    }
  });

  await page.route('**/api/enrollments/capacity*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { currentEnrollments: 45, maxStudents: 100, waitlistCount: 0 },
      }),
    });
  });

  await page.route('**/api/enrollments/validate-prerequisites', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { valid: true, completed: ['Basic programming knowledge'], missing: [] },
      }),
    });
  });

  await page.route('**/api/payments/methods', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: ['stellar', 'credit_card', 'bank_transfer'] }),
    });
  });

  await page.route('**/api/payments/exchange-rates', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { 'USD-XLM': 3.5 } }),
    });
  });
}

test.describe('Course Enrollment Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockEnrollmentApi(page);
  });

  test('should load enrollment page with course details', async ({ page }) => {
    await page.goto(`/enroll/${MOCK_COURSE.id}`);
    await page.waitForTimeout(1500);

    await expect(page.locator('h1')).toContainText(MOCK_COURSE.title);
    await expect(page.locator(`text=${MOCK_COURSE.instructor}`)).toBeVisible();
    await expect(page.locator(`text=${MOCK_COURSE.price} ${MOCK_COURSE.currency}`)).toBeVisible();
  });

  test('should display multi-step enrollment form', async ({ page }) => {
    await page.goto(`/enroll/${MOCK_COURSE.id}`);
    await page.waitForTimeout(1500);

    await expect(page.locator('text=Personal Information')).toBeVisible();
    await expect(page.locator('text=Connect Wallet')).toBeVisible();
    await expect(page.locator('text=Payment')).toBeVisible();
    await expect(page.locator('text=Confirmation')).toBeVisible();
  });

  test('should complete enrollment with mock Stellar payment', async ({ page }) => {
    await page.goto(`/enroll/${MOCK_COURSE.id}`);
    await page.waitForTimeout(1500);

    await page.locator('#enrollment-first-name').fill('John');
    await page.locator('#enrollment-last-name').fill('Doe');
    await page.locator('#enrollment-email').fill('john.doe@example.com');
    await page.locator('#enrollment-phone').fill('+1 555-123-4567');

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=Connect Wallet')).toBeVisible();

    const walletStep = page.locator('text=Connect Wallet');
    if (await walletStep.isVisible()) {
      const connectButton = page.locator('button:has-text("Connect Wallet")');
      if (await connectButton.isVisible()) {
        await connectButton.click();
        await page.waitForTimeout(500);
      }
    }

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(300);

    const paymentHeader = page.locator('text=Payment');
    await expect(paymentHeader).toBeVisible();

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(500);

    const confirmationHeader = page.locator('text=Confirmation');
    await expect(confirmationHeader).toBeVisible();

    const buttons = page.locator('button[type="submit"]');
    const completeBtn = buttons.locator('text=Complete Enrollment');
    if (await completeBtn.isVisible()) {
      await completeBtn.click();
    } else {
      await buttons.last().click();
    }
    await page.waitForTimeout(1000);

    await expect(page.locator('text=Enrollment Successful!').or(page.locator('text=Enrollment Confirmed!'))).toBeVisible({ timeout: 5000 });
  });

  test('should show error on invalid enrollment submission', async ({ page }) => {
    await page.goto(`/enroll/${MOCK_COURSE.id}`);
    await page.waitForTimeout(1500);

    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=Please complete the current step before proceeding').or(page.locator('#enrollment-error'))).toBeVisible({ timeout: 3000 });
  });

  test('should allow navigating back through enrollment steps', async ({ page }) => {
    await page.goto(`/enroll/${MOCK_COURSE.id}`);
    await page.waitForTimeout(1500);

    await page.locator('#enrollment-first-name').fill('John');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=Connect Wallet')).toBeVisible();

    const backButton = page.locator('button:has-text("Previous")');
    await backButton.click();
    await page.waitForTimeout(300);

    await expect(page.locator('text=Personal Information')).toBeVisible();
  });
});
