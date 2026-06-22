import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProfileEditor } from '../components/ProfileEditor'
import { AchievementDisplay } from '../components/AchievementDisplay'
import { CredentialList } from '../components/CredentialList'
import { ProfileStats } from '../components/ProfileStats'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { testProfile, testAchievements, testCredentials, testStats } from '../test-profile'

// Mock the useProfile hook
jest.mock('../hooks/useProfile', () => ({
  useProfile: () => ({
    profile: testProfile,
    achievements: testAchievements,
    credentials: testCredentials,
    stats: testStats,
    loading: false,
    error: null,
    updateProfile: jest.fn(),
    reloadProfile: jest.fn(),
  }),
}))

describe('Profile Components', () => {
  describe('ErrorBoundary', () => {
    it('renders children when there is no error', () => {
      render(
        <ErrorBoundary>
          <div>Test Content</div>
        </ErrorBoundary>
      )
      expect(screen.getByText('Test Content')).toBeInTheDocument()
    })

    it('displays error UI when there is an error', () => {
      const ThrowError = () => {
        throw new Error('Test error')
      }
      
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      )
      
      expect(screen.getByText('Something went wrong')).toBeInTheDocument()
      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })
  })

  describe('AchievementDisplay', () => {
    it('renders achievements correctly', () => {
      render(<AchievementDisplay achievements={testAchievements} />)
      
      expect(screen.getByText('First Steps')).toBeInTheDocument()
      expect(screen.getByText('Week Warrior')).toBeInTheDocument()
    })

    it('handles empty achievements array', () => {
      render(<AchievementDisplay achievements={[]} />)
      
      expect(screen.getByText('No achievements found')).toBeInTheDocument()
    })

    it('filters achievements by category', () => {
      render(<AchievementDisplay achievements={testAchievements} filterable={true} />)
      
      const categoryFilter = screen.getByText('Category')
      expect(categoryFilter).toBeInTheDocument()
    })
  })

  describe('CredentialList', () => {
    it('renders credentials correctly', () => {
      render(<CredentialList credentials={testCredentials} />)
      
      expect(screen.getByText('TypeScript Certification')).toBeInTheDocument()
      expect(screen.getByText('React Developer')).toBeInTheDocument()
    })

    it('handles empty credentials array', () => {
      render(<CredentialList credentials={[]} />)
      
      expect(screen.getByText('No credentials found')).toBeInTheDocument()
    })
  })

  describe('ProfileStats', () => {
    it('renders statistics correctly', () => {
      render(<ProfileStats stats={testStats} />)
      
      expect(screen.getByText('12')).toBeInTheDocument() // completedCourses
      expect(screen.getByText('7')).toBeInTheDocument() // studyStreak
    })

    it('handles null stats gracefully', () => {
      render(<ProfileStats stats={null as any} />)
      
      // Should not crash and should show 0 for all stats
      expect(screen.getByText('0')).toBeInTheDocument()
    })
  })

  describe('ProfileEditor', () => {
    it('renders form fields correctly', () => {
      render(<ProfileEditor />)

      // Labels render as "Name *" / "Email *" / "Bio" (the * marks required
      // fields). Use regexes so the assertions stay robust.
      expect(screen.getByLabelText(/Name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Bio/i)).toBeInTheDocument()
    })

    it('validates form inputs', async () => {
      render(<ProfileEditor />)

      // The form is pre-filled from the mock useProfile (testProfile). The
      // submit button is `disabled={!isDirty}`, so we must mutate the
      // name field (to empty) to flip it dirty. Only then does clicking
      // submit run the Zod resolver (`zodResolver(profileSchema)`).
      const nameInput = screen.getByLabelText(/Name/i) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: '' } })
      const submitButton = screen.getByText('Save Changes')
      fireEvent.click(submitButton)

      // The schema chains `.min(1,'Name is required')` and
      // `.min(2,'Name must be at least 2 characters')`, so either of
      // Zod's messages for the `name` field could surface. Match a
      // regex so both are accepted.
      await waitFor(() => {
        const matches = screen.queryAllByText(/Name is required|Name must be at least/i)
        expect(matches.length).toBeGreaterThan(0)
      })
    })
  })
})
