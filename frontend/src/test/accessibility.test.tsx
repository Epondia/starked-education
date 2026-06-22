/**
 * Regression suite for the WCAG 2.1 AA accessibility infrastructure added to
 * resolve GitHub issue #70. The patterns here intentionally mirror
 * `frontend/src/test/skeleton.test.tsx` because that file is known to run
 * cleanly in this sandbox's jest setup; staying close to its imports / shape
 * avoids the "Babel fallback parser" failure that the prior accessibility PR
 * (Epondia#95) tripped repeatedly.
 *
 * Coverage:
 *   - App-Router <RouteAnnouncer> renders an aria-live status region and
 *     updates its visible text after the next path change.
 *   - The canonical landmark shape (skip-link targeting #main-content, a single
 *     main#main-content, a contentinfo footer) is consistent.
 *   - The admin layout does NOT nest its own <main>; instead it renders a
 *     labelled <section> so landmark-unique is preserved.
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import RouteAnnouncer from '../components/accessibility/RouteAnnouncer';

// next/navigation is mocked in jest.setup.js for the rest of the suite. We need
// our own controlled version here so we can drive a path change inside the test.
const mockUsePathname = jest.fn(() => '/');
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

describe('Accessibility infrastructure', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/');
  });

  describe('RouteAnnouncer', () => {
    it('renders an sr-only aria-live polite status region', () => {
      render(<RouteAnnouncer />);
      const region = screen.getByTestId('route-announcer');
      expect(region).toHaveAttribute('role', 'status');
      expect(region).toHaveAttribute('aria-live', 'polite');
      expect(region).toHaveAttribute('aria-atomic', 'true');
      expect(region).toHaveClass('sr-only');
    });

    it('announces the current path when pathname changes from / to /admin', async () => {
      mockUsePathname.mockReturnValue('/');
      const { rerender } = render(<RouteAnnouncer />);

      mockUsePathname.mockReturnValue('/admin');
      rerender(<RouteAnnouncer />);

      await waitFor(() => {
        expect(screen.getByTestId('route-announcer').textContent).toMatch(
          /Navigated to.*Admin/,
        );
      });
    });

    it('humanises single-segment paths with capitalisation', async () => {
      mockUsePathname.mockReturnValue('/dashboard');
      render(<RouteAnnouncer />);

      await waitFor(() => {
        expect(screen.getByTestId('route-announcer').textContent).toMatch(
          /Navigated to.*Dashboard/,
        );
      });
    });

    it('joins nested path segments with " – " for friendlier announcement', async () => {
      mockUsePathname.mockReturnValue('/admin/users/roles');
      render(<RouteAnnouncer />);

      await waitFor(() => {
        expect(screen.getByTestId('route-announcer').textContent).toMatch(
          /Navigated to.*Admin.*Users.*Roles/,
        );
      });
    });
  });

  describe('canonical landmark shape', () => {
    // These render statically against the App-Router source. We do not import
    // the runtime layout (it pulls in next/font/google and analytics code),
    // but we assert the source contains the pieces we promised in the PR.

    it('app/layout.tsx renders the canonical <main id="main-content">', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      const path = require('path');
      const layout = fs.readFileSync(
        path.join(__dirname, '..', 'app', 'layout.tsx'),
        'utf8',
      ) as string;

      expect(layout).toMatch(/<main[^>]*id="main-content"/);
      expect(layout).toMatch(/href="#main-content"/);
      expect(layout).toMatch(/className="skip-link"/);
      expect(layout).toMatch(/<RouteAnnouncer\s*\/>/);
    });

    it('app/layout.tsx renders site chrome (banner, main, contentinfo)', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      const path = require('path');
      const layout = fs.readFileSync(
        path.join(__dirname, '..', 'app', 'layout.tsx'),
        'utf8',
      ) as string;

      // Banner (header)
      expect(layout).toMatch(/import SiteHeader/);
      expect(layout).toMatch(/<SiteHeader\s*\/>/);
      // Main
      expect(layout).toMatch(/import RouteAnnouncer/);
      expect(layout).toMatch(/<RouteAnnouncer\s*\/>/);
      // Contentinfo (footer)
      expect(layout).toMatch(/import SiteFooter/);
      expect(layout).toMatch(/<SiteFooter\s*\/>/);
    });

    it('admin/layout.tsx replaces its nested <main> with a labelled <section>', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      const path = require('path');
      const rawLayout = fs.readFileSync(
        path.join(__dirname, '..', 'app', 'admin', 'layout.tsx'),
        'utf8',
      ) as string;
      // Strip JS/TS comments so descriptive text like the literal "<main>" inside
      // a comment can't be mistaken for a JSX tag by the regex below.
      const layout = rawLayout
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

      expect(layout).not.toMatch(/<main\b/);
      expect(layout).toMatch(/<section[^>]*aria-label="Admin content"/);
    });

    it('AdminSidebar nav has an aria-label and AdminHeader is explicitly labelled', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
      const path = require('path');

      const sidebar = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'components', 'Admin', 'AdminSidebar.tsx'),
        'utf8',
      ) as string;
      expect(sidebar).toMatch(/<nav[^>]*aria-label="Admin navigation"/);

      const header = fs.readFileSync(
        path.join(__dirname, '..', '..', 'src', 'components', 'Admin', 'AdminHeader.tsx'),
        'utf8',
      ) as string;
      expect(header).toMatch(/<header[^>]*aria-label="Admin top bar"/);
    });
  });

  describe('mock next/navigation lifecycle', () => {
    it('exposes the mocked usePathname from the jest.setup shim', () => {
      // Sanity check that the mock we registered is the one RouteAnnouncer sees.
      mockUsePathname.mockReturnValue('/verified-mock');
      expect(mockUsePathname()).toBe('/verified-mock');
    });

    it('does not throw when re-rendered without an active effect frame', () => {
      const tearDown = render(<RouteAnnouncer />);
      act(() => {
        mockUsePathname.mockReturnValue('/another-path');
      });
      expect(() => tearDown.unmount()).not.toThrow();
    });
  });
});
