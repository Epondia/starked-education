import { test, expect, Page } from '@playwright/test';

const MOCK_COURSES = [
  {
    id: 'course_001',
    title: 'Introduction to Blockchain',
    description: 'Learn blockchain fundamentals and decentralized technologies.',
    provider: 'StarkEd',
    category: 'Blockchain',
    level: 'beginner',
    price: 0,
    durationHours: 8,
    rating: 4.8,
    enrollmentCount: 1234,
    tags: ['blockchain', 'crypto', 'web3'],
    matchReasons: ['Highly relevant', 'Popular'],
    socialProof: { reviewSnippet: 'Great course!', enrollmentLabel: '1.2K enrolled', ratingLabel: '4.8 rating' },
    thumbnail: '/course-thumbnails/blockchain-intro.jpg',
    preview: 'A beginner-friendly introduction to blockchain technology.',
  },
  {
    id: 'course_002',
    title: 'Stellar Smart Contracts',
    description: 'Build and deploy smart contracts on the Stellar network.',
    provider: 'StarkEd',
    category: 'Blockchain',
    level: 'intermediate',
    price: 49.99,
    durationHours: 16,
    rating: 4.9,
    enrollmentCount: 856,
    tags: ['stellar', 'smart contracts', 'rust'],
    matchReasons: ['Skill match', 'Trending'],
    socialProof: { reviewSnippet: 'Excellent depth!', enrollmentLabel: '856 enrolled', ratingLabel: '4.9 rating' },
    thumbnail: '/course-thumbnails/stellar-contracts.jpg',
    preview: 'Master Stellar smart contract development.',
  },
  {
    id: 'course_003',
    title: 'React Frontend Mastery',
    description: 'Build modern UIs with React and Next.js.',
    provider: 'StarkEd',
    category: 'Frontend',
    level: 'advanced',
    price: 79.99,
    durationHours: 24,
    rating: 4.7,
    enrollmentCount: 2456,
    tags: ['react', 'nextjs', 'typescript'],
    matchReasons: ['High demand', 'Comprehensive'],
    socialProof: { reviewSnippet: 'Best React course!', enrollmentLabel: '2.4K enrolled', ratingLabel: '4.7 rating' },
    thumbnail: '/course-thumbnails/react-mastery.jpg',
    preview: 'Comprehensive React and Next.js training.',
  },
  {
    id: 'course_004',
    title: 'Data Science Fundamentals',
    description: 'Learn data analysis, ML, and statistical modeling.',
    provider: 'StarkEd',
    category: 'Data Science',
    level: 'beginner',
    price: 39.99,
    durationHours: 20,
    rating: 4.6,
    enrollmentCount: 1890,
    tags: ['python', 'ml', 'statistics'],
    matchReasons: ['Beginner friendly', 'Project based'],
    socialProof: { reviewSnippet: 'Perfect for beginners!', enrollmentLabel: '1.8K enrolled', ratingLabel: '4.6 rating' },
    thumbnail: '/course-thumbnails/data-science.jpg',
    preview: 'Start your data science journey here.',
  },
];

async function mockDiscoveryApi(page: Page) {
  await page.route('**/api/categories', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(['Blockchain', 'Frontend', 'Data Science', 'Backend', 'DevOps']),
    });
  });

  await page.route('**/api/courses*', async (route) => {
    const url = new URL(route.request().url());
    const categoriesParam = url.searchParams.get('categories');
    const query = url.searchParams.get('q');

    let filtered = [...MOCK_COURSES];

    if (categoriesParam) {
      const cats = categoriesParam.split(',');
      filtered = filtered.filter((c) => cats.includes(c.category));
    }

    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q),
      );
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: filtered, total: filtered.length }),
    });
  });

  await page.route('**/api/discovery/search*', async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get('query') || '';

    let filtered = [...MOCK_COURSES];
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
      );
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: filtered,
        total: filtered.length,
        searchId: 'search_001',
        variant: 'control',
        analytics: { indexedDocuments: 120, processingTimeMs: 45, savedSearchCount: 3, alertCount: 1 },
        facets: {
          categories: [
            { value: 'Blockchain', count: 2 },
            { value: 'Frontend', count: 1 },
            { value: 'Data Science', count: 1 },
          ],
          levels: [
            { value: 'beginner', count: 2 },
            { value: 'intermediate', count: 1 },
            { value: 'advanced', count: 1 },
          ],
          languages: [{ value: 'English', count: 4 }],
          tags: [
            { value: 'blockchain', count: 2 },
            { value: 'react', count: 1 },
            { value: 'python', count: 1 },
          ],
        },
      }),
    });
  });

  await page.route('**/api/discovery/recommendations*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route('**/api/discovery/trending*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: MOCK_COURSES.slice(0, 3) }),
    });
  });

  await page.route('**/api/discovery/learning-paths*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route('**/api/discovery/curators*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route('**/api/discovery/history*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route('**/api/discovery/saved-searches*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route('**/api/discovery/alerts*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.route('**/api/discovery/analytics*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalSearches: 1234,
        averageProcessingTimeMs: 42,
        savedSearchCount: 3,
        alertCount: 1,
      }),
    });
  });

  await page.route('**/api/discovery/suggestions*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ suggestions: ['blockchain', 'stellar', 'react'] }),
    });
  });

  await page.route('**/api/discovery/similar*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] }),
    });
  });
}

test.describe('Course Catalog Browsing', () => {
  test.beforeEach(async ({ page }) => {
    await mockDiscoveryApi(page);
  });

  test('should load and display the course catalog', async ({ page }) => {
    await page.goto('/discovery');
    await page.waitForTimeout(1000);

    await expect(page.locator('h1')).toContainText('Search courses');
    await expect(page.locator('text=Advanced Search and Discovery')).toBeVisible();
    await expect(page.locator('input[aria-label="Search courses"]')).toBeVisible();
  });

  test('should display course cards with details', async ({ page }) => {
    await page.goto('/discovery');
    await page.waitForTimeout(1000);

    const searchInput = page.locator('input[aria-label="Search courses"]');
    await searchInput.fill('Blockchain');
    await page.locator('button:has-text("Search")').click();
    await page.waitForTimeout(500);

    const searchResults = page.locator('text=Search Results');
    await expect(searchResults).toBeVisible();

    const categoryButtons = page.locator('button:has-text("Blockchain")');
    await expect(categoryButtons.first()).toBeVisible();
  });

  test('should filter courses by category', async ({ page }) => {
    await page.goto('/discovery');
    await page.waitForTimeout(1000);

    const blockchainFilter = page.locator('button:has-text("Blockchain")').first();
    await blockchainFilter.click();
    await page.waitForTimeout(500);

    const visibleCategory = page.locator('button.bg-slate-900:has-text("Blockchain")');
    await expect(visibleCategory).toBeVisible();
  });

  test('should search courses by keyword', async ({ page }) => {
    await page.goto('/discovery');
    await page.waitForTimeout(1000);

    const searchInput = page.locator('input[aria-label="Search courses"]');
    await searchInput.fill('Stellar');
    await page.locator('button:has-text("Search")').click();
    await page.waitForTimeout(500);

    const resultCount = page.locator('text=results');
    await expect(resultCount).toBeVisible();
  });

  test('should show empty state when no courses match', async ({ page }) => {
    await page.goto('/discovery');
    await page.waitForTimeout(1000);

    const searchInput = page.locator('input[aria-label="Search courses"]');
    await searchInput.fill('xyznonexistentcourse');
    await page.locator('button:has-text("Search")').click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=No matches found')).toBeVisible();
  });
});
