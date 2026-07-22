/**
 * Component tests for LoginForm and RegisterForm (#184).
 *
 * Tests inline error states, submit-disabled behaviour, server error banners,
 * and successful submission callbacks.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LoginForm } from '../LoginForm';
import { RegisterForm } from '../RegisterForm';

const makeSubmit = (shouldThrow = false, msg = 'Server error') =>
  jest.fn<Promise<void>, [any]>(() =>
    shouldThrow ? Promise.reject(new Error(msg)) : Promise.resolve()
  );

// ─────────────────────────────────────────────────────────────────────────────
// LoginForm
// ─────────────────────────────────────────────────────────────────────────────
describe('LoginForm', () => {
  it('renders email, password, remember-me and submit', () => {
    render(<LoginForm onSubmit={makeSubmit()} />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter your password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/remember me/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('submit is disabled when pristine', () => {
    render(<LoginForm onSubmit={makeSubmit()} />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled();
  });

  it('shows required error when email is blurred empty', async () => {
    render(<LoginForm onSubmit={makeSubmit()} />);
    await userEvent.click(screen.getByLabelText(/email address/i));
    await userEvent.tab();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/required/i)
    );
  });

  it('shows format error for malformed email', async () => {
    render(<LoginForm onSubmit={makeSubmit()} />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'notanemail');
    await userEvent.tab();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i)
    );
  });

  it('shows required error when password is blurred empty', async () => {
    render(<LoginForm onSubmit={makeSubmit()} />);
    await userEvent.click(screen.getByPlaceholderText(/enter your password/i));
    await userEvent.tab();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/required/i)
    );
  });

  it('enables submit and calls onSubmit with valid data', async () => {
    const onSubmit = makeSubmit();
    render(<LoginForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await userEvent.tab(); // blur to trigger validation
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'mypassword');
    await userEvent.tab(); // blur to trigger validation

    const btn = screen.getByRole('button', { name: /sign in/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    await userEvent.click(btn);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [data] = onSubmit.mock.calls[0];
    expect(data.email).toBe('user@example.com');
    expect(data.password).toBe('mypassword');
  });

  it('shows server error banner when onSubmit rejects', async () => {
    const onSubmit = makeSubmit(true, 'Invalid credentials');
    render(<LoginForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await userEvent.tab();
    await userEvent.type(screen.getByPlaceholderText(/enter your password/i), 'mypassword');
    await userEvent.tab();
    const btn = screen.getByRole('button', { name: /sign in/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    await userEvent.click(btn);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid credentials/i)
    );
  });

  it('renders a link to the register page', () => {
    render(<LoginForm onSubmit={makeSubmit()} registerHref="/auth/register" />);
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute(
      'href',
      '/auth/register'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RegisterForm
// ─────────────────────────────────────────────────────────────────────────────
describe('RegisterForm', () => {
  it('renders all required fields', () => {
    render(<RegisterForm onSubmit={makeSubmit()} />);
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('submit is disabled when pristine', () => {
    render(<RegisterForm onSubmit={makeSubmit()} />);
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  it('shows error for name shorter than 2 characters', async () => {
    render(<RegisterForm onSubmit={makeSubmit()} />);
    await userEvent.type(screen.getByLabelText(/full name/i), 'A');
    await userEvent.tab();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 2 characters/i)
    );
  });

  it('shows error for invalid email', async () => {
    render(<RegisterForm onSubmit={makeSubmit()} />);
    await userEvent.type(screen.getByLabelText(/email address/i), 'bad');
    await userEvent.tab();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i)
    );
  });

  it('shows error for password shorter than 8 characters', async () => {
    render(<RegisterForm onSubmit={makeSubmit()} />);
    await userEvent.type(screen.getByPlaceholderText(/at least 8 characters/i), 'Ab1');
    await userEvent.tab();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 8 characters/i)
    );
  });

  it('shows error when passwords do not match', async () => {
    render(<RegisterForm onSubmit={makeSubmit()} />);
    await userEvent.type(screen.getByPlaceholderText(/at least 8 characters/i), 'Secure1pass');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Different1');
    await userEvent.tab();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i)
    );
  });

  it('calls onSubmit with valid complete data', async () => {
    const onSubmit = makeSubmit();
    render(<RegisterForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await userEvent.tab();
    await userEvent.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await userEvent.tab();
    await userEvent.type(screen.getByPlaceholderText(/at least 8 characters/i), 'Secure1pass');
    await userEvent.tab();
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Secure1pass');
    await userEvent.tab();
    await userEvent.click(screen.getByRole('checkbox'));

    const btn = screen.getByRole('button', { name: /create account/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    await userEvent.click(btn);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [data] = onSubmit.mock.calls[0];
    expect(data.name).toBe('Ada Lovelace');
    expect(data.email).toBe('ada@example.com');
  });

  it('shows server error banner when onSubmit rejects', async () => {
    const onSubmit = makeSubmit(true, 'Email already in use');
    render(<RegisterForm onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await userEvent.tab();
    await userEvent.type(screen.getByLabelText(/email address/i), 'ada@example.com');
    await userEvent.tab();
    await userEvent.type(screen.getByPlaceholderText(/at least 8 characters/i), 'Secure1pass');
    await userEvent.tab();
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'Secure1pass');
    await userEvent.tab();
    await userEvent.click(screen.getByRole('checkbox'));

    const btn = screen.getByRole('button', { name: /create account/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    await userEvent.click(btn);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/email already in use/i)
    );
  });
});
