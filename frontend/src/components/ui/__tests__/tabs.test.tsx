/**
 * Tests for core UI components: Tabs, TabsList, TabsTrigger, TabsContent
 *
 * Covers:
 *  - Tabs renders with context
 *  - TabsList renders with role="tablist"
 *  - TabsTrigger renders with role="tab" and aria-selected
 *  - Active tab styling
 *  - Tab switching via onClick
 *  - Tab switching via keyboard navigation (ArrowLeft, ArrowRight, Home, End)
 *  - TabsContent shows/hides based on active value
 *  - ClassName merging
 *  - Forwarding refs
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../tabs';

describe('Tabs', () => {
  // ── TabsList ─────────────────────────────────────────────────────

  describe('TabsList', () => {
    it('renders with role="tablist"', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList />
        </Tabs>
      );
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('applies default styling', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList />
        </Tabs>
      );
      const list = screen.getByRole('tablist');
      expect(list.className).toContain('inline-flex');
      expect(list.className).toContain('bg-gray-100');
    });

    it('merges custom className', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList className="custom-list" />
        </Tabs>
      );
      const list = screen.getByRole('tablist');
      expect(list.className).toContain('custom-list');
    });
  });

  // ── TabsTrigger ──────────────────────────────────────────────────

  describe('TabsTrigger', () => {
    it('renders with role="tab"', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
        </Tabs>
      );
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toBeInTheDocument();
    });

    it('sets aria-selected="true" for active tab', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
        </Tabs>
      );
      expect(screen.getByRole('tab', { name: 'Tab 1' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByRole('tab', { name: 'Tab 2' })).toHaveAttribute(
        'aria-selected',
        'false'
      );
    });

    it('has active styling when selected', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Active</TabsTrigger>
            <TabsTrigger value="tab2">Inactive</TabsTrigger>
          </TabsList>
        </Tabs>
      );
      const activeTab = screen.getByRole('tab', { name: 'Active' });
      expect(activeTab.className).toContain('bg-white');
      expect(activeTab.className).toContain('shadow-sm');
    });

    it('does not have active styling when not selected', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Active</TabsTrigger>
            <TabsTrigger value="tab2">Inactive</TabsTrigger>
          </TabsList>
        </Tabs>
      );
      const inactiveTab = screen.getByRole('tab', { name: 'Inactive' });
      expect(inactiveTab.className).not.toContain('shadow-sm');
    });

    it('renders as a button element', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab</TabsTrigger>
          </TabsList>
        </Tabs>
      );
      expect(screen.getByRole('tab').tagName).toBe('BUTTON');
    });
  });

  // ── Tab switching via click ──────────────────────────────────────

  describe('tab switching', () => {
    it('switches active tab on click', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      // Tab 1 content is visible, Tab 2 content is not
      expect(screen.getByText('Content 1')).toBeInTheDocument();
      expect(screen.queryByText('Content 2')).not.toBeInTheDocument();

      // Click Tab 2
      fireEvent.click(screen.getByRole('tab', { name: 'Tab 2' }));

      // Now Tab 2 content is visible
      expect(screen.getByText('Content 2')).toBeInTheDocument();
      expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
    });

    it('calls onValueChange when provided', () => {
      const onValueChange = jest.fn();
      render(
        <Tabs defaultValue="tab1" onValueChange={onValueChange}>
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
        </Tabs>
      );

      fireEvent.click(screen.getByRole('tab', { name: 'Tab 2' }));
      expect(onValueChange).toHaveBeenCalledWith('tab2');
    });
  });

  // ── Keyboard navigation ──────────────────────────────────────────

  describe('keyboard navigation', () => {
    function renderTabs() {
      return render(
        <Tabs defaultValue="tab2">
          <TabsList>
            <TabsTrigger value="tab1">First</TabsTrigger>
            <TabsTrigger value="tab2">Second</TabsTrigger>
            <TabsTrigger value="tab3">Third</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">First Content</TabsContent>
          <TabsContent value="tab2">Second Content</TabsContent>
          <TabsContent value="tab3">Third Content</TabsContent>
        </Tabs>
      );
    }

    it('moves focus to next tab on ArrowRight', () => {
      renderTabs();
      const tab2 = screen.getByRole('tab', { name: 'Second' });
      tab2.focus();

      fireEvent.keyDown(tab2, { key: 'ArrowRight' });
      // Next tab (Third) should now be focused
      expect(screen.getByRole('tab', { name: 'Third' })).toHaveFocus();
    });

    it('wraps around on ArrowRight at end', () => {
      renderTabs();
      const tab3 = screen.getByRole('tab', { name: 'Third' });
      tab3.focus();

      fireEvent.keyDown(tab3, { key: 'ArrowRight' });
      // Should wrap to first tab
      expect(screen.getByRole('tab', { name: 'First' })).toHaveFocus();
    });

    it('moves focus to previous tab on ArrowLeft', () => {
      renderTabs();
      const tab2 = screen.getByRole('tab', { name: 'Second' });
      tab2.focus();

      fireEvent.keyDown(tab2, { key: 'ArrowLeft' });
      expect(screen.getByRole('tab', { name: 'First' })).toHaveFocus();
    });

    it('wraps around on ArrowLeft at beginning', () => {
      renderTabs();
      const tab1 = screen.getByRole('tab', { name: 'First' });
      tab1.focus();

      fireEvent.keyDown(tab1, { key: 'ArrowLeft' });
      expect(screen.getByRole('tab', { name: 'Third' })).toHaveFocus();
    });

    it('moves focus to first tab on Home', () => {
      renderTabs();
      const tab3 = screen.getByRole('tab', { name: 'Third' });
      tab3.focus();

      fireEvent.keyDown(tab3, { key: 'Home' });
      expect(screen.getByRole('tab', { name: 'First' })).toHaveFocus();
    });

    it('moves focus to last tab on End', () => {
      renderTabs();
      const tab1 = screen.getByRole('tab', { name: 'First' });
      tab1.focus();

      fireEvent.keyDown(tab1, { key: 'End' });
      expect(screen.getByRole('tab', { name: 'Third' })).toHaveFocus();
    });
  });

  // ── TabsContent ──────────────────────────────────────────────────

  describe('TabsContent', () => {
    it('renders content when value matches active tab', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Visible content</TabsContent>
        </Tabs>
      );
      expect(screen.getByText('Visible content')).toBeInTheDocument();
    });

    it('does not render content when value does not match', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab2">Hidden content</TabsContent>
        </Tabs>
      );
      expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
    });

    it('renders with role="tabpanel"', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content</TabsContent>
        </Tabs>
      );
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('has data-state="active" when visible', () => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content</TabsContent>
        </Tabs>
      );
      expect(screen.getByRole('tabpanel')).toHaveAttribute(
        'data-state',
        'active'
      );
    });
  });

  // ── Controlled mode ──────────────────────────────────────────────

  describe('controlled mode', () => {
    it('renders with externally controlled value', () => {
      render(
        <Tabs value="tab2">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>
      );

      expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
      expect(screen.getByText('Content 2')).toBeInTheDocument();
    });
  });

  // ── Full tabs composition ────────────────────────────────────────

  describe('full tabs composition', () => {
    it('renders a complete tab interface', () => {
      render(
        <Tabs defaultValue="courses">
          <TabsList>
            <TabsTrigger value="courses">Courses</TabsTrigger>
            <TabsTrigger value="credentials">Credentials</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="courses">
            <p>Course list here</p>
          </TabsContent>
          <TabsContent value="credentials">
            <p>Credential list here</p>
          </TabsContent>
          <TabsContent value="settings">
            <p>Settings panel</p>
          </TabsContent>
        </Tabs>
      );

      expect(screen.getByText('Course list here')).toBeInTheDocument();
      expect(screen.queryByText('Credential list here')).not.toBeInTheDocument();
      expect(screen.queryByText('Settings panel')).not.toBeInTheDocument();

      // Switch to credentials tab
      fireEvent.click(screen.getByRole('tab', { name: 'Credentials' }));
      expect(screen.getByText('Credential list here')).toBeInTheDocument();
      expect(screen.queryByText('Course list here')).not.toBeInTheDocument();
    });
  });
});
