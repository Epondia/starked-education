/**
 * Tests for core UI components: Alert, AlertTitle, AlertDescription
 *
 * Covers:
 *  - Alert renders with correct role and styling
 *  - Alert variants (default, destructive)
 *  - AlertTitle renders as h5
 *  - AlertDescription renders children
 *  - ClassName merging
 *  - Forwarding refs
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Alert, AlertTitle, AlertDescription } from '../alert';

describe('Alert', () => {
  // ── Alert ────────────────────────────────────────────────────────

  describe('Alert', () => {
    it('renders with role="alert"', () => {
      render(<Alert>Something happened</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Something happened');
    });

    it('renders with default variant styling', () => {
      render(<Alert>Default alert</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('border-gray-200');
      expect(alert.className).toContain('rounded-lg');
    });

    it('renders with destructive variant', () => {
      render(<Alert variant="destructive">Error occurred</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('border-red-500');
      expect(alert.className).toContain('bg-red-50');
      expect(alert.className).toContain('text-red-700');
    });

    it('merges custom className', () => {
      render(<Alert className="my-alert">Custom</Alert>);
      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('my-alert');
      expect(alert.className).toContain('rounded-lg');
    });

    it('forwards ref', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<Alert ref={ref}>Ref Alert</Alert>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('renders children correctly', () => {
      render(
        <Alert>
          <span data-testid="inner">Inner content</span>
        </Alert>
      );
      expect(screen.getByTestId('inner')).toBeInTheDocument();
    });
  });

  // ── AlertTitle ───────────────────────────────────────────────────

  describe('AlertTitle', () => {
    it('renders as an h5 element', () => {
      render(<AlertTitle>Notice</AlertTitle>);
      const title = screen.getByText('Notice');
      expect(title.tagName).toBe('H5');
    });

    it('applies title styling', () => {
      render(<AlertTitle>Title</AlertTitle>);
      const title = screen.getByText('Title');
      expect(title.className).toContain('font-medium');
      expect(title.className).toContain('leading-none');
    });

    it('merges custom className', () => {
      render(<AlertTitle className="custom-title">Title</AlertTitle>);
      const title = screen.getByText('Title');
      expect(title.className).toContain('custom-title');
    });

    it('forwards ref', () => {
      const ref = React.createRef<HTMLParagraphElement>();
      render(<AlertTitle ref={ref}>Ref Title</AlertTitle>);
      expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
    });
  });

  // ── AlertDescription ─────────────────────────────────────────────

  describe('AlertDescription', () => {
    it('renders children', () => {
      render(<AlertDescription>More details here</AlertDescription>);
      expect(screen.getByText('More details here')).toBeInTheDocument();
    });

    it('applies description styling', () => {
      render(<AlertDescription>Description</AlertDescription>);
      const desc = screen.getByText('Description');
      expect(desc.className).toContain('text-sm');
    });

    it('merges custom className', () => {
      render(
        <AlertDescription className="custom-desc">
          Description
        </AlertDescription>
      );
      const desc = screen.getByText('Description');
      expect(desc.className).toContain('custom-desc');
    });

    it('forwards ref', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<AlertDescription ref={ref}>Ref Desc</AlertDescription>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  // ── Full alert composition ───────────────────────────────────────

  describe('full alert composition', () => {
    it('renders a complete alert with title and description', () => {
      render(
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Something went wrong. Please try again.
          </AlertDescription>
        </Alert>
      );

      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(
        screen.getByText('Something went wrong. Please try again.')
      ).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('preserves destructive styling in composed alert', () => {
      render(
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>You do not have permission.</AlertDescription>
        </Alert>
      );

      const alert = screen.getByRole('alert');
      expect(alert.className).toContain('text-red-700');
    });
  });
});
