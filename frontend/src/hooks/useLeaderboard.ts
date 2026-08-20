import { useState, useEffect, useCallback } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface LeaderboardUser {
  id: string;
  name: string;
  avatar?: string;
  points: number;
  level: number;
  streak: number;
  rank: number;
  previousRank?: number;
  badges: number;
  completedCourses: number;
  change?: 'up' | 'down' | 'same';
}

interface UseLeaderboardOptions {
  category?: string;
  categoryId?: string;
  page?: number;
  limit?: number;
  currentUserId?: string;
}

const mapBackendEntry = (entry: any, currentUserId?: string): LeaderboardUser => {
  const rankChange = entry.rankChange || 0;
  const change = rankChange > 0 ? 'up' : rankChange < 0 ? 'down' : 'same';

  return {
    id: entry._id || entry.userId,
    name: entry.username,
    avatar: entry.avatar,
    points: entry.points || 0,
    level: entry.level || 1,
    streak: entry.streak || 0,
    rank: entry.rank || 0,
    previousRank: entry.previousRank,
    badges: entry.badgesEarned || 0,
    completedCourses: entry.coursesCompleted || 0,
    change: currentUserId && entry.userId === currentUserId ? change : undefined
  };
};

export const useLeaderboard = (options: UseLeaderboardOptions = {}) => {
  const {
    category = 'global',
    categoryId,
    page = 1,
    limit = 50,
    currentUserId
  } = options;

  const [data, setData] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        category,
        page: String(page),
        limit: String(limit)
      });
      if (categoryId) params.set('categoryId', categoryId);

      const response = await fetch(`${API_BASE_URL}/api/v1/gamification/leaderboard?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Leaderboard request failed: ${response.status}`);
      }
      const result = await response.json();
      const entries = (result.data || []).map((entry: any) => mapBackendEntry(entry, currentUserId));
      setData(entries);
      setHasMore(entries.length >= limit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      console.error('Error fetching leaderboard:', err);
    } finally {
      setLoading(false);
    }
  }, [category, categoryId, page, limit, currentUserId]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const refetch = useCallback(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return {
    data,
    loading,
    error,
    hasMore,
    refetch
  };
};
