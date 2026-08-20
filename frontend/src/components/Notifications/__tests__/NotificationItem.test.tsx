import { render, screen, fireEvent } from '@testing-library/react';
import NotificationItem from '../NotificationItem';
import { Notification } from '@/hooks/useNotifications';

const mockNotification: Notification = {
  id: 'notif-1',
  title: 'Course Update',
  message: 'New lesson available in React Fundamentals',
  category: 'course',
  isRead: false,
  timestamp: new Date('2024-01-15T10:30:00.000Z'),
  actionUrl: '/courses/react',
  priority: 'medium',
};

const mockReadNotification: Notification = {
  id: 'notif-2',
  title: 'Badge Earned',
  message: 'Completed your first course',
  category: 'achievement',
  isRead: true,
  timestamp: new Date('2024-01-14T15:00:00.000Z'),
  actionUrl: undefined,
  priority: 'high',
};

describe('NotificationItem', () => {
  const mockMarkAsRead = jest.fn();
  const mockRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    window.open = jest.fn();
  });

  it('renders notification title and message', () => {
    render(
      <NotificationItem
        notification={mockNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    expect(screen.getByText('Course Update')).toBeInTheDocument();
    expect(screen.getByText('New lesson available in React Fundamentals')).toBeInTheDocument();
  });

  it('renders unread notification with correct styling', () => {
    render(
      <NotificationItem
        notification={mockNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    const item = screen.getByRole('button', { name: /Unread notification/ });
    expect(item).toBeInTheDocument();
  });

  it('renders read notification with correct styling', () => {
    render(
      <NotificationItem
        notification={mockReadNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    const item = screen.getByRole('button', { name: /Read notification/ });
    expect(item).toBeInTheDocument();
  });

  it('renders unread indicator dot for unread notifications', () => {
    render(
      <NotificationItem
        notification={mockNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    const dots = document.querySelectorAll('.bg-blue-500.rounded-full');
    expect(dots.length).toBeGreaterThan(0);
  });

  it('does not render unread indicator dot for read notifications', () => {
    render(
      <NotificationItem
        notification={mockReadNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    const dots = document.querySelectorAll('.bg-blue-500.rounded-full');
    expect(dots.length).toBe(0);
  });

  it('renders priority indicator for high priority notifications', () => {
    render(
      <NotificationItem
        notification={mockReadNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    const pulseDot = document.querySelector('.bg-red-500.animate-pulse');
    expect(pulseDot).toBeInTheDocument();
  });

  it('renders category name', () => {
    render(
      <NotificationItem
        notification={mockNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    expect(screen.getByText('course')).toBeInTheDocument();
  });

  it('formats timestamp relative to now', () => {
    const recentNotification: Notification = {
      ...mockNotification,
      timestamp: new Date(Date.now() - 5 * 60000), // 5 minutes ago
    };

    render(
      <NotificationItem
        notification={recentNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    expect(screen.getByText(/5m ago/)).toBeInTheDocument();
  });

  it('calls onMarkAsRead when clicking an unread notification', () => {
    render(
      <NotificationItem
        notification={mockNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    const item = screen.getByRole('button', { name: /Unread notification/ });
    fireEvent.click(item);

    expect(mockMarkAsRead).toHaveBeenCalledWith('notif-1');
  });

  it('opens actionUrl in new tab when clicking notification', () => {
    render(
      <NotificationItem
        notification={mockNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    const item = screen.getByRole('button', { name: /Unread notification/ });
    fireEvent.click(item);

    expect(window.open).toHaveBeenCalledWith('/courses/react', '_blank');
  });

  it('does not call onMarkAsRead when clicking an already read notification', () => {
    render(
      <NotificationItem
        notification={mockReadNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    const item = screen.getByRole('button', { name: /Read notification/ });
    fireEvent.click(item);

    expect(mockMarkAsRead).not.toHaveBeenCalled();
  });

  it('calls onRemove when clicking remove button', () => {
    render(
      <NotificationItem
        notification={mockNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    const removeButton = screen.getByLabelText('Remove notification');
    fireEvent.click(removeButton);

    expect(mockRemove).toHaveBeenCalledWith('notif-1');
  });

  it('stops propagation when clicking remove button', () => {
    render(
      <NotificationItem
        notification={mockNotification}
        onMarkAsRead={mockMarkAsRead}
        onRemove={mockRemove}
      />
    );

    const removeButton = screen.getByLabelText('Remove notification');
    fireEvent.click(removeButton);

    expect(mockRemove).toHaveBeenCalledWith('notif-1');
    expect(mockMarkAsRead).not.toHaveBeenCalled();
  });
});
