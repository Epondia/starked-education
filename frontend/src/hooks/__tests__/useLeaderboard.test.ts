import { renderHook, waitFor, act } from '@testing-library/react';
import { useLeaderboard } from '../useLeaderboard';

const mockLeaderboardResponse = {
  success: true,
  data: [
    {
      _id: 'entry-1',
      userId: 'user-1',
      username: 'Alice',
      avatar: 'https://example.com/avatar.png',
      points: 5000,
      level: 10,
      streak: 14,
      badgesEarned: 25,
      coursesCompleted: 8,
      rank: 1,
      previousRank: 2,
      rankChange: 1,
      category: 'global',
      categoryId: null
    },
    {
      _id: 'entry-2',
      userId: 'user-2',
      username: 'Bob',
      points: 3200,
      level: 7,
      streak: 5,
      badgesEarned: 12,
      coursesCompleted: 4,
      rank: 2,
      previousRank: 1,
      rankChange: -1,
      category: 'global',
      categoryId: null
    }
  ]
};

describe('useLeaderboard', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('fetches leaderboard data successfully', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockLeaderboardResponse
    });

    const { result } = renderHook(() => useLeaderboard({ currentUserId: 'user-1' }));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0].name).toBe('Alice');
    expect(result.current.data[0].points).toBe(5000);
    expect(result.current.data[0].rank).toBe(1);
    expect(result.current.data[0].change).toBe('up');
    expect(result.current.data[1].name).toBe('Bob');
    expect(result.current.data[1].rank).toBe(2);
  });

  it('maps backend fields to frontend types correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockLeaderboardResponse
    });

    const { result } = renderHook(() => useLeaderboard());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data[0].id).toBe('entry-1');
    expect(result.current.data[0].badges).toBe(25);
    expect(result.current.data[0].completedCourses).toBe(8);
    expect(result.current.data[0].level).toBe(10);
    expect(result.current.data[0].streak).toBe(14);
  });

  it('handles empty leaderboard response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] })
    });

    const { result } = renderHook(() => useLeaderboard());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('handles API errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useLeaderboard());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.data).toEqual([]);
  });

  it('refetches when called', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockLeaderboardResponse
    });

    const { result } = renderHook(() => useLeaderboard());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] })
    });

    await act(async () => {
      result.current.refetch();
    });

    expect(result.current.data).toEqual([]);
  });

  it('uses correct API endpoint with query params', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] })
    });

    const { result } = renderHook(() => useLeaderboard({ category: 'weekly', categoryId: 'course-1', limit: 10 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/gamification/leaderboard?category=weekly&page=1&limit=10&categoryId=course-1')
    );
  });
});
