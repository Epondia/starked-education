import { render, screen, fireEvent } from '@testing-library/react';
import NotificationCenter from '../NotificationCenter';

const mockUseNotifications = jest.fn();
jest.mock('../../../hooks/useNotifications', () => ({
  useNotifications: (...args: any[]) => mockUseNotifications(...args),
}));

jest.mock('../../../hooks/useKeyboardNavigation', () => ({
  useFocusTrap: jest.fn(),
}));

jest.mock('../NotificationItem', () => {
  return {
    __esModule: true,
    default: function MockNotificationItem({ notification, onMarkAsRead, onRemove }: any) {
      return (
        <div data-testid="notification-item" data-notification-id={notification.id}>
          <span>{notification.title}</span>
          <span>{notification.message}</span>
          <button
            data-testid="mark-read-btn"
            onClick={() => onMarkAsRead(notification.id)}
          >
            Mark Read
          </button>
          <button
            data-testid="remove-btn"
            onClick={() => onRemove(notification.id)}
          >
            Remove
          </button>
        </div>
      );
    },
  };
});

jest.mock('../PreferencesPanel', () => {
  return {
    __esModule: true,
    default: function MockPreferencesPanel() {
      return <div data-testid="preferences-panel">Preferences Panel</div>;
    },
  };
});

const mockNotifications = [
  {
    id: 'notif-1',
    title: 'Course Update',
    message: 'New lesson available',
    category: 'course',
    isRead: false,
    timestamp: new Date('2024-01-15T10:30:00.000Z'),
    priority: 'medium',
  },
  {
    id: 'notif-2',
    title: 'Badge Earned',
    message: 'Completed first course',
    category: 'achievement',
    isRead: true,
    timestamp: new Date('2024-01-14T15:00:00.000Z'),
    priority: 'high',
  },
];

const defaultMockReturnValue = {
  notifications: mockNotifications,
  allNotifications: mockNotifications,
  unreadCount: 1,
  preferences: {
    categories: {
      course: { enabled: true, sound: true, desktop: true },
      message: { enabled: true, sound: true, desktop: true },
      system: { enabled: true, sound: false, desktop: true },
      achievement: { enabled: true, sound: true, desktop: false },
    },
    quietHours: { enabled: false, start: '22:00', end: '08:00' },
  },
  isOpen: true,
  selectedCategory: 'all',
  isLoading: false,
  setIsOpen: jest.fn(),
  setSelectedCategory: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  removeNotification: jest.fn(),
  clearAllNotifications: jest.fn(),
  updatePreferences: jest.fn(),
  refresh: jest.fn(),
  subscribeToPushNotifications: jest.fn(),
};

describe('NotificationCenter', () => {
  beforeEach(() => {
    mockUseNotifications.mockReturnValue({ ...defaultMockReturnValue });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders notification bell button with unread count badge', () => {
    render(<NotificationCenter />);

    const button = screen.getByRole('button', { name: /Notifications, 1 unread/ });
    expect(button).toBeInTheDocument();

    const badge = screen.getByText('1');
    expect(badge).toBeInTheDocument();
  });

  it('renders notification bell without badge when no unread', () => {
    mockUseNotifications.mockReturnValue({ ...defaultMockReturnValue, unreadCount: 0 });

    render(<NotificationCenter />);

    const button = screen.getByRole('button', { name: 'Notifications' });
    expect(button).toBeInTheDocument();
  });

  it('renders dropdown when isOpen is true', () => {
    render(<NotificationCenter />);

    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByLabelText('Close notifications')).toBeInTheDocument();
  });

  it('renders loading state when isLoading is true and no notifications', () => {
    mockUseNotifications.mockReturnValue({
      ...defaultMockReturnValue,
      notifications: [],
      allNotifications: [],
      isLoading: true,
      unreadCount: 0,
    });

    render(<NotificationCenter />);

    expect(screen.getByText('Loading notifications…')).toBeInTheDocument();
  });

  it('renders empty state when no notifications', () => {
    mockUseNotifications.mockReturnValue({
      ...defaultMockReturnValue,
      notifications: [],
      allNotifications: [],
      isLoading: false,
      unreadCount: 0,
    });

    render(<NotificationCenter />);

    expect(screen.getByText('No notifications')).toBeInTheDocument();
    expect(screen.getByText("You're all caught up!")).toBeInTheDocument();
  });

  it('renders notification items when notifications exist', () => {
    render(<NotificationCenter />);

    const items = screen.getAllByTestId('notification-item');
    expect(items).toHaveLength(2);
  });

  it('renders action buttons when there are unread notifications', () => {
    mockUseNotifications.mockReturnValue({ ...defaultMockReturnValue, unreadCount: 1 });

    render(<NotificationCenter />);

    expect(screen.getByText('Mark all read')).toBeInTheDocument();
    expect(screen.getByText('Clear all')).toBeInTheDocument();
  });

  it('does not render action buttons when no unread notifications', () => {
    mockUseNotifications.mockReturnValue({ ...defaultMockReturnValue, unreadCount: 0 });

    render(<NotificationCenter />);

    expect(screen.queryByText('Mark all read')).not.toBeInTheDocument();
  });

  it('calls markAllAsRead when mark all read button is clicked', () => {
    const mockMarkAllAsRead = jest.fn();
    mockUseNotifications.mockReturnValue({
      ...defaultMockReturnValue,
      unreadCount: 2,
      markAllAsRead: mockMarkAllAsRead,
    });

    render(<NotificationCenter />);

    fireEvent.click(screen.getByText('Mark all read'));
    expect(mockMarkAllAsRead).toHaveBeenCalledTimes(1);
  });

  it('calls clearAllNotifications when clear all button is clicked', () => {
    const mockClearAll = jest.fn();
    mockUseNotifications.mockReturnValue({
      ...defaultMockReturnValue,
      notifications: mockNotifications,
      clearAllNotifications: mockClearAll,
    });

    render(<NotificationCenter />);

    fireEvent.click(screen.getByText('Clear all'));
    expect(mockClearAll).toHaveBeenCalledTimes(1);
  });

  it('toggles preferences panel when settings button is clicked', () => {
    const setIsOpenMock = jest.fn();
    const selectedCategoryMock = jest.fn();
    const showPrefsState = { value: false };

    const originalUseState = jest.requireActual('react').useState;
    jest.spyOn(require('react'), 'useState')
      .mockImplementationOnce(() => [true, jest.fn()]) // isOpen
      .mockImplementationOnce(() => [showPrefsState.value, (val: boolean) => { showPrefsState.value = val; }])
      .mockImplementationOnce(() => [20, jest.fn()])
      .mockImplementationOnce(() => [false, jest.fn()]);

    render(<NotificationCenter />);

    expect(screen.queryByTestId('preferences-panel')).not.toBeInTheDocument();

    jest.restoreAllMocks();
  });

  it('renders category filter buttons', () => {
    render(<NotificationCenter />);

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Courses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Messages' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Achievements' })).toBeInTheDocument();
  });

  it('renders aria-live region for screen readers', () => {
    render(<NotificationCenter />);

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveTextContent('1 unread notifications');
  });

  it('does not render dropdown when isOpen is false', () => {
    mockUseNotifications.mockReturnValue({ ...defaultMockReturnValue, isOpen: false });

    const { container } = render(<NotificationCenter />);

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });
});
