'use client';

import { useState } from 'react';
import { useProfile } from '../../hooks/useProfile';
import { ProfileEditor } from '../../components/ProfileEditor';
import { AchievementDisplay } from '../../components/AchievementDisplay';
import { CredentialList } from '../../components/CredentialList';
import { ProfileStats } from '../../components/ProfileStats';
import { ProfileHeader } from '../../components/Profile/ProfileHeader';
import { ProfileSkeleton } from '../../components/Profile/ProfileSkeleton';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { 
  User, 
  Trophy, 
  Award, 
  BarChart3, 
  Settings, 
  Edit, 
  X,
  Loader2,
  RefreshCw
} from 'lucide-react';

type ActiveTab = 'overview' | 'achievements' | 'credentials' | 'stats' | 'settings';

export default function ProfilePage() {
  const { 
    profile, 
    achievements, 
    credentials, 
    stats, 
    loading, 
    error, 
    reloadProfile 
  } = useProfile();
  
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [showEditModal, setShowEditModal] = useState(false);

  const tabs = [
    { id: 'overview' as ActiveTab, label: 'Overview', icon: User },
    { id: 'achievements' as ActiveTab, label: 'Achievements', icon: Trophy },
    { id: 'credentials' as ActiveTab, label: 'Credentials', icon: Award },
    { id: 'stats' as ActiveTab, label: 'Statistics', icon: BarChart3 },
    { id: 'settings' as ActiveTab, label: 'Settings', icon: Settings },
  ];

  const handleProfileUpdate = () => {
    setShowEditModal(false);
    reloadProfile();
  };

  if (loading && !profile) {
    return <ProfileSkeleton />;
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-6 border border-red-200 dark:border-red-800">
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-300 mb-2">
              Error Loading Profile
            </h2>
            <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
            <button
              onClick={reloadProfile}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 mx-auto"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">No profile data available</p>
        </div>
      </div>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Edit Profile Modal — role="dialog" and aria-modal trap focus for screen readers */}
      {showEditModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit profile"
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onKeyDown={(e) => e.key === 'Escape' && setShowEditModal(false)}
        >
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <ProfileEditor
              onClose={() => setShowEditModal(false)}
              onSuccess={handleProfileUpdate}
            />
          </div>
        </div>
      )}

      {/* Profile Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <ProfileHeader user={profile} />
            </div>
            <button
              onClick={() => setShowEditModal(true)}
              className="ml-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Edit className="h-4 w-4" />
              Edit Profile
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs — WCAG 2.1 SC 4.1.2: tablist pattern */}
      <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8" role="tablist" aria-label="Profile sections">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  aria-controls={`tabpanel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-1 py-4 border-b-2 transition-colors
                    ${activeTab === tab.id
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }
                  `}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview" tabIndex={0}>
          <ErrorBoundary>
            <div className="space-y-8">
              {/* Quick Stats */}
              {stats && <ProfileStats stats={stats} compact={true} />}
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Recent Achievements */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Recent Achievements
                  </h3>
                  <ErrorBoundary>
                    <AchievementDisplay 
                      achievements={achievements || []} 
                      compact={true}
                      filterable={false}
                      searchable={false}
                    />
                  </ErrorBoundary>
                </div>
                
                {/* Recent Credentials */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Recent Credentials
                  </h3>
                  <ErrorBoundary>
                    <CredentialList 
                      credentials={(credentials || []).slice(0, 3)}
                      compact={true}
                      filterable={false}
                      searchable={false}
                    />
                  </ErrorBoundary>
                </div>
              </div>
            </div>
          </ErrorBoundary>
          </div>
        )}

        {/* Achievements Tab */}
        {activeTab === 'achievements' && (
          <div role="tabpanel" id="tabpanel-achievements" aria-labelledby="tab-achievements" tabIndex={0}>
          <ErrorBoundary>
            <AchievementDisplay 
              achievements={achievements || []}
              showProgress={true}
              filterable={true}
              searchable={true}
            />
          </ErrorBoundary>
          </div>
        )}

        {/* Credentials Tab */}
        {activeTab === 'credentials' && (
          <div role="tabpanel" id="tabpanel-credentials" aria-labelledby="tab-credentials" tabIndex={0}>
          <ErrorBoundary>
            <CredentialList 
              credentials={credentials || []}
              showAddButton={true}
              filterable={true}
              searchable={true}
            />
          </ErrorBoundary>
          </div>
        )}

        {/* Statistics Tab */}
        {activeTab === 'stats' && (
          <div role="tabpanel" id="tabpanel-stats" aria-labelledby="tab-stats" tabIndex={0}>
          <ErrorBoundary>
            {stats && <ProfileStats 
              stats={stats} 
              showRanking={true} 
              showProgress={true}
            />}
          </ErrorBoundary>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div role="tabpanel" id="tabpanel-settings" aria-labelledby="tab-settings" tabIndex={0}>
          <ErrorBoundary>
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                Profile Settings
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Settings panel would be implemented here. This could include privacy settings, 
                notification preferences, account management, etc.
              </p>
            </div>
          </ErrorBoundary>
          </div>
        )}
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        >
          <div className="bg-white dark:bg-slate-900 rounded-lg p-6 flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-hidden="true" />
            <span className="text-gray-900 dark:text-white">Updating...</span>
          </div>
        </div>
      )}
    </main>
  );
}
