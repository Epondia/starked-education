/**
 * Tests for the global Toast notification system.
 *
 * Covers:
 *  - All four variants render with correct message
 *  - role="alert" and aria-live="polite" accessibility attributes
 *  - Title rendering
 *  - Auto-dismiss after configured duration
 *  - Toast NOT dismissed before duration expires
 *  - duration=0 never auto-dismisses
 *  - Custom duration respected
 *  - Manual close via close button
 *  - Keyboard dismiss via Escape key
 *  - Queue cap: max 3 visible, overflow queued
 *  - Queue promotion after dismissal
 *  - Action button fires callback and dismisses toast
 *  - Action button label visible
 *  - useToastContext throws outside provider
 */

import React from 'react';
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToastContext } from '../toast';

// ─── Mock Framer Motion ───────────────────────────────────────────────────────
// AnimatePresence holds exiting elements in the DOM until CSS animations finish,
// which never happens in JSDOM. Replace with instant pass-through wrappers.
jest.mock('framer-motion', () => {
  const React = require('react');
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    motion: {
      div: React.forwardRef(
        (
          { children, ...props }: React.HTMLAttributes<HTMLDivElement>,
          ref: React.Ref<HTMLDivElement>
        ) => React.createElement('div', { ...props, ref }, children)
      ),
    },
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TestHarness() {
  const toast = useToastContext();
  return (
    <div>
      <button
        data-testid="btn-success"
        onClick={() =>
          toast.success('Operation completed', { title: 'Success' })
        }
      >
        Show success
      </button>
      <button
        data-testid="btn-error"
        onClick={() => toast.error('Something went wrong', { title: 'Error' })}
      >
        Show error
      </button>
      <button
        data-testid="btn-warning"
        onClick={() => toast.warning('Check this out', { title: 'Warning' })}
      >
        Show warning
      </button>
      <button
        data-testid="btn-info"
        onClick={() => toast.info('Just so you know', { title: 'Info' })}
      >
        Show info
      </button>
    </div>
  );
}

function renderWithProvider(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

// ─── Timer setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  act(() => jest.runAllTimers());
  jest.useRealTimers();
});

// ─── Variant rendering ────────────────────────────────────────────────────────

describe('Toast variants', () => {
  test.each([
    ['btn-success', 'Operation completed'],
    ['btn-error', 'Something went wrong'],
    ['btn-warning', 'Check this out'],
    ['btn-info', 'Just so you know'],
  ] as const)(
    'renders %s toast with correct message',
    async (btnId, message) => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      renderWithProvider(<TestHarness />);
      await user.click(screen.getByTestId(btnId));
      expect(screen.getByText(message)).toBeInTheDocument();
    }
  );

  test('renders title when provided', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProvider(<TestHarness />);
    await user.click(screen.getByTestId('btn-success'));
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  test('toast has role="alert"', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProvider(<TestHarness />);
    await user.click(screen.getByTestId('btn-success'));
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  test('aria-live="polite" region exists in the DOM', () => {
    renderWithProvider(<TestHarness />);
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });
});

// ─── Auto-dismiss ─────────────────────────────────────────────────────────────

describe('Auto-dismiss', () => {
  test('toast is removed after the default 5 s duration', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProvider(<TestHarness />);

    await user.click(screen.getByTestId('btn-success'));
    expect(screen.getByText('Operation completed')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(5000));

    await waitFor(() =>
      expect(screen.queryByText('Operation completed')).not.toBeInTheDocument()
    );
  });

  test('toast is NOT removed before the duration expires', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProvider(<TestHarness />);

    await user.click(screen.getByTestId('btn-success'));
    act(() => jest.advanceTimersByTime(4999));

    expect(screen.getByText('Operation completed')).toBeInTheDocument();
  });

  test('duration=0 never auto-dismisses', async () => {
    function NeverDismiss() {
      const toast = useToastContext();
      return (
        <button
          data-testid="btn-never"
          onClick={() => toast.info('Persistent', { duration: 0 })}
        >
          show
        </button>
      );
    }

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProvider(<NeverDismiss />);

    await user.click(screen.getByTestId('btn-never'));
    act(() => jest.advanceTimersByTime(60_000));

    expect(screen.getByText('Persistent')).toBeInTheDocument();
  });

  test('custom duration is respected', async () => {
    function CustomDuration() {
      const toast = useToastContext();
      return (
        <button
          data-testid="btn-custom"
          onClick={() => toast.info('Custom', { duration: 2000 })}
        >
          show
        </button>
      );
    }

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProvider(<CustomDuration />);

    await user.click(screen.getByTestId('btn-custom'));
    act(() => jest.advanceTimersByTime(2000));

    await waitFor(() =>
      expect(screen.queryByText('Custom')).not.toBeInTheDocument()
    );
  });
});

