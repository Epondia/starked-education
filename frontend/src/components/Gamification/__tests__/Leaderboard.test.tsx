import { render, screen, waitFor } from '@testing-library/react';
import { Leaderboard } from '../Leaderboard';

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

const mockBackendLeaderboardData = [
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
    categoryId: null,
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
    categoryId: null,
  },
];

describe('Leaderboard', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockBackendLeaderboardData }),
    });

    render(<Leaderboard showRealTime={false} />);

    expect(screen.getByText('Loading leaderboard...')).toBeInTheDocument();
  });

  it('renders leaderboard entries after data loads', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockBackendLeaderboardData }),
    });

    render(<Leaderboard showRealTime={false} />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('5000 points')).toBeInTheDocument();
    expect(screen.getByText('3200 points')).toBeInTheDocument();
  });

  it('shows empty state when no data is available', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    render(<Leaderboard showRealTime={false} />);

    await waitFor(() => {
      expect(screen.getByText('No data available')).toBeInTheDocument();
    });
  });

  it('highlights the current user', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockBackendLeaderboardData }),
    });

    render(<Leaderboard showRealTime={false} currentUserId="entry-1" />);

    await waitFor(() => {
      expect(screen.getByText('You')).toBeInTheDocument();
    });
  });

  it('shows leaderboard title and learner count', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockBackendLeaderboardData }),
    });

    render(<Leaderboard showRealTime={false} />);

    expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('2 learners')).toBeInTheDocument();
    });
  });
});
