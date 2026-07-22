import { useState } from "react";

export interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
  joinDate: string;
  totalCoursesCompleted: number;
  currentStreak: number;
}

interface ProfileHeaderProps {
  user: UserProfile;
}

export function ProfileHeader({ user }: ProfileHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(user.name);

  const handleSave = () => {
    setIsEditing(false);
    // Persist to localStorage
    localStorage.setItem(
      "userProfile",
      JSON.stringify({ ...user, name: editedName }),
    );
  };

  return (
    <div className="w-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-8 mb-8 shadow-lg">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full bg-white/20 border-4 border-white flex items-center justify-center shadow-lg">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-4xl font-bold text-white">
                {user.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* User Info */}
          <div className="text-white">
            <div className="flex items-center gap-2 mb-2">
              {isEditing ? (
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  aria-label="Edit your display name"
                  className="bg-white/20 border border-white/30 rounded px-3 py-1 text-white placeholder-white/50 text-2xl font-bold"
                  onBlur={handleSave}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  autoFocus
                />
              ) : (
                <>
                  <h1 className="text-3xl font-bold">{editedName}</h1>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-white/70 hover:text-white transition-colors"
                    aria-label="Edit display name"
                  >
                    <span aria-hidden="true">✎</span>
                  </button>
                </>
              )}
            </div>
            <p className="text-white/80 mb-4">{user.email}</p>

            {/* Stats */}
            <dl className="flex gap-8">
              <div>
                <dt className="text-sm text-white/70">Courses Completed</dt>
                <dd className="text-2xl font-bold">
                  {user.totalCoursesCompleted}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-white/70">Current Streak</dt>
                <dd className="text-2xl font-bold">
                  {user.currentStreak} days
                </dd>
              </div>
              <div>
                <dt className="text-sm text-white/70">Member Since</dt>
                <dd className="text-lg font-semibold">{user.joinDate}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
