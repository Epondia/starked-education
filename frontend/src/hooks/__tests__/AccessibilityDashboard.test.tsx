/**
 * Tests for the new axe-core driven AccessibilityDashboard that resolves issue
 * #70 ("axe DevTools audit shows 0 critical/serious violations").
 *
 * The axe-core runtime is mocked at the module level so the dashboard sees a
 * deterministic `run()` and we can assert against a curated list of fake
 * violations without performing a real DOM scan inside jsdom (axe-core's
 * contrast checks need a real layout engine anyway).
 *
 * Three behaviours under test:
 *   1. Successful axe-core run renders the violations list with axe source.
 *   2. Dynamic-import failure falls back to heuristic results and surfaces a
 *      polite alert banner, not a swallowed silent error.
 *   3. The dashboard renders an aria-live region with a labelled "Run WCAG
 *      Audit" button that exposes `aria-busy` while scanning.
 *
 * Note: this test intentionally does NOT depend on `jest-axe` — newer versions
 * of jest-axe invoke `axe-core.getRules()` which the runtime axe-core build
 * does not expose, and the package no longer ships TypeScript declarations
 * compatible with this repo's tsconfig. The dashboard's static baseline is
 * covered instead by smoke-testing the rendered semantic structure.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
// The component is at frontend/src/hooks/AccessibilityDashboard.tsx and this
// test file lives in frontend/src/hooks/__tests__/, so one level up is correct.
import AccessibilityDashboard from '../AccessibilityDashboard';

const axeRun = jest.fn();
jest.mock('axe-core', () => {
  // Support both ESM (`import axe from 'axe-core'; axe.run(...)`) and CJS-style
  // (`(await import('axe-core')).default.run(...)`) consumers. Spreading the
  // `run` method onto the namespace object mirrors how axe-core's CommonJS
  // build exposes its API.
  const axe = {
    run: (...args: unknown[]) => axeRun(...args),
  };
  return {
    __esModule: true,
    ...axe,
    default: axe,
  };
});

describe('AccessibilityDashboard', () => {
  beforeEach(() => {
    axeRun.mockReset();
  });

  describe('semantic baseline', () => {
    it('renders the dashboard region with a stable accessible name', () => {
      render(<AccessibilityDashboard />);
      const region = screen.getByTestId('accessibility-dashboard');
      expect(region).toHaveAttribute('role', 'region');
      expect(region).toHaveAttribute('aria-label', 'Accessibility Audit Dashboard');
    });

    it('exposes a labelled Run WCAG Audit button with aria-busy while scanning', async () => {
      // Resolve the audit after we click so we can observe aria-busy.
      axeRun.mockResolvedValue({ violations: [] });
      render(<AccessibilityDashboard />);

      const button = screen.getByTestId('run-audit');
      expect(button).toHaveTextContent(/Run WCAG Audit/i);
      expect(button).toHaveAttribute('aria-busy', 'false');

      fireEvent.click(button);

      // Right after click but before axe resolves, aria-busy flips to true.
      await waitFor(() => {
        expect(button).toHaveAttribute('aria-busy', 'true');
      });

      // After resolve, the audit results list is populated and aria-busy is false.
      await waitFor(() => {
        expect(button).toHaveAttribute('aria-busy', 'false');
      });
    });
  });

  describe('axe-core success path', () => {
    it('renders axe findings and tags the source as axe-core', async () => {
      axeRun.mockResolvedValue({
        violations: [
          {
            id: 'color-contrast',
            impact: 'serious',
            help: 'Elements must have sufficient color contrast',
            description:
              'Ensures the contrast between foreground and background colors meets WCAG 2 AA contrast ratio thresholds',
            helpUrl:
              'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
            nodes: [{ target: ['body > main > p:nth-child(1)'] }],
          },
          {
            id: 'image-alt',
            impact: 'critical',
            help: 'Images must have alternative text',
            description: 'Ensures <img> elements have alternate text or role="presentation"',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
            nodes: [{ target: ['img.hero'] }],
          },
        ],
      });

      render(<AccessibilityDashboard />);
      fireEvent.click(screen.getByTestId('run-audit'));

      await waitFor(() => {
        const rows = screen.getAllByTestId('audit-result');
        expect(rows).toHaveLength(2);
      });

      // serious impact is rendered as status "failed", critical as "failed" too.
      const rows = screen.getAllByTestId('audit-result');
      expect(rows[0]).toHaveAttribute('data-status', 'failed');
      expect(rows[1]).toHaveAttribute('data-status', 'failed');

      // Source label switches to axe-core
      expect(screen.getByText(/axe-core/i)).toBeInTheDocument();

      // Help link surfaced
      const links = screen.getAllByRole('link', { name: /WCAG guidance/i });
      expect(links).toHaveLength(2);
    });

    it('shows a passing message when axe returns zero violations', async () => {
      axeRun.mockResolvedValue({ violations: [], passes: [], incomplete: [] });

      render(<AccessibilityDashboard />);
      fireEvent.click(screen.getByTestId('run-audit'));

      await waitFor(() => {
        expect(
          screen.getByText(/No WCAG 2\.1 A\/AA violations detected/i),
        ).toBeInTheDocument();
      });
    });
  });

  describe('graceful fallback', () => {
    it('falls back to heuristic results when axe-core fails to load', async () => {
      axeRun.mockRejectedValue(
        Object.assign(new Error('axe-core chunk failed to load'), {
          name: 'ChunkLoadError',
        }),
      );

      render(<AccessibilityDashboard />);
      fireEvent.click(screen.getByTestId('run-audit'));

      await waitFor(() => {
        expect(
          screen.getByText(/heuristic fallback/i),
        ).toBeInTheDocument();
      });

      // The fallback banner announces the unavailability via an alert role.
      expect(screen.getByRole('alert')).toHaveTextContent(/axe-core unavailable/i);

      // Heuristic data is rendered.
      const rows = screen.getAllByTestId('audit-result');
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('surfaces unrelated failures via the alert banner and console.error', async () => {
      // Mock console.error so the test does not pollute the runner output.
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      // The dashboard intentionally surfaces the actual error message rather
      // than a canned prefix — operators need the diagnostic to fix the bug,
      // and a fixed prefix risks masking the real failure.
      axeRun.mockRejectedValue(new Error('unrelated database corruption'));

      render(<AccessibilityDashboard />);
      fireEvent.click(screen.getByTestId('run-audit'));

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(/unrelated database corruption/i);
        // Belt-and-braces: the canned fallback string is also present so the
        // operator has a stable hint that this wasn't an axe-core failure.
        expect(alert).toHaveTextContent(/axe-core run failed unexpectedly/i);
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Accessibility audit failed:',
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
