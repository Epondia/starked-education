/**
 * Accessibility Audit — WCAG 2.1 AA
 *
 * Runs axe-core against key page structures rendered by @testing-library/react.
 * Tests are tagged with WCAG 2.1 AA rules so only relevant violations fail CI.
 *
 * Run individually:  npm run test:a11y
 * Run in CI:         npm run audit:a11y
 */

import React from 'react';
import { render } from '@testing-library/react';
import axe, { AxeResults } from 'axe-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convenience wrapper: renders JSX into a real DOM container and runs axe. */
async function runAxe(ui: React.ReactElement): Promise<AxeResults> {
  const { container } = render(ui);
  // axe needs the container to be attached to document.body for reliable results
  document.body.appendChild(container);

  const results = await axe.run(container, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'],
    },
  });

  // Clean up after each run
  document.body.removeChild(container);
  return results;
}

function formatViolations(results: AxeResults): string {
  if (results.violations.length === 0) return '';
  return results.violations
    .map(
      (v) =>
        `[${v.impact?.toUpperCase()}] ${v.id}: ${v.description}\n` +
        v.nodes.map((n) => `  HTML: ${n.html}`).join('\n'),
    )
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Fixtures — minimal but representative HTML structures
// ---------------------------------------------------------------------------

/**
 * A representative document skeleton matching the StarkEd App Router layout.
 * Tests WCAG SC 2.4.1 (skip link), SC 1.3.1 (landmark regions), SC 2.4.3 (focus order).
 */
const AppShell = () => (
  <div>
    {/* Skip link */}
    <a href="#main-content" className="skip-link">
      Skip to main content
    </a>

    {/* Header landmark */}
    <header aria-label="Site header">
      <nav aria-label="Main navigation">
        <a href="/">Home</a>
        <a href="/courses">Courses</a>
        <a href="/profile">Profile</a>
      </nav>
    </header>

    {/* Main landmark */}
    <main id="main-content" tabIndex={-1}>
      <h1>StarkEd Temporal Learning Studio</h1>
      <p>Welcome to StarkEd.</p>
    </main>

    {/* Footer landmark */}
    <footer aria-label="Site footer">
      <p>© 2026 StarkEd</p>
    </footer>
  </div>
);

/**
 * Admin layout fixture — ensures single nav, properly labelled regions.
 * Tests SC 2.4.1, SC 4.1.2.
 */
const AdminShell = () => (
  <div className="min-h-screen">
    <a href="#admin-content-region" className="skip-link">
      Skip to admin content
    </a>
    <div className="flex">
      <nav aria-label="Admin navigation">
        <a href="/admin" aria-current="page">Dashboard</a>
        <button type="button" aria-expanded={false} aria-controls="users-submenu">
          User Management
        </button>
        <div id="users-submenu" role="group" aria-label="User Management sub-menu" hidden>
          <a href="/admin/users">All Users</a>
        </div>
      </nav>
      <div>
        <header aria-label="Admin top bar">
          <p className="text-2xl font-semibold">Dashboard</p>
          <label htmlFor="admin-search" className="sr-only">
            Search users, courses, or content
          </label>
          <input id="admin-search" type="search" placeholder="Search..." />
          <button
            type="button"
            aria-label="Open notifications (3 unread)"
            aria-expanded={false}
            aria-haspopup="true"
          >
            <span aria-hidden="true">🔔</span>
            <span className="sr-only">3 unread notifications</span>
          </button>
          <button
            type="button"
            aria-label="Open user menu for Admin User"
            aria-expanded={false}
            aria-haspopup="true"
          >
            Admin User
          </button>
        </header>
        <section
          id="admin-content-region"
          aria-label="Admin content"
          tabIndex={-1}
        >
          <h1>Welcome back, Admin</h1>
        </section>
      </div>
    </div>
  </div>
);

/**
 * Profile tabs fixture — tests SC 4.1.2 (tablist pattern).
 */
const ProfileTabs = () => (
  <main id="main-content">
    <h1>User Profile</h1>
    <div role="tablist" aria-label="Profile sections">
      <button role="tab" id="tab-overview" aria-selected={true} aria-controls="tabpanel-overview">
        Overview
      </button>
      <button role="tab" id="tab-achievements" aria-selected={false} aria-controls="tabpanel-achievements">
        Achievements
      </button>
    </div>
    <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview" tabIndex={0}>
      <h2>Overview Content</h2>
      <p>Profile overview goes here.</p>
    </div>
  </main>
);

/**
 * Form controls fixture — tests SC 1.3.1, SC 3.3.2 (labels for inputs).
 */
const FormFixture = () => (
  <main id="main-content">
    <h1>Course Enrollment</h1>
    <form>
      <label htmlFor="course-name">Course name</label>
      <input id="course-name" type="text" />

      <label htmlFor="payment-method">Payment method</label>
      <select id="payment-method">
        <option value="card">Credit card</option>
        <option value="crypto">Crypto</option>
      </select>

      <button type="submit">Enroll</button>
    </form>
  </main>
);

/**
 * Interactive button fixture — tests SC 4.1.2 (name, role, value).
 */
const InteractiveButtons = () => (
  <main id="main-content">
    <h1>Course Discovery</h1>
    <article aria-label="Introduction to Blockchain course card">
      <img src="/course.png" alt="Introduction to Blockchain course thumbnail" />
      <h2>Introduction to Blockchain</h2>
      <div aria-label="Rating: 4.8 out of 5">4.8</div>
      <button aria-label="Preview Introduction to Blockchain">Preview</button>
      <button aria-label="Save Introduction to Blockchain">Save</button>
      <button aria-label="Find courses similar to Introduction to Blockchain">Similar</button>
    </article>
  </main>
);

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('Accessibility — WCAG 2.1 AA', () => {
  describe('App Shell layout', () => {
    it('has no axe violations', async () => {
      const results = await runAxe(<AppShell />);
      expect(formatViolations(results)).toBe('');
      expect(results.violations).toHaveLength(0);
    });
  });

  describe('Admin layout', () => {
    it('has no axe violations', async () => {
      const results = await runAxe(<AdminShell />);
      expect(formatViolations(results)).toBe('');
      expect(results.violations).toHaveLength(0);
    });
  });

  describe('Profile page tabs', () => {
    it('has no axe violations', async () => {
      const results = await runAxe(<ProfileTabs />);
      expect(formatViolations(results)).toBe('');
      expect(results.violations).toHaveLength(0);
    });
  });

  describe('Form controls', () => {
    it('has no axe violations', async () => {
      const results = await runAxe(<FormFixture />);
      expect(formatViolations(results)).toBe('');
      expect(results.violations).toHaveLength(0);
    });
  });

  describe('Interactive buttons and course cards', () => {
    it('has no axe violations', async () => {
      const results = await runAxe(<InteractiveButtons />);
      expect(formatViolations(results)).toBe('');
      expect(results.violations).toHaveLength(0);
    });
  });
});
