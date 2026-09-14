import { render, screen, fireEvent } from '@testing-library/react';
import PreferencesPanel from '../PreferencesPanel';
import { NotificationPreferences } from '@/hooks/useNotifications';

const mockPreferences: NotificationPreferences = {
  categories: {
    course: { enabled: true, sound: true, desktop: true },
    message: { enabled: true, sound: true, desktop: true },
    system: { enabled: true, sound: false, desktop: true },
    achievement: { enabled: true, sound: true, desktop: false },
  },
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
  },
};

describe('PreferencesPanel', () => {
  const mockUpdatePreferences = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders notification preferences title', () => {
    render(
      <PreferencesPanel
        preferences={mockPreferences}
        onUpdatePreferences={mockUpdatePreferences}
      />
    );

    expect(screen.getByText('Notification Preferences')).toBeInTheDocument();
  });

  it('renders all category labels', () => {
    render(
      <PreferencesPanel
        preferences={mockPreferences}
        onUpdatePreferences={mockUpdatePreferences}
      />
    );

    expect(screen.getByText('Course Updates')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('System Alerts')).toBeInTheDocument();
    expect(screen.getByText('Achievements')).toBeInTheDocument();
  });

  it('renders category descriptions', () => {
    render(
      <PreferencesPanel
        preferences={mockPreferences}
        onUpdatePreferences={mockUpdatePreferences}
      />
    );

    expect(screen.getByText(/Notifications about course materials/)).toBeInTheDocument();
    expect(screen.getByText(/Direct messages and communication/)).toBeInTheDocument();
    expect(screen.getByText(/Platform maintenance/)).toBeInTheDocument();
    expect(screen.getByText(/Milestones, badges/)).toBeInTheDocument();
  });

  it('renders sound and desktop toggle buttons for enabled categories', () => {
    render(
      <PreferencesPanel
        preferences={mockPreferences}
        onUpdatePreferences={mockUpdatePreferences}
      />
    );

    expect(screen.getAllByText('Sound')).toHaveLength(4);
    expect(screen.getAllByText('Desktop')).toHaveLength(4);
  });

  it('renders quiet hours section', () => {
    render(
      <PreferencesPanel
        preferences={mockPreferences}
        onUpdatePreferences={mockUpdatePreferences}
      />
    );

    expect(screen.getByText('Quiet Hours')).toBeInTheDocument();
  });

  it('toggles quiet hours when clicking toggle button', () => {
    render(
      <PreferencesPanel
        preferences={mockPreferences}
        onUpdatePreferences={mockUpdatePreferences}
      />
    );

    const toggleButton = screen.getByRole('button', { name: '' });
    fireEvent.click(toggleButton);

    expect(mockUpdatePreferences).toHaveBeenCalledWith({
      quietHours: { enabled: true, start: '22:00', end: '08:00' },
    });
  });

  it('shows quiet hours time inputs when quiet hours is enabled', () => {
    const prefsWithQuietHours = {
      ...mockPreferences,
      quietHours: { ...mockPreferences.quietHours, enabled: true },
    };

    render(
      <PreferencesPanel
        preferences={prefsWithQuietHours}
        onUpdatePreferences={mockUpdatePreferences}
      />
    );

    expect(screen.getByDisplayValue('22:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('08:00')).toBeInTheDocument();
  });

  it('calls onUpdatePreferences when sound toggle is clicked', () => {
    render(
      <PreferencesPanel
        preferences={mockPreferences}
        onUpdatePreferences={mockUpdatePreferences}
      />
    );

    const soundButtons = screen.getAllByText('Sound');
    fireEvent.click(soundButtons[0]);

    expect(mockUpdatePreferences).toHaveBeenCalledWith({
      categories: {
        course: { enabled: true, sound: false, desktop: true },
        message: { enabled: true, sound: true, desktop: true },
        system: { enabled: true, sound: false, desktop: true },
        achievement: { enabled: true, sound: true, desktop: false },
      },
    });
  });

  it('calls onUpdatePreferences when desktop toggle is clicked', () => {
    render(
      <PreferencesPanel
        preferences={mockPreferences}
        onUpdatePreferences={mockUpdatePreferences}
      />
    );

    const desktopButtons = screen.getAllByText('Desktop');
    fireEvent.click(desktopButtons[0]);

    expect(mockUpdatePreferences).toHaveBeenCalledWith({
      categories: {
        course: { enabled: true, sound: true, desktop: false },
        message: { enabled: true, sound: true, desktop: true },
        system: { enabled: true, sound: false, desktop: true },
        achievement: { enabled: true, sound: true, desktop: false },
      },
    });
  });

  it('disables sound and desktop buttons when category is disabled', () => {
    const prefsWithDisabled = {
      ...mockPreferences,
      categories: {
        ...mockPreferences.categories,
        course: { enabled: false, sound: true, desktop: true },
      },
    };

    render(
      <PreferencesPanel
        preferences={prefsWithDisabled}
        onUpdatePreferences={mockUpdatePreferences}
      />
    );

    const disabledButtons = screen.getAllByText('Sound');
    const courseSoundButton = disabledButtons[0];
    expect(courseSoundButton).toBeDisabled();
  });

  it('updates quiet hours start time', () => {
    const prefsWithQuietHours = {
      ...mockPreferences,
      quietHours: { ...mockPreferences.quietHours, enabled: true },
    };

    render(
      <PreferencesPanel
        preferences={prefsWithQuietHours}
        onUpdatePreferences={mockUpdatePreferences}
      />
    );

    const startInput = screen.getByDisplayValue('22:00');
    fireEvent.change(startInput, { target: { value: '23:00' } });

    expect(mockUpdatePreferences).toHaveBeenCalledWith({
      quietHours: { enabled: true, start: '23:00', end: '08:00' },
    });
  });

  it('updates quiet hours end time', () => {
    const prefsWithQuietHours = {
      ...mockPreferences,
      quietHours: { ...mockPreferences.quietHours, enabled: true },
    };

    render(
      <PreferencesPanel
        preferences={prefsWithQuietHours}
        onUpdatePreferences={mockUpdatePreferences}
      />
    );

    const endInput = screen.getByDisplayValue('08:00');
    fireEvent.change(endInput, { target: { value: '07:00' } });

    expect(mockUpdatePreferences).toHaveBeenCalledWith({
      quietHours: { enabled: true, start: '22:00', end: '07:00' },
    });
  });
});
