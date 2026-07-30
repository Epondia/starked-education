/**
 * OnboardingWizard Tests
 *
 * Comprehensive test coverage for the multi-step onboarding wizard including:
 * - Step navigation (forward and backward)
 * - Data persistence across steps
 * - Wallet skip flow
 * - Wizard completion flow
 * - Progress indicator rendering
 * - Keyboard navigation (Escape to close)
 * - localStorage persistence for resume
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OnboardingWizard, OnboardingData } from '../OnboardingWizard';

// ─── Mocks ─────────────────────────────────────────────────────────────────

// Mock next/link
jest.mock('next/link', () => {
  return function MockLink({ children, href, ...props }: any) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

// Mock the stellar wallet hook used by WalletStep
jest.mock('@/context/WalletContext', () => ({
  useStellarWallet: () => ({
    address: null,
    isConnected: false,
    isConnecting: false,
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    switchNetwork: jest.fn(),
    signTransaction: jest.fn(),
    balance: '0',
    network: 'TESTNET',
    error: null,
  }),
}));

// Mock fetch for InterestsStep category loading
global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

// ─── Test helpers ──────────────────────────────────────────────────────────

const mockOnComplete = jest.fn();
const mockOnClose = jest.fn();

const defaultProps = {
  onComplete: mockOnComplete,
  onClose: mockOnClose,
};

const renderWizard = (props = {}) => {
  return render(<OnboardingWizard {...defaultProps} {...props} />);
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('OnboardingWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  // ── Initial render ──────────────────────────────────────────────────────

  describe('initial render', () => {
    it('renders the wizard dialog with Welcome step', () => {
      renderWizard();

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Welcome to StarkEd!')).toBeInTheDocument();
    });

    it('renders a close button', () => {
      renderWizard();

      expect(
        screen.getByLabelText('Close onboarding wizard'),
      ).toBeInTheDocument();
    });

    it('has aria-modal="true" for accessibility', () => {
      renderWizard();

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });
  });

  // ── Step navigation ─────────────────────────────────────────────────────

  describe('step navigation', () => {
    it('navigates from Welcome to Profile when "Get Started" is clicked', () => {
      renderWizard();

      fireEvent.click(screen.getByText('Get Started'));

      expect(screen.getByText('Set Up Your Profile')).toBeInTheDocument();
      expect(screen.queryByText('Welcome to StarkEd!')).not.toBeInTheDocument();
    });

    it('navigates forward through all steps', () => {
      renderWizard();

      // Welcome → Profile
      fireEvent.click(screen.getByText('Get Started'));
      expect(screen.getByText('Set Up Your Profile')).toBeInTheDocument();

      // Profile → Wallet (need to enter display name first)
      fireEvent.change(screen.getByLabelText(/Display Name/i), {
        target: { value: 'Test User' },
      });
      fireEvent.click(screen.getByText('Continue'));
      expect(screen.getByText('Connect Your Wallet')).toBeInTheDocument();

      // Wallet → Interests (skip wallet)
      fireEvent.click(screen.getByText(/Skip for now/i));
      expect(screen.getByText('Choose Your Interests')).toBeInTheDocument();
    });

    it('navigates backward to previous steps', () => {
      renderWizard();

      // Go to Profile
      fireEvent.click(screen.getByText('Get Started'));
      expect(screen.getByText('Set Up Your Profile')).toBeInTheDocument();

      // Go to Wallet
      fireEvent.change(screen.getByLabelText(/Display Name/i), {
        target: { value: 'Test User' },
      });
      fireEvent.click(screen.getByText('Continue'));
      expect(screen.getByText('Connect Your Wallet')).toBeInTheDocument();

      // Go back to Profile
      fireEvent.click(screen.getByText('Back'));
      expect(screen.getByText('Set Up Your Profile')).toBeInTheDocument();
    });

    it('Back button is not shown on Welcome step', () => {
      renderWizard();

      expect(screen.queryByText('Back')).not.toBeInTheDocument();
    });
  });

  // ── Profile step validation ─────────────────────────────────────────────

  describe('profile step validation', () => {
    it('shows error when display name is empty', () => {
      renderWizard();

      fireEvent.click(screen.getByText('Get Started'));
      // Clear the input (it starts empty but let's be explicit)
      fireEvent.click(screen.getByText('Continue'));

      expect(screen.getByText('Display name is required')).toBeInTheDocument();
    });

    it('shows error when display name is too short', () => {
      renderWizard();

      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.change(screen.getByLabelText(/Display Name/i), {
        target: { value: 'A' },
      });
      fireEvent.click(screen.getByText('Continue'));

      expect(
        screen.getByText('Display name must be at least 2 characters'),
      ).toBeInTheDocument();
    });

    it('advances when display name is valid', () => {
      renderWizard();

      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.change(screen.getByLabelText(/Display Name/i), {
        target: { value: 'Alex Rivera' },
      });
      fireEvent.click(screen.getByText('Continue'));

      expect(screen.getByText('Connect Your Wallet')).toBeInTheDocument();
    });
  });

  // ── Wallet skip flow ────────────────────────────────────────────────────

  describe('wallet skip flow', () => {
    it('allows skipping wallet connection', () => {
      renderWizard();

      // Navigate to wallet step
      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.change(screen.getByLabelText(/Display Name/i), {
        target: { value: 'Test User' },
      });
      fireEvent.click(screen.getByText('Continue'));

      // Click skip
      fireEvent.click(screen.getByText(/Skip for now/i));

      expect(screen.getByText('Choose Your Interests')).toBeInTheDocument();
    });

    it('shows skip option only when wallet is not connected', () => {
      renderWizard();

      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.change(screen.getByLabelText(/Display Name/i), {
        target: { value: 'Test User' },
      });
      fireEvent.click(screen.getByText('Continue'));

      expect(screen.getByText(/Skip for now/i)).toBeInTheDocument();
    });
  });

  // ── Interests step ──────────────────────────────────────────────────────

  describe('interests step', () => {
    const navigateToInterests = () => {
      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.change(screen.getByLabelText(/Display Name/i), {
        target: { value: 'Test User' },
      });
      fireEvent.click(screen.getByText('Continue'));
      fireEvent.click(screen.getByText(/Skip for now/i));
    };

    it('renders category tags', async () => {
      renderWizard();
      navigateToInterests();

      // Default categories should be visible after loading completes
      await waitFor(() => {
        expect(screen.getByText('Blockchain')).toBeInTheDocument();
      });
      expect(screen.getByText('Smart Contracts')).toBeInTheDocument();
    });

    it('allows selecting and deselecting interests', async () => {
      renderWizard();
      navigateToInterests();

      await waitFor(() => {
        expect(screen.getByText('Blockchain')).toBeInTheDocument();
      });

      // Select
      fireEvent.click(screen.getByText('Blockchain'));
      expect(screen.getByText('1 interest selected')).toBeInTheDocument();

      // Deselect
      fireEvent.click(screen.getByText('Blockchain'));
      expect(screen.getByText(/No interests selected/)).toBeInTheDocument();
    });

    it('can proceed without selecting any interests', async () => {
      renderWizard();
      navigateToInterests();

      await waitFor(() => {
        expect(screen.getByText('Blockchain')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Continue'));
      // Should reach Done step
      expect(screen.getByText(/You're All Set/i)).toBeInTheDocument();
    });
  });

  // ── Completion flow ─────────────────────────────────────────────────────

  describe('completion flow', () => {
    it('shows Done step with celebration and CTA after completing all steps', async () => {
      renderWizard();

      // Welcome → Profile
      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.change(screen.getByLabelText(/Display Name/i), {
        target: { value: 'Alex Rivera' },
      });
      fireEvent.click(screen.getByText('Continue'));

      // Wallet → skip
      fireEvent.click(screen.getByText(/Skip for now/i));

      // Interests → continue
      await waitFor(() => {
        expect(screen.getByText('Blockchain')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Continue'));

      // Done step
      expect(screen.getByText(/You're All Set, Alex/i)).toBeInTheDocument();
      expect(screen.getByText('Explore Courses')).toBeInTheDocument();
      expect(screen.getByText('Go to Settings')).toBeInTheDocument();
    });

    it('calls onComplete when Done step renders', async () => {
      renderWizard();

      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.change(screen.getByLabelText(/Display Name/i), {
        target: { value: 'Test User' },
      });
      fireEvent.click(screen.getByText('Continue'));
      fireEvent.click(screen.getByText(/Skip for now/i));

      await waitFor(() => {
        expect(screen.getByText('Blockchain')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Continue'));

      await waitFor(() => {
        expect(mockOnComplete).toHaveBeenCalledTimes(1);
      });

      const completedData = mockOnComplete.mock.calls[0][0] as OnboardingData;
      expect(completedData.displayName).toBe('Test User');
      expect(completedData.walletSkipped).toBe(true);
    });
  });

  // ── Keyboard navigation ─────────────────────────────────────────────────

  describe('keyboard navigation', () => {
    it('closes wizard on Escape key', () => {
      renderWizard();

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('close button triggers onClose', () => {
      renderWizard();

      fireEvent.click(screen.getByLabelText('Close onboarding wizard'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  // ── Progress indicator ──────────────────────────────────────────────────

  describe('progress indicator', () => {
    it('does not show progress bar on Welcome step', () => {
      renderWizard();

      // Welcome step should not have the progress nav
      expect(screen.queryByLabelText('Onboarding progress')).not.toBeInTheDocument();
    });

    it('shows progress bar on Profile step', () => {
      renderWizard();
      fireEvent.click(screen.getByText('Get Started'));

      expect(screen.getByLabelText('Onboarding progress')).toBeInTheDocument();
    });

    it('announces current step to screen readers', () => {
      renderWizard();
      fireEvent.click(screen.getByText('Get Started'));

      const liveRegion = screen.getByRole('status');
      expect(liveRegion).toHaveTextContent('Step 2 of 5: Profile');
    });
  });

  // ── Data persistence ────────────────────────────────────────────────────

  describe('data persistence', () => {
    it('persists current step to localStorage', () => {
      renderWizard();
      fireEvent.click(screen.getByText('Get Started'));

      expect(localStorage.getItem('starked_onboarding_step')).toBe('1');
    });

    it('persists onboarding data to localStorage', () => {
      renderWizard();
      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.change(screen.getByLabelText(/Display Name/i), {
        target: { value: 'Persisted User' },
      });
      fireEvent.click(screen.getByText('Continue'));

      const savedData = localStorage.getItem('starked_onboarding_data');
      expect(savedData).not.toBeNull();
      const parsed = JSON.parse(savedData!);
      expect(parsed.displayName).toBe('Persisted User');
    });

    it('resumes from saved step when initialStep is provided', () => {
      render(
        <OnboardingWizard
          onComplete={mockOnComplete}
          onClose={mockOnClose}
          initialStep={1}
          initialData={{ ...{} as any, displayName: 'Resumed User', avatar: null, bio: '', walletAddress: null, walletSkipped: false, interests: [] }}
        />,
      );

      // Should start on Profile step (index 1)
      expect(screen.getByText('Set Up Your Profile')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Resumed User')).toBeInTheDocument();
    });

    it('clears onboarding storage on completion', async () => {
      renderWizard();

      // Complete the wizard
      fireEvent.click(screen.getByText('Get Started'));
      fireEvent.change(screen.getByLabelText(/Display Name/i), {
        target: { value: 'Test User' },
      });
      fireEvent.click(screen.getByText('Continue'));
      fireEvent.click(screen.getByText(/Skip for now/i));

      await waitFor(() => {
        expect(screen.getByText('Blockchain')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Continue'));

      await waitFor(() => {
        expect(localStorage.getItem('starked_onboarding_complete')).toBe('true');
      });
      expect(localStorage.getItem('starked_onboarding_step')).toBeNull();
      expect(localStorage.getItem('starked_onboarding_data')).toBeNull();
    });
  });

  // ── Responsive / accessibility ──────────────────────────────────────────

  describe('accessibility', () => {
    it('wizard container is focusable', () => {
      renderWizard();

      const dialog = screen.getByRole('dialog');
      // The inner div with tabIndex={-1} should be focusable
      const focusable = dialog.querySelector('[tabindex="-1"]');
      expect(focusable).toBeInTheDocument();
    });

    it('has proper aria-label on dialog', () => {
      renderWizard();

      expect(screen.getByLabelText('Onboarding wizard')).toBeInTheDocument();
    });
  });
});