// ─── Manual close ─────────────────────────────────────────────────────────────

describe('Manual close', () => {
  test('close button dismisses the toast', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProvider(<TestHarness />);

    await user.click(screen.getByTestId('btn-success'));
    await user.click(
      screen.getByRole('button', { name: /dismiss notification/i })
    );

    await waitFor(() =>
      expect(screen.queryByText('Operation completed')).not.toBeInTheDocument()
    );
  });

  test('Escape key dismisses the focused toast', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProvider(<TestHarness />);

    await user.click(screen.getByTestId('btn-success'));

    const alert = screen.getByRole('alert');
    alert.focus();
    fireEvent.keyDown(alert, { key: 'Escape', code: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByText('Operation completed')).not.toBeInTheDocument()
    );
  });
});

// ─── Queue management ─────────────────────────────────────────────────────────

describe('Queue management', () => {
  function MultiToast() {
    const toast = useToastContext();
    return (
      <button
        data-testid="btn-multi"
        onClick={() => {
          toast.success('Toast 1', { duration: 0 });
          toast.success('Toast 2', { duration: 0 });
          toast.success('Toast 3', { duration: 0 });
          toast.success('Toast 4 queued', { duration: 0 });
          toast.success('Toast 5 queued', { duration: 0 });
        }}
      >
        fire
      </button>
    );
  }

  test('shows maximum 3 toasts at once', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProvider(<MultiToast />);

    await user.click(screen.getByTestId('btn-multi'));

    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(screen.queryByText('Toast 4 queued')).not.toBeInTheDocument();
    expect(screen.queryByText('Toast 5 queued')).not.toBeInTheDocument();
  });

  test('queued toast is promoted when a visible one is dismissed', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProvider(<MultiToast />);

    await user.click(screen.getByTestId('btn-multi'));

    const closeBtns = screen.getAllByRole('button', {
      name: /dismiss notification/i,
    });
    await user.click(closeBtns[0]);

    await waitFor(() =>
      expect(screen.getByText('Toast 4 queued')).toBeInTheDocument()
    );
  });
});

// ─── Action button ────────────────────────────────────────────────────────────

describe('Action button', () => {
  test('clicking action fires callback and dismisses the toast', async () => {
    const onAction = jest.fn();

    function ActionToast() {
      const toast = useToastContext();
      return (
        <button
          data-testid="btn-action"
          onClick={() =>
            toast.error('Payment failed', {
              duration: 0,
              action: { label: 'Try again', onClick: onAction },
            })
          }
        >
          show
        </button>
      );
    }

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProvider(<ActionToast />);

    await user.click(screen.getByTestId('btn-action'));
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(onAction).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByText('Payment failed')).not.toBeInTheDocument()
    );
  });

  test('action button label is visible in the toast', async () => {
    function ViewToast() {
      const toast = useToastContext();
      return (
        <button
          data-testid="btn-view"
          onClick={() =>
            toast.success('Submitted', {
              duration: 0,
              action: { label: 'View submission', onClick: jest.fn() },
            })
          }
        >
          show
        </button>
      );
    }

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderWithProvider(<ViewToast />);

    await user.click(screen.getByTestId('btn-view'));

    expect(
      screen.getByRole('button', { name: /view submission/i })
    ).toBeInTheDocument();
  });
});

// ─── Hook guard ───────────────────────────────────────────────────────────────

describe('useToastContext', () => {
  test('throws when used outside ToastProvider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    function BadConsumer() {
      useToastContext();
      return null;
    }

    expect(() => render(<BadConsumer />)).toThrow(
      'useToastContext must be used within a ToastProvider'
    );

    spy.mockRestore();
  });
});
