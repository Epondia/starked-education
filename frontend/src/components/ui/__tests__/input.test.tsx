/**
 * Tests for core UI components: Input
 *
 * Covers:
 *  - Default rendering
 *  - Type attribute
 *  - Placeholder
 *  - Disabled state
 *  - Value and onChange
 *  - ClassName merging
 *  - Forwarding ref
 *  - aria attributes
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Input } from '../input';

describe('Input', () => {
  // ── Basic rendering ──────────────────────────────────────────────

  describe('rendering', () => {
    it('renders an input element', () => {
      render(<Input />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders with default type="text"', () => {
      render(<Input />);
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'text');
    });

    it('renders with specified type', () => {
      render(<Input type="email" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email');
    });

    it('renders with type="password"', () => {
      // screen.getByRole doesn't match password inputs by default
      render(<Input type="password" data-testid="pwd-input" />);
      const input = screen.getByTestId('pwd-input');
      expect(input).toHaveAttribute('type', 'password');
    });
  });

  // ── Placeholder ──────────────────────────────────────────────────

  describe('placeholder', () => {
    it('renders with placeholder text', () => {
      render(<Input placeholder="Enter your name" />);
      expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
    });
  });

  // ── Disabled state ───────────────────────────────────────────────

  describe('disabled', () => {
    it('applies disabled attribute', () => {
      render(<Input disabled />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('applies disabled styling', () => {
      render(<Input disabled />);
      const input = screen.getByRole('textbox');
      expect(input.className).toContain('disabled:opacity-50');
    });
  });

  // ── Value and onChange ───────────────────────────────────────────

  describe('value and onChange', () => {
    it('displays the provided value', () => {
      render(<Input value="test value" onChange={jest.fn()} />);
      expect(screen.getByRole('textbox')).toHaveValue('test value');
    });

    it('calls onChange when value changes', () => {
      const onChange = jest.fn();
      render(<Input onChange={onChange} />);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new value' } });
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  // ── ClassName merging ────────────────────────────────────────────

  describe('className', () => {
    it('merges custom className with default classes', () => {
      render(<Input className="custom-input" />);
      const input = screen.getByRole('textbox');
      expect(input.className).toContain('custom-input');
      expect(input.className).toContain('flex'); // base classes preserved
    });
  });

  // ── Ref forwarding ───────────────────────────────────────────────

  describe('ref forwarding', () => {
    it('forwards ref to the input element', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it('allows focusing via ref', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} />);
      ref.current?.focus();
      expect(ref.current).toHaveFocus();
    });
  });

  // ── HTML attributes ──────────────────────────────────────────────

  describe('HTML attributes', () => {
    it('passes through aria-label', () => {
      render(<Input aria-label="Search courses" />);
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'aria-label',
        'Search courses'
      );
    });

    it('passes through required attribute', () => {
      render(<Input required />);
      expect(screen.getByRole('textbox')).toBeRequired();
    });

    it('passes through name attribute', () => {
      render(<Input name="email" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('name', 'email');
    });

    it('passes through data attributes', () => {
      render(<Input data-testid="custom-input" />);
      expect(screen.getByTestId('custom-input')).toBeInTheDocument();
    });

    it('passes through autoComplete', () => {
      render(<Input autoComplete="off" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('autocomplete', 'off');
    });
  });

  // ── Read-only ────────────────────────────────────────────────────

  describe('readOnly', () => {
    it('renders read-only input', () => {
      render(<Input readOnly value="read only" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
    });
  });
});
