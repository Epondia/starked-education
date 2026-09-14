'use client';

import React from 'react';
import { GraduationCap, Wallet, Tags, Rocket } from 'lucide-react';

export interface WelcomeStepProps {
  onNext: () => void;
}

/**
 * WelcomeStep — first step of the onboarding wizard.
 *
 * Introduces the platform with a brief overview of what the user will
 * accomplish in the wizard. The primary CTA advances to the profile step.
 */
export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext }) => {
  const features = [
    {
      icon: GraduationCap,
      title: 'Set Up Your Profile',
      description: 'Add your avatar and bio so the community can get to know you.',
    },
    {
      icon: Wallet,
      title: 'Connect Your Wallet',
      description: 'Link your Stellar wallet to enroll in courses and earn credentials.',
    },
    {
      icon: Tags,
      title: 'Choose Your Interests',
      description: 'Pick topics you care about and we’ll tailor course recommendations.',
    },
    {
      icon: Rocket,
      title: 'Start Learning',
      description: 'Explore courses, earn verifiable credentials, and join the community.',
    },
  ];

  return (
    <div className="flex flex-col items-center text-center py-6 px-4 sm:px-8">
      {/* Hero icon */}
      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-6 shadow-lg">
        <GraduationCap className="w-10 h-10 sm:w-12 sm:h-12 text-white" aria-hidden="true" />
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
        Welcome to StarkEd!
      </h1>
      <p className="text-base sm:text-lg text-gray-600 dark:text-slate-300 max-w-md mb-8">
        Let’s get you set up in just a few steps. This quick walkthrough will
        help you configure your profile, connect a wallet, and pick your
        interests.
      </p>

      {/* Feature preview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl mb-8">
        {features.map((feature, i) => (
          <div
            key={i}
            className="flex items-start gap-3 p-4 rounded-xl bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
              <feature.icon className="w-5 h-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {feature.title}
              </h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-gray-400 dark:text-slate-500 mb-4">
        Takes less than 2 minutes ⏱️
      </p>

      <button
        onClick={onNext}
        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors shadow-md hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
        autoFocus
      >
        Get Started
      </button>
    </div>
  );
};

export default WelcomeStep;
