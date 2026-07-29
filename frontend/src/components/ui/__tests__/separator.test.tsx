/**
 * Tests for core UI components: Separator
 *
 * Covers:
 *  - Default rendering (horizontal, decorative)
 *  - Orientation (horizontal vs vertical)
 *  - Decorative vs semantic separator (role="none" vs role="separator")
 *  - ClassName merging
 *  - Forwarding ref
 *  - aria-orientation
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Separator } from '../separator';

describe('Separator', () => {
  // ── Basic rendering ──────────────────────────────────────────────

  describe('rendering', () => {
    it('renders a div element', () => {
      const { container } = render(<Separator />);
      const divider = container.firstChild as HTMLElement;
      expect(divider.tagName).toBe('DIV');
    });

    it('has shrink-0 styling', () => {
      const { container } = render(<Separator />);
      const divider = container.firstChild as HTMLElement;
      expect(divider.className).toContain('shrink-0');
    });
  });

  // ── Orientation ──────────────────────────────────────────────────

  describe('orientation', () => {
    it('renders horizontal by default', () => {
      const { container } = render(<Separator />);
      const divider = container.firstChild as HTMLElement;
      expect(divider.className).toContain('h-[1px]');
      expect(divider.className).toContain('w-full');
    });

    it('renders vertical when orientation="vertical"', () => {
      const { container } = render(<Separator orientation="vertical" />);
      const divider = container.firstChild as HTMLElement;
      expect(divider.className).toContain('h-full');
      expect(divider.className).toContain('w-[1px]');
    });

    it('sets aria-orientation correctly for horizontal', () => {
      const { container } = render(<Separator orientation="horizontal" />);
      const divider = container.firstChild as HTMLElement;
      expect(divider.getAttribute('aria-orientation')).toBe('horizontal');
    });

    it('sets aria-orientation correctly for vertical', () => {
      const { container } = render(<Separator orientation="vertical" />);
      const divider = container.firstChild as HTMLElement;
      expect(divider.getAttribute('aria-orientation')).toBe('vertical');
    });
  });

  // ── Decorative ───────────────────────────────────────────────────

  describe('decorative', () => {
    it('has role="none" when decorative (default)', () => {
      const { container } = render(<Separator />);
      const divider = container.firstChild as HTMLElement;
      expect(divider.getAttribute('role')).toBe('none');
    });

    it('has role="separator" when decorative=false', () => {
      const { container } = render(<Separator decorative={false} />);
      const divider = container.firstChild as HTMLElement;
      expect(divider.getAttribute('role')).toBe('separator');
    });

    it('semantic separator still has correct styling', () => {
      const { container } = render(
        <Separator decorative={false} orientation="horizontal" />
      );
      const divider = container.firstChild as HTMLElement;
      expect(divider.className).toContain('h-[1px]');
    });
  });

  // ── ClassName merging ────────────────────────────────────────────

  describe('className', () => {
    it('merges custom className with default classes', () => {
      const { container } = render(<Separator className="my-separator" />);
      const divider = container.firstChild as HTMLElement;
      expect(divider.className).toContain('my-separator');
      expect(divider.className).toContain('shrink-0');
    });
  });

  // ── Ref forwarding ───────────────────────────────────────────────

  describe('ref forwarding', () => {
    it('forwards ref to the div element', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<Separator ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  // ── HTML attributes ──────────────────────────────────────────────

  describe('HTML attributes', () => {
    it('passes through data attributes', () => {
      const { container } = render(<Separator data-testid="section-divider" />);
      const divider = container.firstChild as HTMLElement;
      expect(divider.getAttribute('data-testid')).toBe('section-divider');
    });
  });
});
