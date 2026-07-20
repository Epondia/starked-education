/**
 * Tests for core UI components: Badge
 *
 * Covers:
 *  - Default rendering
 *  - Variants (default, secondary, destructive, outline)
 *  - ClassName merging
 *  - Custom content/children
 *  - HTML attribute passthrough
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Badge } from '../badge';

describe('Badge', () => {
  // ── Basic rendering ──────────────────────────────────────────────

  describe('rendering', () => {
    it('renders as a div element', () => {
      render(<Badge>New</Badge>);
      const badge = screen.getByText('New');
      expect(badge.tagName).toBe('DIV');
    });

    it('renders children correctly', () => {
      render(<Badge>Active</Badge>);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders with nested content', () => {
      render(
        <Badge>
          <span>Premium</span>
        </Badge>
      );
      expect(screen.getByText('Premium')).toBeInTheDocument();
    });
  });

  // ── Variants ─────────────────────────────────────────────────────

  describe('variants', () => {
    it('renders with default variant', () => {
      render(<Badge variant="default">Default</Badge>);
      const badge = screen.getByText('Default');
      expect(badge.className).toContain('bg-primary');
      expect(badge.className).toContain('text-primary-foreground');
    });

    it('renders with secondary variant', () => {
      render(<Badge variant="secondary">Secondary</Badge>);
      const badge = screen.getByText('Secondary');
      expect(badge.className).toContain('bg-secondary');
      expect(badge.className).toContain('text-secondary-foreground');
    });

    it('renders with destructive variant', () => {
      render(<Badge variant="destructive">Removed</Badge>);
      const badge = screen.getByText('Removed');
      expect(badge.className).toContain('bg-destructive');
      expect(badge.className).toContain('text-destructive-foreground');
    });

    it('renders with outline variant', () => {
      render(<Badge variant="outline">Outline</Badge>);
      const badge = screen.getByText('Outline');
      expect(badge.className).toContain('text-foreground');
    });
  });

  // ── ClassName merging ────────────────────────────────────────────

  describe('className', () => {
    it('merges custom className with variant classes', () => {
      render(<Badge className="custom-badge">Custom</Badge>);
      const badge = screen.getByText('Custom');
      expect(badge.className).toContain('custom-badge');
    });

    it('preserves variant styling when custom class added', () => {
      render(
        <Badge variant="destructive" className="extra-class">
          Badge
        </Badge>
      );
      const badge = screen.getByText('Badge');
      expect(badge.className).toContain('extra-class');
      expect(badge.className).toContain('bg-destructive');
    });
  });

  // ── HTML attributes ──────────────────────────────────────────────

  describe('HTML attributes', () => {
    it('passes through id attribute', () => {
      render(<Badge id="status-badge">Status</Badge>);
      expect(screen.getByText('Status')).toHaveAttribute('id', 'status-badge');
    });

    it('passes through data attributes', () => {
      render(<Badge data-testid="my-badge">Test</Badge>);
      expect(screen.getByTestId('my-badge')).toBeInTheDocument();
    });

    it('passes through aria attributes', () => {
      render(<Badge aria-label="Course status">Draft</Badge>);
      expect(screen.getByText('Draft')).toHaveAttribute(
        'aria-label',
        'Course status'
      );
    });

    it('handles onClick event', () => {
      const onClick = jest.fn();
      render(<Badge onClick={onClick}>Clickable</Badge>);
      screen.getByText('Clickable').click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});
