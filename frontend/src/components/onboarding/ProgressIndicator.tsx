'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProgressIndicatorProps {
  steps: { id: string; label: string }[];
  currentStep: number;
  className?: string;
}

/**
 * ProgressIndicator — accessible multi-step progress bar.
 *
 * Renders a horizontal row of numbered circles connected by a progress line.
 * The current step is highlighted, completed steps show a checkmark, and
 * upcoming steps are muted. An `aria-live="polite"` region announces step
 * changes to screen readers.
 */
export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  steps,
  currentStep,
  className,
}) => {
  return (
    <nav
      aria-label="Onboarding progress"
      className={cn('w-full', className)}
    >
      {/* Screen-reader announcement */}
      <div className="sr-only" aria-live="polite" role="status">
        Step {currentStep + 1} of {steps.length}: {steps[currentStep]?.label}
      </div>

      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isUpcoming = index > currentStep;

          return (
            <React.Fragment key={step.id}>
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                <div
                  className={cn(
                    'w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300',
                    isCompleted &&
                      'bg-green-600 text-white',
                    isCurrent &&
                      'bg-blue-600 text-white ring-4 ring-blue-200 dark:ring-blue-900',
                    isUpcoming &&
                      'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400',
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`Step ${index + 1}: ${step.label}${
                    isCompleted ? ' (completed)' : isCurrent ? ' (current)' : ''
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    'text-[10px] sm:text-xs font-medium text-center max-w-[80px] leading-tight',
                    isCurrent
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-500 dark:text-slate-400',
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line between steps */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-1 sm:mx-2 rounded-full transition-colors duration-300',
                    index < currentStep
                      ? 'bg-green-600'
                      : 'bg-gray-200 dark:bg-slate-700',
                  )}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};

export default ProgressIndicator;
