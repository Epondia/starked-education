import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Result as AxeResult } from 'axe-core';

/**
 * Accessibility regression suite for #70: WCAG 2.1 AA compliance.
 *
 * Each public route is scanned with `@axe-core/playwright` against the
 * WCAG 2.1 A & AA rule set. The suite fails the build on any `critical`
 * or `serious` violation, which directly satisfies the
 * "axe DevTools audit shows 0 critical/serious violations" item in
 * issue #70's Definition of Done.
 *
 * @see https://github.com/Epondia/starked-education/issues/70
 */

interface AuditRoute {
  /** Path tested against the running Next.js server. */
  path: string;
  /** Human label, used in test names. */
  name: string;
}

const ROUTES: AuditRoute[] = [
  { name: 'home', path: '/' },
  { name: 'demo', path: '/demo' },
  { name: 'lab', path: '/lab' },
  { name: 'campus', path: '/campus' },
];

/**
 * Tags map to the WCAG 2.1 A & AA rules published by axe-core.
 * Excluding AAA keeps the scan aligned with issue #70's "AA compliance" scope.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const;

/**
 * Print a human-readable axe violation summary so failing CI artefacts are
 * debuggable without needing the HTML report. Accepts the upstream
 * `axe-core` `Result[]` shape (impact may be `undefined` for inapplicable /
 * incomplete pass-through helpers, hence the loose typing here).
 */
function logBlockingViolations(label: string, violations: AxeResult[]): void {
  const blocking = violations.filter(
    (v): v is AxeResult & { impact: 'critical' | 'serious' } =>
      v.impact === 'critical' || v.impact === 'serious',
  );
  if (blocking.length === 0) return;

  console.error(
    `\n[axe] ${label}: ${blocking.length} blocking accessibility violation(s):`,
  );
  for (const v of blocking) {
    console.error(`  - [${v.impact}] ${v.id}: ${v.help}`);
    console.error(`    ${v.helpUrl}`);
    v.nodes.forEach((node, idx) => {
      const target = node.target.join(' ');
      console.error(
        `    Node ${idx + 1}/${v.nodes.length}: ${target || '(no target)'}`,
      );
      console.error(`      ${node.html.slice(0, 160)}`);
    });
  }
}

for (const route of ROUTES) {
  test(`WCAG 2.1 AA — zero critical/serious violations on /${route.name}`, async ({
    page,
  }) => {
    // Capture pageerror from the *first* paint, not after navigation completes —
    // a synchronous hydration-throw inside React 18 hydration would otherwise
    // be silently lost, leaving the suite to mis-report a "clean" page.
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const response = await page.goto(route.path, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // A 4xx/5xx would otherwise produce a vacuous-zero-violation green CI —
    // surface it explicitly so the suite fails loudly.
    expect(response, `page /${route.name} returned no response`).toBeTruthy();
    expect(
      response?.status() ?? 0,
      `page /${route.name} returned status ${response?.status()}`,
    ).toBeLessThan(400);

    // `load` is intentionally preferred over `networkidle` here — Next.js
    // apps can keep long-lived websockets / SSE open indefinitely which makes
    // `networkidle` time out (Chromium default 30s).
    await page.waitForLoadState('load');

    // Fail loudly if the page never paints anything (the "vacuous-zero" guard).
    const bodyChildCount = await page.evaluate(
      () => document.body.children.length,
    );
    expect(
      bodyChildCount,
      `body on /${route.name} rendered with zero children — axe scan would be vacuous`,
    ).toBeGreaterThan(0);

    if (pageErrors.length > 0) {
      console.error(
        `[axe] /${route.name} emitted pageerror(s) during load:`,
        pageErrors,
      );
    }
    expect(pageErrors, 'page must load without console errors').toEqual([]);

    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_TAGS])
      .analyze();

    logBlockingViolations(route.name, results.violations);

    // DoD item #7: zero critical/serious violations per PR.
    const blocking = results.violations.filter(
      (v): v is AxeResult & { impact: 'critical' | 'serious' } =>
        v.impact === 'critical' || v.impact === 'serious',
    );
    expect(
      blocking.length,
      `expected 0 critical/serious axe violations on /${route.name}, got ${blocking.length}`,
    ).toBe(0);

    // Sanity-gate: confirm axe-core actually ran and produced a result payload.
    expect(
      results.testEngine.name,
      'axe-core testEngine.name must be reported',
    ).toBeTruthy();
    expect(
      typeof results.testEngine.version,
      'axe-core testEngine.version must be a string',
    ).toBe('string');
    // Axe correctly counted *some* rules as applicable — a zero-applicable
    // response is the fingerprint of a misconfigured rules payload.
    expect(
      results.violations.length + results.passes.length + results.incomplete.length,
      'axe-core must report at least one applicable rule result',
    ).toBeGreaterThan(0);
  });
}

/**
 * Sanity test for WCAG 3.1.1 (Language of Page): every audited route must
 * have a non-empty `lang` on `<html>`. Iteration across all routes catches
 * per-locale regressions (issue #70 mentions RTL localizations).
 */
for (const route of ROUTES) {
  test(`WCAG 3.1.1 — <html lang> is set on /${route.name}`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(
      lang,
      `document.documentElement.lang must be a non-empty BCP-47 tag on /${route.name}`,
    ).toBeTruthy();
    expect(
      lang.trim().length,
      `lang attribute must be non-empty on /${route.name}`,
    ).toBeGreaterThan(0);
  });
}
