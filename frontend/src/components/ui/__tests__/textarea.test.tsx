/**
 * Tests for core UI components: Textarea
 *
 * Covers:
 *  - Default rendering
 *  - Placeholder text
 *  - Disabled state
 *  - Value and onChange
 *  - ClassName merging
 *  - Forwarding ref
 *  - Rows attribute
 *  - HTML attributes
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Textarea } from '../textarea';

describe('Textarea', () => {
  // ── Basic rendering ──────────────────────────────────────────────

  describe('rendering', () => {
    it('renders a textarea element', () => {
      render(<Textarea />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders with default min height styling', () => {
      render(<Textarea />);
      const ta = screen.getByRole('textbox');
      expect(ta.className).toContain('min-h-[80px]');
    });

    it('renders with border styling', () => {
      render(<Textarea />);
      const ta = screen.getByRole('textbox');
      expect(ta.className).toContain('border');
      expect(ta.className).toContain('rounded-md');
    });
  });

  // ── Placeholder ──────────────────────────────────────────────────

  describe('placeholder', () => {
    it('renders with placeholder text', () => {
      render(<Textarea placeholder="Enter your message" />);
      expect(
        screen.getByPlaceholderText('Enter your message')
      ).toBeInTheDocument();
    });
  });

  // ── Disabled state ───────────────────────────────────────────────

  describe('disabled', () => {
    it('applies disabled attribute', () => {
      render(<Textarea disabled />);
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('applies disabled styling', () => {
      render(<Textarea disabled />);
      const ta = screen.getByRole('textbox');
      expect(ta.className).toContain('disabled:opacity-50');
      expect(ta.className).toContain('disabled:cursor-not-allowed');
    });
  });

  // ── Value and onChange ───────────────────────────────────────────

  describe('value and onChange', () => {
    it('displays the provided value', () => {
      render(<Textarea value="Hello world" onChange={jest.fn()} />);
      expect(screen.getByRole('textbox')).toHaveValue('Hello world');
    });

    it('calls onChange when text is entered', () => {
      const onChange = jest.fn();
      render(<Textarea onChange={onChange} />);
      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: 'new text' },
      });
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('updates value on change', () => {
      const onChange = jest.fn();
      const { rerender } = render(<Textarea value="" onChange={onChange} />);
      const ta = screen.getByRole('textbox');
      fireEvent.change(ta, { target: { value: 'updated' } });
      expect(onChange).toHaveBeenCalled();
      // Simulate controlled update
      rerender(<Textarea value="updated" onChange={onChange} />);
      expect(ta).toHaveValue('updated');
    });
  });

  // ── ClassName merging ────────────────────────────────────────────

  describe('className', () => {
    it('merges custom className with default classes', () => {
      render(<Textarea className="custom-textarea" />);
      const ta = screen.getByRole('textbox');
      expect(ta.className).toContain('custom-textarea');
      expect(ta.className).toContain('min-h-[80px]');
    });
  });

  // ── Ref forwarding ───────────────────────────────────────────────

  describe('ref forwarding', () => {
    it('forwards ref to the textarea element', () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      render(<Textarea ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    });

    it('allows focusing via ref', () => {
      const ref = React.createRef<HTMLTextAreaElement>();
      render(<Textarea ref={ref} />);
      ref.current?.focus();
      expect(ref.current).toHaveFocus();
    });
  });

  // ── HTML attributes ──────────────────────────────────────────────

  describe('HTML attributes', () => {
    it('passes through name attribute', () => {
      render(<Textarea name="bio" />);
      expect(screen.getByRole('textbox')).toHaveAttribute('name', 'bio');
    });

    it('passes through rows attribute', () => {
      render(<Textarea rows={5} />);
      expect(screen.getByRole('textbox')).toHaveAttribute('rows', '5');
    });

    it('passes through required attribute', () => {
      render(<Textarea required />);
      expect(screen.getByRole('textbox')).toBeRequired();
    });

    it('passes through aria-label', () => {
      render(<Textarea aria-label="Your feedback" />);
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'aria-label',
        'Your feedback'
      );
    });

    it('passes through data attributes', () => {
      render(<Textarea data-testid="bio-input" />);
      expect(screen.getByTestId('bio-input')).toBeInTheDocument();
    });
  });

  // ── Read-only ────────────────────────────────────────────────────

  describe('readOnly', () => {
    it('renders a read-only textarea', () => {
      render(<Textarea readOnly value="Read only content" />);
      const ta = screen.getByRole('textbox');
      expect(ta).toHaveAttribute('readonly');
      expect(ta).toHaveValue('Read only content');
    });
  });
});
