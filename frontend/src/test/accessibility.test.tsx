/**
 * Automated WCAG 2.1 AA accessibility tests using jest-axe.
 *
 * Each test renders the component under test, runs axe-core's full
 * rule set (minus `color-contrast`, which requires real CSS cascade),
 * and asserts zero violations.
 *
 * Run:  npm test -- accessibility
 */

import React from 'react';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';

import { ProfileHeader } from '../components/Profile/ProfileHeader';
import QuestionCard, { Question } from '../components/Quiz/QuestionCard';
import { Button } from '../components/ui/button';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  joinDate: 'January 2024',
  totalCoursesCompleted: 12,
  currentStreak: 7,
};

const mockMCQQuestion: Question = {
  id: 'q1',
  type: 'multiple-choice',
  question: 'What does HTML stand for?',
  options: [
    'HyperText Markup Language',
    'HyperText Making Language',
    'HyperTransfer Markup Language',
    'HyperText Modeling Language',
  ],
};

const mockEssayQuestion: Question = {
  id: 'q2',
  type: 'essay',
  question: 'Explain the concept of blockchain in your own words.',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WCAG 2.1 AA — automated axe-core audit', () => {
  // ------------------------------------------------------------------
  // Button component
  // ------------------------------------------------------------------
  describe('Button', () => {
    it('has no violations (default variant)', async () => {
      const { container } = render(<Button>Click me</Button>);
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no violations (icon-only with aria-label)', async () => {
      const { container } = render(
        <Button aria-label="Close dialog" size="icon">
          ✕
        </Button>,
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no violations (disabled state)', async () => {
      const { container } = render(<Button disabled>Submit</Button>);
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  // ------------------------------------------------------------------
  // ProfileHeader
  // ------------------------------------------------------------------
  describe('ProfileHeader', () => {
    it('has no violations', async () => {
      const { container } = render(<ProfileHeader user={mockUser} />);
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  // ------------------------------------------------------------------
  // QuestionCard
  // ------------------------------------------------------------------
  describe('QuestionCard', () => {
    it('has no violations for MCQ (no answer selected)', async () => {
      const { container } = render(
        <QuestionCard question={mockMCQQuestion} answer={null} onChange={() => {}} />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no violations for MCQ (answer selected)', async () => {
      const { container } = render(
        <QuestionCard question={mockMCQQuestion} answer={0} onChange={() => {}} />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no violations for essay question', async () => {
      const { container } = render(
        <QuestionCard question={mockEssayQuestion} answer="" onChange={() => {}} />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  // ------------------------------------------------------------------
  // Skip-link + landmark structure
  // ------------------------------------------------------------------
  describe('Page landmark structure', () => {
    it('has no violations for skip-link + main landmark', async () => {
      const { container } = render(
        <div>
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>
          <nav aria-label="Primary navigation">
            <a href="/">Home</a>
          </nav>
          <main id="main-content" tabIndex={-1}>
            <h1>Page Title</h1>
            <p>Page content goes here.</p>
          </main>
        </div>,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
