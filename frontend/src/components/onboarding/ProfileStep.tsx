'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Camera, User } from 'lucide-react';

export interface ProfileStepProps {
  data: {
    displayName: string;
    avatar: string | null;
    bio: string;
  };
  onUpdate: (data: { displayName: string; avatar: string | null; bio: string }) => void;
  onNext: () => void;
  onBack: () => void;
}

/**
 * ProfileStep — second step of the onboarding wizard.
 *
 * Lets the user upload an avatar, set a display name, and write a short bio.
 * All three fields are optional but the display name is encouraged.
 */
export const ProfileStep: React.FC<ProfileStepProps> = ({
  data,
  onUpdate,
  onNext,
  onBack,
}) => {
  const [displayName, setDisplayName] = useState(data.displayName || '');
  const [avatar, setAvatar] = useState<string | null>(data.avatar);
  const [bio, setBio] = useState(data.bio || '');
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Avatar image must be under 5 MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatar(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleNext = () => {
    if (!displayName.trim()) {
      setError('Display name is required');
      nameInputRef.current?.focus();
      return;
    }
    if (displayName.trim().length < 2) {
      setError('Display name must be at least 2 characters');
      return;
    }
    onUpdate({ displayName: displayName.trim(), avatar, bio: bio.trim() });
    onNext();
  };

  return (
    <div className="flex flex-col py-4 px-4 sm:px-8">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-1">
        Set Up Your Profile
      </h2>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
        This is how you’ll appear to other learners on the platform.
      </p>

      {/* Avatar upload */}
      <div className="flex items-center gap-5 mb-6">
        <div className="relative">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden">
            {avatar ? (
              <img
                src={avatar}
                alt="Avatar preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-8 h-8 text-white" aria-hidden="true" />
            )}
          </div>
          <label
            htmlFor="avatar-upload"
            className="absolute bottom-0 right-0 bg-blue-600 text-white p-1.5 rounded-full cursor-pointer hover:bg-blue-700 transition-colors shadow-md"
            aria-label="Upload avatar"
          >
            <Camera className="w-4 h-4" />
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </label>
        </div>
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white text-sm">
            Profile Picture
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            PNG, JPG, or GIF. Max 5 MB.
          </p>
        </div>
      </div>

      {/* Display name */}
      <div className="mb-5">
        <label
          htmlFor="display-name"
          className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5"
        >
          Display Name <span className="text-red-500">*</span>
        </label>
        <input
          ref={nameInputRef}
          id="display-name"
          type="text"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleNext();
          }}
          placeholder="e.g. Alex Rivera"
          maxLength={50}
          className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
          aria-required="true"
          aria-invalid={!!error}
        />
        <div className="flex justify-between mt-1">
          <span className="text-xs text-red-500" role={error ? 'alert' : undefined}>
            {error || '\u00A0'}
          </span>
          <span className="text-xs text-gray-400">{displayName.length}/50</span>
        </div>
      </div>

      {/* Bio */}
      <div className="mb-6">
        <label
          htmlFor="bio"
          className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5"
        >
          Bio <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell the community a bit about yourself..."
          maxLength={500}
          rows={3}
          className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
        />
        <div className="text-right mt-1">
          <span className="text-xs text-gray-400">{bio.length}/500</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-2">
        <button
          onClick={onBack}
          className="px-5 py-2.5 text-gray-600 dark:text-slate-300 font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default ProfileStep;
