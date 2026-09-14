'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export interface InterestsStepProps {
  selectedInterests: string[];
  onUpdate: (interests: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

/**
 * Default course categories derived from backend course metadata.
 * In production this would be fetched from `/api/courses/categories`,
 * but we hardcode the known set here so the wizard renders even before
 * the API call resolves.
 */
export const DEFAULT_COURSE_CATEGORIES: string[] = [
  'Blockchain',
  'Smart Contracts',
  'Web3',
  'Cryptography',
  'DeFi',
  'NFTs',
  'Frontend',
  'Backend',
  'Full Stack',
  'Data Science',
  'Machine Learning',
  'AI',
  'DevOps',
  'Security',
  'UI/UX Design',
  'Business',
  'Marketing',
  'Finance',
];

/**
 * InterestsStep — fourth step of the onboarding wizard.
 *
 * Tag-based interest selection loaded from backend course categories.
 * Users can select multiple tags; at least one is recommended but not
 * required to proceed.
 */
export const InterestsStep: React.FC<InterestsStepProps> = ({
  selectedInterests,
  onUpdate,
  onNext,
  onBack,
}) => {
  const [selected, setSelected] = React.useState<string[]>(selectedInterests);
  const [categories, setCategories] = React.useState<string[]>(DEFAULT_COURSE_CATEGORIES);
  const [loading, setLoading] = React.useState(true);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  // Fetch course categories from the backend
  useEffect(() => {
    let cancelled = false;

    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/courses/categories');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.categories) && data.categories.length > 0) {
            setCategories(data.categories);
          }
        }
      } catch {
        // Fall back to default categories — already set
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    nextButtonRef.current?.focus();
  }, [loading]);

  const toggleInterest = (category: string) => {
    setSelected((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
    );
  };

  const handleNext = () => {
    onUpdate(selected);
    onNext();
  };

  return (
    <div className="flex flex-col py-4 px-4 sm:px-8">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-1">
        Choose Your Interests
      </h2>
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
        Select topics you’re interested in. We’ll use these to recommend
        courses tailored to you.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Tag grid */}
          <div
            className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-6"
            role="group"
            aria-label="Interest categories"
          >
            {categories.map((category) => {
              const isSelected = selected.includes(category);
              return (
                <button
                  key={category}
                  onClick={() => toggleInterest(category)}
                  aria-pressed={isSelected}
                  className={cn(
                    'flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2',
                    isSelected
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-500 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:border-gray-300 dark:hover:border-slate-600',
                  )}
                >
                  <span>{category}</span>
                  {isSelected && (
                    <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 ml-2" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Selection count */}
          <p className="text-xs text-gray-400 dark:text-slate-500 mb-4">
            {selected.length === 0
              ? 'No interests selected yet — that’s okay, you can choose later.'
              : `${selected.length} ${selected.length === 1 ? 'interest' : 'interests'} selected`}
          </p>
        </>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-2">
        <button
          onClick={onBack}
          className="px-5 py-2.5 text-gray-600 dark:text-slate-300 font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
        >
          Back
        </button>
        <button
          ref={nextButtonRef}
          onClick={handleNext}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default InterestsStep;
