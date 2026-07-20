/**
 * Tests for core UI components: Select
 *
 * Covers:
 *  - Default rendering
 *  - Options rendering
 *  - Value selection
 *  - onValueChange callback
 *  - Disabled state
 *  - ClassName merging
 *  - Forwarding ref
 *  - HTML attributes
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Select } from '../select';

describe('Select', () => {
  // ── Basic rendering ──────────────────────────────────────────────

  describe('rendering', () => {
    it('renders a select element', () => {
      render(
        <Select>
          <option value="1">Option 1</option>
        </Select>
      );
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('renders options correctly', () => {
      render(
        <Select>
          <option value="en">English</option>
          <option value="fr">French</option>
          <option value="es">Spanish</option>
        </Select>
      );
      expect(screen.getByText('English')).toBeInTheDocument();
      expect(screen.getByText('French')).toBeInTheDocument();
      expect(screen.getByText('Spanish')).toBeInTheDocument();
    });

    it('has default styling', () => {
      render(
        <Select>
          <option value="1">Option</option>
        </Select>
      );
      const select = screen.getByRole('combobox');
      expect(select.className).toContain('rounded-md');
      expect(select.className).toContain('border');
    });
  });

  // ── Value selection ──────────────────────────────────────────────

  describe('value selection', () => {
    it('calls onChange when option is selected', () => {
      const onChange = jest.fn();
      render(
        <Select onChange={onChange}>
          <option value="1">One</option>
          <option value="2">Two</option>
        </Select>
      );
      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: '2' },
      });
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('calls onValueChange with the selected value', () => {
      const onValueChange = jest.fn();
      render(
        <Select onValueChange={onValueChange}>
          <option value="option-a">A</option>
          <option value="option-b">B</option>
        </Select>
      );
      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: 'option-b' },
      });
      expect(onValueChange).toHaveBeenCalledWith('option-b');
    });
  });

  // ── Disabled state ───────────────────────────────────────────────

  describe('disabled', () => {
    it('applies disabled attribute', () => {
      render(
        <Select disabled>
          <option value="1">Option</option>
        </Select>
      );
      expect(screen.getByRole('combobox')).toBeDisabled();
    });

    it('applies disabled styling', () => {
      render(
        <Select disabled>
          <option value="1">Option</option>
        </Select>
      );
      const select = screen.getByRole('combobox');
      expect(select.className).toContain('disabled:opacity-50');
    });
  });

  // ── ClassName merging ────────────────────────────────────────────

  describe('className', () => {
    it('merges custom className with default classes', () => {
      render(
        <Select className="language-select">
          <option value="1">Option</option>
        </Select>
      );
      const select = screen.getByRole('combobox');
      expect(select.className).toContain('language-select');
      expect(select.className).toContain('rounded-md');
    });
  });

  // ── Ref forwarding ───────────────────────────────────────────────

  describe('ref forwarding', () => {
    it('forwards ref to the select element', () => {
      const ref = React.createRef<HTMLSelectElement>();
      render(
        <Select ref={ref}>
          <option value="1">Option</option>
        </Select>
      );
      expect(ref.current).toBeInstanceOf(HTMLSelectElement);
    });
  });

  // ── HTML attributes ──────────────────────────────────────────────

  describe('HTML attributes', () => {
    it('passes through name attribute', () => {
      render(
        <Select name="language">
          <option value="en">English</option>
        </Select>
      );
      expect(screen.getByRole('combobox')).toHaveAttribute('name', 'language');
    });

    it('passes through required attribute', () => {
      render(
        <Select required>
          <option value="">Select...</option>
          <option value="1">Option</option>
        </Select>
      );
      expect(screen.getByRole('combobox')).toBeRequired();
    });

    it('passes through aria-label', () => {
      render(
        <Select aria-label="Course category">
          <option value="1">Option</option>
        </Select>
      );
      expect(screen.getByRole('combobox')).toHaveAttribute(
        'aria-label',
        'Course category'
      );
    });

    it('passes through data attributes', () => {
      render(
        <Select data-testid="category-select">
          <option value="1">Option</option>
        </Select>
      );
      expect(screen.getByTestId('category-select')).toBeInTheDocument();
    });

    it('passes through defaultValue', () => {
      render(
        <Select defaultValue="option-b">
          <option value="option-a">A</option>
          <option value="option-b">B</option>
        </Select>
      );
      expect(screen.getByRole('combobox')).toHaveValue('option-b');
    });
  });
});
