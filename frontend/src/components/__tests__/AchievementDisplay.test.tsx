import { render, screen } from '@testing-library/react';
import { AchievementDisplay } from '../../components/AchievementDisplay';
import { Achievement } from '../../types/profile';

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
    maxProgress: 1
  },
  {
    id: 'ach-2',
    name: 'Week Warrior',
    description: 'Maintain a 7-day study streak',
    icon: '🔥',
    rarity: 'rare',
    requirement: 'Study for 7 consecutive days',
    category: 'streak',
    progress: 7,
    maxProgress: 7
  }
];

describe('AchievementDisplay', () => {
  it('renders loading skeletons when loading is true', () => {
    render(<AchievementDisplay achievements={[]} loading={true} />);

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders achievements when loading is false', () => {
    render(<AchievementDisplay achievements={mockAchievements} loading={false} />);

    expect(screen.getByText('First Steps')).toBeInTheDocument();
    expect(screen.getByText('Week Warrior')).toBeInTheDocument();
  });

  it('shows empty state when achievements array is empty and not loading', () => {
    render(<AchievementDisplay achievements={[]} loading={false} />);
    
    expect(screen.getByText('No achievements available')).toBeInTheDocument();
  });

  it('shows no results message when filters are active and no matches', () => {
    render(
      <AchievementDisplay 
        achievements={mockAchievements} 
        loading={false}
        filterable={true}
        searchable={true}
      />
    );

    expect(screen.getByText('First Steps')).toBeInTheDocument();
  });
});
