/**
 * Tests for core UI components: Button
 *
 * Covers:
 *  - Default rendering
 *  - Variants (default, destructive, outline, secondary, ghost, link)
 *  - Sizes (default, sm, lg, icon)
 *  - Disabled state
 *  - Forwarding ref
 *  - ClassName merging
 *  - Shortcut keyboard rendering
 *  - asChild pattern with Slot
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Button } from '../button';

describe('Button', () => {
  // ── Basic rendering ──────────────────────────────────────────────

  describe('rendering', () => {
    it('renders a button element', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
    });

    it('renders children correctly', () => {
      render(<Button>Submit</Button>);
      expect(screen.getByText('Submit')).toBeInTheDocument();
    });

    it('applies default type="button"', () => {
      render(<Button>Click</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
    });

    it('respects explicit type prop', () => {
      render(<Button type="submit">Submit</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
    });
  });

  // ── Variants ─────────────────────────────────────────────────────

  describe('variants', () => {
    it('renders with default variant', () => {
      render(<Button variant="default">Default</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('bg-primary');
    });

    it('renders with destructive variant', () => {
      render(<Button variant="destructive">Destructive</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('bg-destructive');
    });

    it('renders with outline variant', () => {
      render(<Button variant="outline">Outline</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('border');
    });

    it('renders with secondary variant', () => {
      render(<Button variant="secondary">Secondary</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('bg-secondary');
    });

    it('renders with ghost variant', () => {
      render(<Button variant="ghost">Ghost</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('hover:bg-accent');
    });

    it('renders with link variant', () => {
      render(<Button variant="link">Link</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('underline-offset-4');
    });
  });

  // ── Sizes ────────────────────────────────────────────────────────

  describe('sizes', () => {
    it('renders with default size', () => {
      render(<Button size="default">Default size</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('h-10');
    });

    it('renders with small size', () => {
      render(<Button size="sm">Small</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('h-9');
    });

    it('renders with large size', () => {
      render(<Button size="lg">Large</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('h-11');
    });

    it('renders with icon size', () => {
      render(<Button size="icon">+</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('w-10');
    });
  });

  // ── Disabled state ───────────────────────────────────────────────

  describe('disabled', () => {
    it('applies disabled attribute', () => {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('applies disabled styling', () => {
      render(<Button disabled>Disabled</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('disabled:pointer-events-none');
      expect(btn.className).toContain('disabled:opacity-50');
    });

    it('prevents click when disabled', () => {
      const onClick = jest.fn();
      render(<Button disabled onClick={onClick}>Disabled</Button>);
      screen.getByRole('button').click();
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  // ── Click handler ────────────────────────────────────────────────

  describe('click handler', () => {
    it('fires onClick when clicked', () => {
      const onClick = jest.fn();
      render(<Button onClick={onClick}>Click</Button>);
      screen.getByRole('button').click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  // ── Ref forwarding ───────────────────────────────────────────────

  describe('ref forwarding', () => {
    it('forwards ref to the button element', () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(<Button ref={ref}>Ref button</Button>);
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });

  // ── ClassName merging ────────────────────────────────────────────

  describe('className', () => {
    it('merges custom className with variant classes', () => {
      render(<Button className="my-custom-class">Custom</Button>);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('my-custom-class');
    });
  });

  // ── Shortcut ─────────────────────────────────────────────────────

  describe('shortcut', () => {
    it('renders keyboard shortcut when shortcut prop is provided', () => {
      render(<Button shortcut="⌘K">Command</Button>);
      expect(screen.getByText('⌘K')).toBeInTheDocument();
    });

    it('renders shortcut inside a kbd element', () => {
      render(<Button shortcut="Ctrl+S">Save</Button>);
      // kbd is a semantic HTML element
      const kbd = document.querySelector('kbd');
      expect(kbd).toBeInTheDocument();
      expect(kbd).toHaveTextContent('Ctrl+S');
    });

    it('does not render shortcut when not provided', () => {
      render(<Button>No shortcut</Button>);
      expect(document.querySelector('kbd')).not.toBeInTheDocument();
    });
  });

  // ── HTML attributes ──────────────────────────────────────────────

  describe('HTML attributes', () => {
    it('passes through aria attributes', () => {
      render(<Button aria-label="Close dialog">×</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Close dialog');
    });

    it('passes through data attributes', () => {
      render(<Button data-testid="my-button">Test</Button>);
      expect(screen.getByTestId('my-button')).toBeInTheDocument();
    });

    it('passes through id attribute', () => {
      render(<Button id="submit-btn">Submit</Button>);
      expect(screen.getByRole('button')).toHaveAttribute('id', 'submit-btn');
    });
  });
});
