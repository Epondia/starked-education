import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BadgeCollection } from '../BadgeCollection';
import { Achievement } from '@/types/profile';

const mockAchievements: Achievement[] = [
  {
    id: 'ach-1',
    name: 'First Steps',
    description: 'Complete your first course',
    icon: '🎯',
    earnedDate: '2023-01-20',
    rarity: 'common',
    requirement: 'Complete any course',
    category: 'milestone',
    progress: 1,
    maxProgress: 1,
    points: 10,
  },
  {
    id: 'ach-2',
    name: 'Knowledge Seeker',
    description: 'Complete 10 courses',
    icon: '📚',
    earnedDate: '2023-03-15',
    rarity: 'epic',
    requirement: 'Complete 10 courses',
    category: 'learning',
    progress: 12,
    maxProgress: 10,
    points: 100,
  },
  {
    id: 'ach-3',
    name: 'Master Mind',
    description: 'Achieve level 10',
    icon: '🧠',
    rarity: 'legendary',
    requirement: 'Reach level 10',
    category: 'level',
    progress: 5,
    maxProgress: 10,
    points: 500,
  },
];

const mockUnlockedAchievements: Achievement[] = [
  {
    id: 'ach-1',
    name: 'First Steps',
    description: 'Complete your first course',
    icon: '🎯',
    earnedDate: '2023-01-20',
    rarity: 'common',
    requirement: 'Complete any course',
    category: 'milestone',
    progress: 1,
    maxProgress: 1,
    points: 10,
  },
];

describe('BadgeCollection', () => {
  it('renders achievements in grid view by default', () => {
    render(<BadgeCollection achievements={mockAchievements} allowFiltering={false} />);

    expect(screen.getByText('Badge Collection')).toBeInTheDocument();
    expect(screen.getByText('First Steps')).toBeInTheDocument();
    expect(screen.getByText('Knowledge Seeker')).toBeInTheDocument();
    expect(screen.getByText('Master Mind')).toBeInTheDocument();
  });

  it('shows collection statistics', () => {
    render(<BadgeCollection achievements={mockAchievements} allowFiltering={false} />);

    // 2 earned out of 3 total = 67%
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('Collection')).toBeInTheDocument();
  });

  it('shows unlocked and locked status for badges', () => {
    render(<BadgeCollection achievements={mockAchievements} allowFiltering={false} />);

    expect(screen.getAllByText('Unlocked').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Locked').length).toBeGreaterThan(0);
  });

  it('shows empty state when achievements array is empty', () => {
    render(<BadgeCollection achievements={[]} allowFiltering={false} />);

    expect(screen.getByText('No badges available')).toBeInTheDocument();
  });

  it('shows correct count of earned badges', () => {
    render(<BadgeCollection achievements={mockAchievements} allowFiltering={false} />);

    // 2 earned out of 3 total
    // Use getAllByText since multiple elements may contain '1' or '2'
    const twoElements = screen.getAllByText('2');
    expect(twoElements.some(el => el.classList.contains('text-green-600') || el.classList.contains('dark:text-green-400'))).toBe(true);
    
    const oneElements = screen.getAllByText('1');
    expect(oneElements.some(el => el.classList.contains('text-gray-600') || el.classList.contains('dark:text-gray-400'))).toBe(true);
  });

  it('renders compact view with fewer columns', () => {
    const { container } = render(
      <BadgeCollection achievements={mockAchievements} allowFiltering={false} compact={true} />
    );

    const badges = container.querySelectorAll('[class*="aspect-square"]');
    expect(badges.length).toBeGreaterThan(0);
  });
});
