import { renderHook, act, waitFor } from '@testing-library/react';
import { useProfile } from '../useProfile';

const mockAchievementsResponse = {
  success: true,
  data: [
    {
      _id: 'ach-1',
      userId: 'user-1',
      badgeId: 'first_lesson',
      name: 'First Steps',
      description: 'Complete your first course',
      icon: '🎯',
      rarity: 'common',
      category: 'milestone',
      points: 10,
      progress: { current: 1, max: 1 },
      earnedDate: '2023-01-20T00:00:00.000Z',
      isEarned: true
    }
  ]
};

describe('useProfile', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('fetches achievements from API when userId is provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => mockAchievementsResponse
    });

    const { result } = renderHook(() => useProfile({ userId: 'user-1', useMockData: false }));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.achievements).toHaveLength(1);
    expect(result.current.achievements[0].name).toBe('First Steps');
    expect(result.current.achievements[0].rarity).toBe('common');
    expect(result.current.achievements[0].progress).toBe(1);
    expect(result.current.achievements[0].maxProgress).toBe(1);
  });

  it('falls back to localStorage when userId is not provided', async () => {
    localStorage.setItem('userAchievements', JSON.stringify([
      {
        id: 'local-1',
        name: 'Local Achievement',
        description: 'From localStorage',
        icon: '🏆',
        rarity: 'rare',
        requirement: 'Do something',
        category: 'milestone',
        progress: 1,
        maxProgress: 1
      }
    ]));

    const { result } = renderHook(() => useProfile());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.achievements).toHaveLength(1);
    expect(result.current.achievements[0].name).toBe('Local Achievement');
  });

  it('handles API errors gracefully', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useProfile({ userId: 'user-1', useMockData: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.achievements).toEqual([]);
  });

  it('returns empty achievements when API returns no data', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] })
    });

    const { result } = renderHook(() => useProfile({ userId: 'user-1', useMockData: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.achievements).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('maps backend achievement fields correctly', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            _id: 'backend-id',
            badgeId: 'week_warrior',
            name: 'Week Warrior',
            description: 'Maintain a 7-day streak',
            icon: '🔥',
            rarity: 'rare',
            category: 'streak',
            progress: { current: 3, max: 7 },
            earnedDate: '2023-02-01T00:00:00.000Z',
            isEarned: false
          }
        ]
      })
    });

    const { result } = renderHook(() => useProfile({ userId: 'user-1', useMockData: false }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.achievements[0].id).toBe('backend-id');
    expect(result.current.achievements[0].requirement).toBe('week_warrior');
    expect(result.current.achievements[0].progress).toBe(3);
    expect(result.current.achievements[0].maxProgress).toBe(7);
  });
});
