/**
 * Tests for Breadcrumb component
 *
 * Covers:
 *  - Renders nothing on home page (pathname = '/')
 *  - Renders correct breadcrumb items from pathname
 *  - Home icon as first item
 *  - Schema.org BreadcrumbList JSON-LD structured data
 *  - Custom overrides for specific segments
 *  - Custom home label
 *  - No truncation when truncateMobile={false}
 *  - aria-current="page" on last item
 *  - aria-label="Breadcrumb" on nav element
 *  - Handles dynamic route segments (e.g., [courseId])
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Breadcrumb, type BreadcrumbProps } from '../Breadcrumb';

// ─── Mock next/navigation ──────────────────────────────────────────

let mockPathname = '/courses/blockchain-basics';

jest.mock('next/navigation', () => ({
  usePathname() {
    return mockPathname;
  },
}));

// ─── Helper ────────────────────────────────────────────────────────

function renderBreadcrumb(props: Partial<BreadcrumbProps> = {}) {
  return render(<Breadcrumb {...props} />);
}

function setPathname(path: string) {
  mockPathname = path;
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('Breadcrumb', () => {
  beforeEach(() => {
    setPathname('/courses/blockchain-basics');
  });

  afterEach(() => {
    setPathname('/courses/blockchain-basics');
  });

  // ── Home page ───────────────────────────────────────────────────

  describe('when on the home page', () => {
    it('renders nothing when pathname is /', () => {
      setPathname('/');
      const { container } = renderBreadcrumb();
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when pathname is empty', () => {
      setPathname('');
      const { container } = renderBreadcrumb();
      expect(container.innerHTML).toBe('');
    });
  });

  // ── Basic rendering ──────────────────────────────────────────────

  describe('basic rendering', () => {
    it('renders breadcrumb items from the pathname', () => {
      setPathname('/courses/blockchain-basics');
      renderBreadcrumb();

      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Courses')).toBeInTheDocument();
      expect(screen.getByText('Blockchain Basics')).toBeInTheDocument();
    });

    it('renders links for non-last items', () => {
      setPathname('/courses/blockchain-basics');
      renderBreadcrumb();

      const homeLink = screen.getByText('Home').closest('a');
      expect(homeLink).toHaveAttribute('href', '/');

      const coursesLink = screen.getByText('Courses').closest('a');
      expect(coursesLink).toHaveAttribute('href', '/courses');
    });

    it('does not render a link for the last item', () => {
      setPathname('/courses/blockchain-basics');
      renderBreadcrumb();

      const lastItem = screen.getByText('Blockchain Basics');
      expect(lastItem.closest('a')).toBeNull();
    });

    it('sets aria-current="page" on the last item', () => {
      setPathname('/courses/blockchain-basics');
      renderBreadcrumb();

      const lastItem = screen.getByText('Blockchain Basics');
      expect(lastItem).toHaveAttribute('aria-current', 'page');
    });

    it('nav element has aria-label="Breadcrumb"', () => {
      setPathname('/courses/blockchain-basics');
      renderBreadcrumb();

      expect(screen.getByRole('navigation')).toHaveAttribute(
        'aria-label',
        'Breadcrumb'
      );
    });
  });

  // ── Home icon ────────────────────────────────────────────────────

  describe('home icon', () => {
    it('includes a Home icon as the first item', () => {
      setPathname('/courses');
      renderBreadcrumb();

      // The Home icon is rendered via lucide-react Home component
      // with an SVG element
      const nav = screen.getByRole('navigation');
      const svg = nav.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  // ── Segment label generation ─────────────────────────────────────

  describe('segment label generation', () => {
    it('converts kebab-case to Title Case', () => {
      setPathname('/blockchain-development/course-overview');
      renderBreadcrumb();

      expect(screen.getByText('Blockchain Development')).toBeInTheDocument();
      expect(screen.getByText('Course Overview')).toBeInTheDocument();
    });

    it('capitalizes single words', () => {
      setPathname('/courses');
      renderBreadcrumb();

      expect(screen.getByText('Courses')).toBeInTheDocument();
    });

    it('handles nested paths correctly (with truncation disabled)', () => {
      setPathname('/admin/content/moderation');
      renderBreadcrumb({ truncateMobile: false });

      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
      expect(screen.getByText('Moderation')).toBeInTheDocument();
    });
  });

  // ── Custom overrides ─────────────────────────────────────────────

  describe('custom overrides', () => {
    it('uses custom label for overridden segment', () => {
      setPathname('/courses/blockchain-basics');
      renderBreadcrumb({
        overrides: {
          courses: { label: 'All Courses' },
        },
      });

      expect(screen.getByText('All Courses')).toBeInTheDocument();
      expect(screen.queryByText('Courses')).not.toBeInTheDocument();
    });

    it('uses custom href for overridden segment', () => {
      setPathname('/courses/blockchain-basics');
      renderBreadcrumb({
        overrides: {
          courses: { label: 'All Courses', href: '/discovery' },
        },
      });

      const coursesLink = screen.getByText('All Courses').closest('a');
      expect(coursesLink).toHaveAttribute('href', '/discovery');
    });

    it('uses default href when override has no href', () => {
      setPathname('/courses/blockchain-basics');
      renderBreadcrumb({
        overrides: {
          courses: { label: 'All Courses' },
        },
      });

      // Default href should be built from path
      const coursesLink = screen.getByText('All Courses').closest('a');
      expect(coursesLink).toHaveAttribute('href', '/courses');
    });
  });

  // ── Custom home label ────────────────────────────────────────────

  describe('custom home label', () => {
    it('uses custom home label when provided', () => {
      setPathname('/courses');
      renderBreadcrumb({ homeLabel: 'Dashboard' });

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.queryByText('Home')).not.toBeInTheDocument();
    });
  });

  // ── Mobile truncation ────────────────────────────────────────────

  describe('mobile truncation', () => {
    it('truncates middle items on mobile by default', () => {
      setPathname('/admin/content/moderation/pending-review');
      renderBreadcrumb();

      // Home should always be visible
      expect(screen.getByText('Home')).toBeInTheDocument();
      // Last item should always be visible
      expect(screen.getByText('Pending Review')).toBeInTheDocument();
      // Middle items (Admin, Content, Moderation) should NOT be visible due to truncation
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
      expect(screen.queryByText('Content')).not.toBeInTheDocument();
      expect(screen.queryByText('Moderation')).not.toBeInTheDocument();
    });

    it('does not truncate when truncateMobile is false', () => {
      setPathname('/admin/content/moderation/pending-review');
      renderBreadcrumb({ truncateMobile: false });

      // All items should be in the DOM (no hidden class)
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
      expect(screen.getByText('Moderation')).toBeInTheDocument();
      expect(screen.getByText('Pending Review')).toBeInTheDocument();
    });
  });

  // ── Schema.org structured data ───────────────────────────────────

  describe('schema.org structured data', () => {
    it('renders a JSON-LD BreadcrumbList script tag', () => {
      setPathname('/courses/blockchain-basics');
      renderBreadcrumb();

      const script = document.querySelector(
        'script[type="application/ld+json"]'
      );
      expect(script).toBeInTheDocument();

      const parsed = JSON.parse(script!.textContent || '{}');
      expect(parsed['@context']).toBe('https://schema.org');
      expect(parsed['@type']).toBe('BreadcrumbList');
      expect(parsed.itemListElement).toBeInstanceOf(Array);
      expect(parsed.itemListElement.length).toBe(3);
    });

    it('includes correct positions in BreadcrumbList', () => {
      setPathname('/courses/blockchain-basics');
      renderBreadcrumb();

      const script = document.querySelector(
        'script[type="application/ld+json"]'
      );
      const parsed = JSON.parse(script!.textContent || '{}');

      expect(parsed.itemListElement[0].position).toBe(1);
      expect(parsed.itemListElement[1].position).toBe(2);
      expect(parsed.itemListElement[2].position).toBe(3);
    });

    it('uses correct URLs in schema data', () => {
      setPathname('/courses/blockchain-basics');
      renderBreadcrumb();

      const script = document.querySelector(
        'script[type="application/ld+json"]'
      );
      const parsed = JSON.parse(script!.textContent || '{}');

      expect(parsed.itemListElement[0].item).toContain('/');
      expect(parsed.itemListElement[1].item).toContain('/courses');
      expect(parsed.itemListElement[2].item).toContain('/courses/blockchain-basics');
    });
  });

  // ── Custom className ─────────────────────────────────────────────

  describe('custom className', () => {
    it('applies custom className to the nav element', () => {
      setPathname('/courses');
      renderBreadcrumb({ className: 'my-custom-class' });

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveClass('my-custom-class');
    });
  });

  // ── Single segment ───────────────────────────────────────────────

  describe('single segment path', () => {
    it('renders only Home and the single segment', () => {
      setPathname('/discovery');
      renderBreadcrumb();

      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Discovery')).toBeInTheDocument();
    });
  });

  // ── Dynamic segments ─────────────────────────────────────────────

  describe('dynamic route segments', () => {
    it('strips brackets from dynamic segment labels', () => {
      setPathname('/enroll/course-123');
      renderBreadcrumb({
        overrides: {
          'course-123': { label: 'Course Details' },
        },
      });

      expect(screen.getByText('Enroll')).toBeInTheDocument();
      expect(screen.getByText('Course Details')).toBeInTheDocument();
    });
  });
});
