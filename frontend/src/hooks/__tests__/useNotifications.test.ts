import { renderHook, act, waitFor } from '@testing-library/react';
import { useNotifications } from '../useNotifications';

const mockNotificationsResponse = {
  success: true,
  data: {
    notifications: [
      {
        id: 'notif-1',
        title: 'Course Update',
        message: 'New lesson available in React Fundamentals',
        category: 'course',
        isRead: false,
        timestamp: '2024-01-15T10:30:00.000Z',
        actionUrl: '/courses/react',
        priority: 'medium',
      },
      {
        id: 'notif-2',
        title: 'You earned a badge!',
        message: 'Completed the first course',
        category: 'achievement',
        isRead: true,
        timestamp: '2024-01-14T15:00:00.000Z',
        actionUrl: '/achievements',
        priority: 'high',
      },
      {
        id: 'notif-3',
        title: 'System Maintenance',
        message: 'Scheduled maintenance tonight',
        category: 'system',
        isRead: false,
        timestamp: '2024-01-13T08:00:00.000Z',
        actionUrl: undefined,
        priority: 'high',
      },
    ]
  }
};

const mockPreferencesResponse = {
  success: true,
  data: {
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
  }
};

jest.mock('../useWebSocket', () => ({
  useWebSocket: jest.fn(() => ({
    socket: null,
    isConnected: false,
    connectionStatus: 'disconnected',
  })),
}));

describe('useNotifications', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    localStorage.clear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const setupMockFetch = () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockNotificationsResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockPreferencesResponse,
      });
  };

  it('fetches notifications and preferences on mount with userId', async () => {
    setupMockFetch();

    const { result } = renderHook(() => useNotifications('user-123'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.notifications).toHaveLength(0);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.notifications).toHaveLength(3);
    expect(result.current.allNotifications).toHaveLength(3);
  });

  it('returns empty notifications when userId is not provided', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.allNotifications).toHaveLength(0);
  });

  it('calculates unread count correctly', async () => {
    setupMockFetch();

    const { result } = renderHook(() => useNotifications('user-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.unreadCount).toBe(2);
  });

  it('filters notifications by category', async () => {
    setupMockFetch();

    const { result } = renderHook(() => useNotifications('user-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.notifications).toHaveLength(3);

    act(() => {
      result.current.setSelectedCategory('course');
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0].category).toBe('course');
  });

  it('marks a single notification as read', async () => {
    setupMockFetch();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useNotifications('user-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.unreadCount).toBe(2);

    await act(async () => {
      await result.current.markAsRead('notif-1');
    });

    expect(result.current.allNotifications[0].isRead).toBe(true);
    expect(result.current.unreadCount).toBe(1);
  });

  it('marks all notifications as read', async () => {
    setupMockFetch();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useNotifications('user-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.unreadCount).toBe(2);

    await act(async () => {
      await result.current.markAllAsRead();
    });

    expect(result.current.unreadCount).toBe(0);
  });

  it('removes a notification', async () => {
    setupMockFetch();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useNotifications('user-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.allNotifications).toHaveLength(3);

    await act(async () => {
      await result.current.removeNotification('notif-1');
    });

    expect(result.current.allNotifications).toHaveLength(2);
  });

  it('clears all notifications', async () => {
    setupMockFetch();

    const { result } = renderHook(() => useNotifications('user-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.allNotifications).toHaveLength(3);

    await act(async () => {
      await result.current.clearAllNotifications();
    });

    expect(result.current.allNotifications).toHaveLength(0);
    expect(result.current.notifications).toHaveLength(0);
  });

  it('updates preferences optimistically', async () => {
    setupMockFetch();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useNotifications('user-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.preferences.categories.course.enabled).toBe(true);

    await act(async () => {
      await result.current.updatePreferences({
        categories: {
          course: { enabled: false, sound: true, desktop: true },
          message: { enabled: true, sound: true, desktop: true },
          system: { enabled: true, sound: false, desktop: true },
          achievement: { enabled: true, sound: true, desktop: false },
        },
      });
    });

    expect(result.current.preferences.categories.course.enabled).toBe(false);
  });
});
