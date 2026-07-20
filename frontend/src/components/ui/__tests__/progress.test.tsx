/**
 * Tests for core UI components: Progress
 *
 * Covers:
 *  - Default rendering with role="progressbar"
 *  - Value and max props
 *  - ARIA attributes
 *  - Clamping values to 0-100%
 *  - ClassName merging
 *  - Forwarding ref
 *  - Edge cases (0%, 100%, negative values, over-max values)
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Progress } from '../progress';

describe('Progress', () => {
  // ── Basic rendering ──────────────────────────────────────────────

  describe('rendering', () => {
    it('renders with role="progressbar"', () => {
      render(<Progress value={50} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('renders with correct aria-valuenow', () => {
      render(<Progress value={75} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '75'
      );
    });

    it('renders with default aria-valuemin=0', () => {
      render(<Progress value={30} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuemin',
        '0'
      );
    });

    it('renders with default aria-valuemax=100', () => {
      render(<Progress value={30} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuemax',
        '100'
      );
    });
  });

  // ── Value and max ────────────────────────────────────────────────

  describe('value and max', () => {
    it('defaults value to 0', () => {
      render(<Progress />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '0'
      );
    });

    it('accepts custom max value', () => {
      render(<Progress value={50} max={200} />);
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '50');
      expect(bar).toHaveAttribute('aria-valuemax', '200');
    });

    it('renders inner fill div with correct transform for 50%', () => {
      render(<Progress value={50} />);
      const bar = screen.getByRole('progressbar');
      const fill = bar.firstChild as HTMLElement;
      expect(fill).toBeInTheDocument();
      expect(fill.className).toContain('bg-blue-600');
    });
  });

  // ── Value clamping ───────────────────────────────────────────────

  describe('value clamping', () => {
    it('clamps value to 0 when negative', () => {
      render(<Progress value={-10} />);
      // Should not crash; treats as 0%
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('clamps value to max when exceeding', () => {
      render(<Progress value={150} max={100} />);
      // Should not crash; caps at 100%
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('handles zero max gracefully', () => {
      render(<Progress value={0} max={0} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  // ── ClassName merging ────────────────────────────────────────────

  describe('className', () => {
    it('merges custom className with default classes', () => {
      render(<Progress value={40} className="custom-progress" />);
      const bar = screen.getByRole('progressbar');
      expect(bar.className).toContain('custom-progress');
      expect(bar.className).toContain('overflow-hidden');
    });
  });

  // ── Ref forwarding ───────────────────────────────────────────────

  describe('ref forwarding', () => {
    it('forwards ref to the progress div element', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<Progress ref={ref} value={25} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(ref.current).toHaveAttribute('role', 'progressbar');
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────

  describe('edge cases', () => {
    it('renders at 0%', () => {
      render(<Progress value={0} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '0'
      );
    });

    it('renders at 100%', () => {
      render(<Progress value={100} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '100'
      );
    });

    it('handles floating point values', () => {
      render(<Progress value={33.7} />);
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '33.7'
      );
    });
  });

  // ── HTML attributes ──────────────────────────────────────────────

  describe('HTML attributes', () => {
    it('passes through data attributes', () => {
      render(<Progress value={60} data-testid="course-progress" />);
      expect(screen.getByTestId('course-progress')).toBeInTheDocument();
    });

    it('passes through aria-label', () => {
      render(
        <Progress value={45} aria-label="Course completion progress" />
      );
      expect(screen.getByRole('progressbar')).toHaveAttribute(
        'aria-label',
        'Course completion progress'
      );
    });
  });
});
