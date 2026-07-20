/**
 * Tests for core UI components: Skeleton
 *
 * Covers:
 *  - Skeleton base component rendering
 *  - aria-hidden="true" by default
 *  - SkeletonText renders correct number of lines
 *  - SkeletonAvatar renders with correct size
 *  - SkeletonCard renders structured card placeholder
 *  - SkeletonChart renders bars
 *  - SkeletonTableRow renders correct columns
 *  - SkeletonButton, SkeletonInput, SkeletonBadge presets
 *  - SkeletonStatTile renders stat tile
 *  - SkeletonError renders with message and retry button
 *  - SkeletonRegion role="status" and aria-busy
 *  - useSkeletonVisibility hook behavior
 *  - ClassName merging
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonChart,
  SkeletonTableRow,
  SkeletonButton,
  SkeletonInput,
  SkeletonBadge,
  SkeletonStatTile,
  SkeletonError,
  useSkeletonVisibility,
} from '../Skeleton';

// ─── Skeleton (base) ────────────────────────────────────────────────

describe('Skeleton', () => {
  // ── Basic rendering ──────────────────────────────────────────────

  describe('Skeleton', () => {
    it('renders a div with aria-hidden="true"', () => {
      render(<Skeleton />);
      const skel = document.querySelector('[aria-hidden="true"]');
      expect(skel).toBeInTheDocument();
    });

    it('has pulse animation class', () => {
      const { container } = render(<Skeleton />);
      const skel = container.firstChild as HTMLElement;
      expect(skel.className).toContain('animate-pulse');
    });

    it('has default background class', () => {
      const { container } = render(<Skeleton />);
      const skel = container.firstChild as HTMLElement;
      expect(skel.className).toContain('bg-slate-200');
    });

    it('merges custom className', () => {
      render(<Skeleton className="h-10 w-20" />);
      const skel = document.querySelector('[aria-hidden="true"]');
      expect(skel?.className).toContain('h-10');
      expect(skel?.className).toContain('w-20');
    });
  });

  // ── SkeletonText ─────────────────────────────────────────────────

  describe('SkeletonText', () => {
    it('renders with role="status" and aria-busy', () => {
      render(<SkeletonText />);
      const region = screen.getByRole('status');
      expect(region).toBeInTheDocument();
      expect(region).toHaveAttribute('aria-busy', 'true');
      expect(region).toHaveAttribute('aria-label', 'Loading content');
    });

    it('renders default 3 lines', () => {
      render(<SkeletonText />);
      const lines = document.querySelectorAll('[aria-hidden="true"]');
      // SkeletonText contains 3 Skeleton lines plus sr-only span
      expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    it('renders custom number of lines', () => {
      render(<SkeletonText lines={5} />);
      const lines = document.querySelectorAll('[aria-hidden="true"]');
      expect(lines.length).toBeGreaterThanOrEqual(5);
    });

    it('renders sr-only text', () => {
      render(<SkeletonText aria-label="Loading posts" />);
      expect(screen.getByText('Loading posts')).toBeInTheDocument();
    });
  });

  // ── SkeletonAvatar ───────────────────────────────────────────────

  describe('SkeletonAvatar', () => {
    it('renders with role="status"', () => {
      render(<SkeletonAvatar />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders with default size 48px', () => {
      render(<SkeletonAvatar />);
      const skel = document.querySelector('.rounded-full');
      expect(skel).toBeInTheDocument();
      expect((skel as HTMLElement).style.width).toBe('48px');
      expect((skel as HTMLElement).style.height).toBe('48px');
    });

    it('renders with custom size', () => {
      render(<SkeletonAvatar size={64} />);
      const skel = document.querySelector('.rounded-full');
      expect((skel as HTMLElement).style.width).toBe('64px');
      expect((skel as HTMLElement).style.height).toBe('64px');
    });
  });

  // ── SkeletonCard ─────────────────────────────────────────────────

  describe('SkeletonCard', () => {
    it('renders with role="status"', () => {
      render(<SkeletonCard />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders a card-shaped placeholder structure', () => {
      const { container } = render(<SkeletonCard />);
      const skels = container.querySelectorAll('[aria-hidden="true"]');
      // Should contain multiple skeleton elements (media, title, lines, buttons)
      expect(skels.length).toBeGreaterThanOrEqual(5);
    });
  });

  // ── SkeletonChart ────────────────────────────────────────────────

  describe('SkeletonChart', () => {
    it('renders with role="status"', () => {
      render(<SkeletonChart />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders default 8 bars', () => {
      const { container } = render(<SkeletonChart />);
      const bars = container.querySelectorAll('.flex-1.rounded-t-md');
      expect(bars.length).toBe(8);
    });

    it('renders custom number of bars', () => {
      const { container } = render(<SkeletonChart bars={4} />);
      const bars = container.querySelectorAll('.flex-1.rounded-t-md');
      expect(bars.length).toBe(4);
    });
  });

  // ── SkeletonTableRow ─────────────────────────────────────────────

  describe('SkeletonTableRow', () => {
    it('renders with role="status"', () => {
      render(<SkeletonTableRow />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders default 4 columns', () => {
      const { container } = render(<SkeletonTableRow />);
      // All flex-1 skeleton children (not counting sr-only)
      const skels = container.querySelectorAll(
        '[aria-hidden="true"].flex-1'
      );
      expect(skels.length).toBe(4);
    });

    it('renders custom number of columns', () => {
      const { container } = render(<SkeletonTableRow columns={6} />);
      const skels = container.querySelectorAll(
        '[aria-hidden="true"].flex-1'
      );
      expect(skels.length).toBe(6);
    });
  });

  // ── Presets ──────────────────────────────────────────────────────

  describe('preset skeletons', () => {
    it('SkeletonButton renders correctly', () => {
      render(<SkeletonButton />);
      const skel = document.querySelector(
        '[aria-hidden="true"].rounded-lg'
      );
      expect(skel).toBeInTheDocument();
      expect(skel?.className).toContain('h-9');
    });

    it('SkeletonInput renders correctly', () => {
      render(<SkeletonInput />);
      const skel = document.querySelector(
        '[aria-hidden="true"].h-10'
      );
      expect(skel).toBeInTheDocument();
      expect(skel?.className).toContain('w-full');
    });

    it('SkeletonBadge renders correctly', () => {
      render(<SkeletonBadge />);
      const skel = document.querySelector(
        '[aria-hidden="true"].rounded-full'
      );
      expect(skel).toBeInTheDocument();
      expect(skel?.className).toContain('h-5');
    });
  });

  // ── SkeletonStatTile ─────────────────────────────────────────────

  describe('SkeletonStatTile', () => {
    it('renders with role="status"', () => {
      render(<SkeletonStatTile />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  // ── SkeletonError ────────────────────────────────────────────────

  describe('SkeletonError', () => {
    it('renders with role="alert"', () => {
      render(<SkeletonError message="Failed to load" />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('displays the error message', () => {
      render(<SkeletonError message="Something went wrong" />);
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('displays default message when none provided', () => {
      render(<SkeletonError />);
      expect(
        screen.getByText('Something went wrong')
      ).toBeInTheDocument();
    });

    it('renders retry button when onRetry provided', () => {
      const onRetry = jest.fn();
      render(
        <SkeletonError message="Error" onRetry={onRetry} />
      );
      const retryBtn = screen.getByRole('button', { name: 'Try Again' });
      expect(retryBtn).toBeInTheDocument();

      fireEvent.click(retryBtn);
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('does not render retry button when onRetry not provided', () => {
      render(<SkeletonError message="Error" />);
      expect(
        screen.queryByRole('button', { name: 'Try Again' })
      ).not.toBeInTheDocument();
    });
  });

  // ── useSkeletonVisibility ────────────────────────────────────────

  describe('useSkeletonVisibility', () => {
    function TestComponent({ loading, minDuration = 300 }: { loading: boolean; minDuration?: number }) {
      const show = useSkeletonVisibility(loading, minDuration);
      return <span data-testid="status">{show ? 'loading' : 'ready'}</span>;
    }

    it('shows skeleton when isLoading is true', () => {
      render(<TestComponent loading={true} />);
      expect(screen.getByTestId('status')).toHaveTextContent('loading');
    });

    it('shows skeleton when isLoading becomes false within minDuration', () => {
      const { rerender } = render(<TestComponent loading={true} />);
      expect(screen.getByTestId('status')).toHaveTextContent('loading');

      rerender(<TestComponent loading={false} />);
      // Should still show loading because minDuration hasn't elapsed
      expect(screen.getByTestId('status')).toHaveTextContent('loading');
    });
  });
});
