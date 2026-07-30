/**
 * Tests for core UI components: Label
 *
 * Covers:
 *  - Default rendering
 *  - For association (htmlFor)
 *  - Children/content
 *  - ClassName merging
 *  - Forwarding ref
 *  - HTML attributes
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Label } from '../label';

describe('Label', () => {
  // ── Basic rendering ──────────────────────────────────────────────

  describe('rendering', () => {
    it('renders a label element', () => {
      render(<Label>Email</Label>);
      const label = screen.getByText('Email');
      expect(label.tagName).toBe('LABEL');
    });

    it('renders children correctly', () => {
      render(<Label>Full Name</Label>);
      expect(screen.getByText('Full Name')).toBeInTheDocument();
    });

    it('has default text styling', () => {
      render(<Label>Test</Label>);
      const label = screen.getByText('Test');
      expect(label.className).toContain('text-sm');
      expect(label.className).toContain('font-medium');
    });
  });

  // ── htmlFor association ──────────────────────────────────────────

  describe('htmlFor', () => {
    it('sets the htmlFor attribute', () => {
      render(<Label htmlFor="email-input">Email</Label>);
      expect(screen.getByText('Email')).toHaveAttribute('for', 'email-input');
    });

    it('associates label with input via htmlFor', () => {
      render(
        <>
          <Label htmlFor="username">Username</Label>
          <input id="username" />
        </>
      );
      // Verify the label is properly associated with the input
      const label = screen.getByText('Username');
      expect(label).toHaveAttribute('for', 'username');
      const input = document.getElementById('username');
      expect(input).toBeInTheDocument();
    });
  });

  // ── ClassName merging ────────────────────────────────────────────

  describe('className', () => {
    it('merges custom className with default classes', () => {
      render(<Label className="custom-label">Test</Label>);
      const label = screen.getByText('Test');
      expect(label.className).toContain('custom-label');
      expect(label.className).toContain('text-sm');
    });
  });

  // ── Ref forwarding ───────────────────────────────────────────────

  describe('ref forwarding', () => {
    it('forwards ref to the label element', () => {
      const ref = React.createRef<HTMLLabelElement>();
      render(<Label ref={ref}>Ref Label</Label>);
      expect(ref.current).toBeInstanceOf(HTMLLabelElement);
    });

    it('exposes the htmlFor via ref', () => {
      const ref = React.createRef<HTMLLabelElement>();
      render(
        <Label ref={ref} htmlFor="test-input">
          Test
        </Label>
      );
      expect(ref.current?.htmlFor).toBe('test-input');
    });
  });

  // ── HTML attributes ──────────────────────────────────────────────

  describe('HTML attributes', () => {
    it('passes through id attribute', () => {
      render(<Label id="email-label">Email</Label>);
      expect(screen.getByText('Email')).toHaveAttribute('id', 'email-label');
    });

    it('passes through aria attributes', () => {
      render(<Label aria-hidden="true">Hidden</Label>);
      expect(screen.getByText('Hidden')).toHaveAttribute(
        'aria-hidden',
        'true'
      );
    });

    it('passes through data attributes', () => {
      render(<Label data-testid="my-label">Test</Label>);
      expect(screen.getByTestId('my-label')).toBeInTheDocument();
    });

    it('handles onClick event', () => {
      const onClick = jest.fn();
      render(<Label onClick={onClick}>Clickable</Label>);
      screen.getByText('Clickable').click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });
});
