'use client';

import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, BookPlus } from 'lucide-react';
import {
  courseSchema,
  type CourseFormData,
  type CourseFormDataIn,
  COURSE_CATEGORIES,
  COURSE_DIFFICULTY_LEVELS,
  COURSE_CURRENCIES,
} from '@/lib/schemas';
import { FormField } from '@/components/forms/FormField';

export interface CourseCreationFormProps {
  onSubmit: (data: CourseFormData) => Promise<void>;
  defaultValues?: Partial<CourseFormDataIn>;
  submitLabel?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  blockchain: 'Blockchain', programming: 'Programming',
  'data-science': 'Data Science', design: 'Design',
  business: 'Business', language: 'Language',
  mathematics: 'Mathematics', science: 'Science',
  arts: 'Arts & Humanities', other: 'Other',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced',
};

const selectClasses = (hasError: boolean) =>
  `w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${
    hasError
      ? 'border-red-400 focus:ring-red-500'
      : 'border-gray-300 dark:border-slate-600 focus:ring-blue-500'
  }`;

/**
 * Course creation form with real-time (onBlur) Zod validation and inline error states.
 */
export function CourseCreationForm({
  onSubmit,
  defaultValues,
  submitLabel = 'Create course',
}: CourseCreationFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid },
    watch,
  } = useForm<CourseFormDataIn, any, CourseFormData>({
    resolver: zodResolver(
      courseSchema as unknown as Parameters<typeof zodResolver>[0],
    ) as unknown as Resolver<CourseFormDataIn, any, CourseFormData>,
    mode: 'onBlur',
    defaultValues: {
      price: '0', currency: 'XLM', isPublished: false,
      prerequisites: '', tags: '',
      ...defaultValues,
    },
  });

  const descLength = (watch('description') ?? '').length;

  const onFormSubmit = async (data: CourseFormData) => {
    setServerError(null);
    try {
      await onSubmit(data);
    } catch (error: unknown) {
      setServerError(error instanceof Error ? error.message : 'Failed to save course.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} noValidate className="space-y-6">
      {/* Title */}
      <FormField
        label="Course title"
        type="text"
        required
        placeholder="e.g. Introduction to Stellar Blockchain"
        helperText="5–120 characters."
        error={errors.title?.message}
        {...register('title')}
      />

      {/* Description */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <label htmlFor="course-desc" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Description <span className="text-red-500 ml-0.5" aria-label="required">*</span>
          </label>
          <span className={`text-xs ${descLength > 2000 ? 'text-red-600' : 'text-gray-500'}`}>
            {descLength}/2,000
          </span>
        </div>
        <textarea
          id="course-desc"
          rows={5}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? 'course-desc-error' : undefined}
          placeholder="Describe what students will learn…"
          className={`w-full px-3 py-2 border rounded-lg resize-none bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
            errors.description ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 dark:border-slate-600 focus:ring-blue-500'
          }`}
          {...register('description')}
        />
        {errors.description && (
          <p id="course-desc-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errors.description.message}
          </p>
        )}
      </div>

      {/* Category + Difficulty */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="course-category" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Category <span className="text-red-500 ml-0.5" aria-label="required">*</span>
          </label>
          <select
            id="course-category"
            aria-invalid={Boolean(errors.category)}
            aria-describedby={errors.category ? 'course-category-error' : undefined}
            className={selectClasses(Boolean(errors.category))}
            {...register('category')}
          >
            <option value="">Select a category</option>
            {COURSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat] ?? cat}</option>
            ))}
          </select>
          {errors.category && (
            <p id="course-category-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.category.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="course-difficulty" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Difficulty <span className="text-red-500 ml-0.5" aria-label="required">*</span>
          </label>
          <select
            id="course-difficulty"
            aria-invalid={Boolean(errors.difficulty)}
            aria-describedby={errors.difficulty ? 'course-difficulty-error' : undefined}
            className={selectClasses(Boolean(errors.difficulty))}
            {...register('difficulty')}
          >
            <option value="">Select difficulty</option>
            {COURSE_DIFFICULTY_LEVELS.map((level) => (
              <option key={level} value={level}>{DIFFICULTY_LABELS[level] ?? level}</option>
            ))}
          </select>
          {errors.difficulty && (
            <p id="course-difficulty-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.difficulty.message}
            </p>
          )}
        </div>
      </div>

      {/* Price + Currency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Price"
          type="text"
          inputMode="decimal"
          required
          placeholder="0"
          helperText="Enter 0 for a free course."
          error={errors.price?.message}
          {...register('price')}
        />

        <div className="space-y-1">
          <label htmlFor="course-currency" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Currency <span className="text-red-500 ml-0.5" aria-label="required">*</span>
          </label>
          <select
            id="course-currency"
            aria-invalid={Boolean(errors.currency)}
            aria-describedby={errors.currency ? 'course-currency-error' : undefined}
            className={selectClasses(Boolean(errors.currency))}
            {...register('currency')}
          >
            {COURSE_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {errors.currency && (
            <p id="course-currency-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.currency.message}
            </p>
          )}
        </div>
      </div>

      {/* Duration */}
      <FormField
        label="Estimated duration"
        type="text"
        required
        placeholder="e.g. 8 hours, 4 weeks"
        helperText="Give students a realistic time estimate."
        error={errors.duration?.message}
        {...register('duration')}
      />

      {/* Prerequisites */}
      <FormField
        label="Prerequisites"
        multiline
        rows={2}
        placeholder="What should students know beforehand? (optional)"
        error={errors.prerequisites?.message}
        {...register('prerequisites')}
      />

      {/* Tags */}
      <FormField
        label="Tags"
        type="text"
        placeholder="stellar, blockchain, defi (comma-separated, optional)"
        helperText="Comma-separated keywords to aid discoverability."
        error={errors.tags?.message}
        {...register('tags')}
      />

      {/* Publish toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          {...register('isPublished')}
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Publish immediately</span>
      </label>

      {serverError && (
        <div role="alert" aria-live="assertive" className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !isValid}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Saving…</>
        ) : (
          <><BookPlus className="w-4 h-4" aria-hidden="true" /> {submitLabel}</>
        )}
      </button>
    </form>
  );
}
