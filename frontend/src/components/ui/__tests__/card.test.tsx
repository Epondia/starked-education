/**
 * Tests for core UI components: Card
 *
 * Covers:
 *  - Card renders with correct structure
 *  - CardHeader renders children
 *  - CardTitle renders as h3
 *  - CardDescription renders as p
 *  - CardContent renders children
 *  - CardFooter renders children
 *  - ClassName merging
 *  - Forwarding refs
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../card';

describe('Card', () => {
  // ── Card ─────────────────────────────────────────────────────────

  describe('Card', () => {
    it('renders a div element', () => {
      render(<Card>Card content</Card>);
      const card = screen.getByText('Card content');
      expect(card.tagName).toBe('DIV');
    });

    it('applies default styling classes', () => {
      render(<Card>Content</Card>);
      const card = screen.getByText('Content');
      expect(card.className).toContain('rounded-lg');
      expect(card.className).toContain('border');
      expect(card.className).toContain('shadow-sm');
    });

    it('merges custom className', () => {
      render(<Card className="custom-card">Content</Card>);
      const card = screen.getByText('Content');
      expect(card.className).toContain('custom-card');
      expect(card.className).toContain('rounded-lg'); // still has base classes
    });

    it('forwards ref', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(<Card ref={ref}>Content</Card>);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  // ── CardHeader ───────────────────────────────────────────────────

  describe('CardHeader', () => {
    it('renders a div element', () => {
      render(<CardHeader>Header</CardHeader>);
      const header = screen.getByText('Header');
      expect(header.tagName).toBe('DIV');
    });

    it('applies correct styling', () => {
      render(<CardHeader>Header</CardHeader>);
      const header = screen.getByText('Header');
      expect(header.className).toContain('flex');
      expect(header.className).toContain('flex-col');
      expect(header.className).toContain('p-6');
    });
  });

  // ── CardTitle ────────────────────────────────────────────────────

  describe('CardTitle', () => {
    it('renders as h3 element', () => {
      render(<CardTitle>Title</CardTitle>);
      const title = screen.getByText('Title');
      expect(title.tagName).toBe('H3');
    });

    it('applies title styling', () => {
      render(<CardTitle>Title</CardTitle>);
      const title = screen.getByText('Title');
      expect(title.className).toContain('text-2xl');
      expect(title.className).toContain('font-semibold');
    });
  });

  // ── CardDescription ──────────────────────────────────────────────

  describe('CardDescription', () => {
    it('renders as p element', () => {
      render(<CardDescription>Description</CardDescription>);
      const desc = screen.getByText('Description');
      expect(desc.tagName).toBe('P');
    });

    it('applies muted styling', () => {
      render(<CardDescription>Description</CardDescription>);
      const desc = screen.getByText('Description');
      expect(desc.className).toContain('text-muted-foreground');
    });
  });

  // ── CardContent ───────────────────────────────────────────────────

  describe('CardContent', () => {
    it('renders children', () => {
      render(<CardContent>Main content</CardContent>);
      expect(screen.getByText('Main content')).toBeInTheDocument();
    });

    it('applies padding styling', () => {
      render(<CardContent>Content</CardContent>);
      const content = screen.getByText('Content');
      expect(content.className).toContain('p-6');
    });
  });

  // ── CardFooter ───────────────────────────────────────────────────

  describe('CardFooter', () => {
    it('renders children', () => {
      render(<CardFooter>Footer content</CardFooter>);
      expect(screen.getByText('Footer content')).toBeInTheDocument();
    });

    it('applies flex styling', () => {
      render(<CardFooter>Footer</CardFooter>);
      const footer = screen.getByText('Footer');
      expect(footer.className).toContain('flex');
      expect(footer.className).toContain('items-center');
    });
  });

  // ── Full card composition ────────────────────────────────────────

  describe('full card composition', () => {
    it('renders a complete card with all sub-components', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Course Title</CardTitle>
            <CardDescription>Course description text</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Main card content here</p>
          </CardContent>
          <CardFooter>
            <button>Action</button>
          </CardFooter>
        </Card>
      );

      expect(screen.getByText('Course Title')).toBeInTheDocument();
      expect(screen.getByText('Course description text')).toBeInTheDocument();
      expect(screen.getByText('Main card content here')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
    });
  });
});
