'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, BookOpen, RefreshCcw } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { DiscoveryCourse, ViewMode } from './types';
import CourseCard from './CourseCard';
import { CourseGridSkeleton } from './CourseCardSkeleton';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { useScrollRestoration } from '../../hooks/useScrollRestoration';
import { useVirtualList } from '../../hooks/useVirtualList';

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

/** Animated spinner shown at the bottom while a page is loading. */
export const InfiniteScrollSpinner: React.FC<{ className?: string }> = ({
  className = '',
}) => (
  <div
    role="status"
    aria-live="polite"
    aria-label="Loading more courses"
    className={`flex items-center justify-center gap-2 py-6 ${className}`}
  >
    <Loader2 className="h-5 w-5 animate-spin text-amber-500" aria-hidden="true" />
    <span className="text-sm text-slate-500">Loading more courses…</span>
  </div>
);

/** Empty-state illustration and message. */
export const EmptyState: React.FC<{
  query?: string;
  onClear?: () => void;
}> = ({ query, onClear }) => (
  <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
    <BookOpen className="h-12 w-12 text-slate-300" aria-hidden="true" />
    <div>
      <p className="text-lg font-semibold text-slate-700">No courses found</p>
      {query ? (
        <p className="mt-1 text-sm text-slate-500">
          We couldn&rsquo;t find anything for{' '}
          <strong>&ldquo;{query}&rdquo;</strong>. Try different keywords.
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-500">
          Try adjusting your filters or search terms.
        </p>
      )}
    </div>
    {onClear && (
      <button
        onClick={onClear}
        className="mt-2 rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
      >
        Clear filters
      </button>
    )}
  </div>
);

/** Error state with retry action. */
export const ErrorState: React.FC<{
  message?: string;
  onRetry?: () => void;
}> = ({ message = 'Something went wrong loading courses.', onRetry }) => (
  <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
    <AlertCircle className="h-12 w-12 text-red-400" aria-hidden="true" />
    <div>
      <p className="text-lg font-semibold text-slate-700">Failed to load</p>
      <p className="mt-1 text-sm text-slate-500">{message}</p>
    </div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
      >
        <RefreshCcw size={14} aria-hidden="true" />
        Try again
      </button>
    )}
  </div>
);

/** End-of-list indicator shown when all pages have been loaded. */
const EndOfList: React.FC<{ total: number }> = ({ total }) => (
  <p
    aria-live="polite"
    className="py-6 text-center text-sm text-slate-400"
  >
    Showing all {total} course{total !== 1 ? 's' : ''}
  </p>
);

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------

const CARD_HEIGHT_GRID = 400; // px — approximate card height for virtual list
const CARD_HEIGHT_LIST = 200;
const VIRTUAL_THRESHOLD = 40; // enable virtual list only above this many items

export interface InfiniteScrollListProps {
  courses: DiscoveryCourse[];
  isLoading: boolean;
  isInitialLoad: boolean;
  hasMore: boolean;
  error: string | null;
  view?: ViewMode;
  query?: string;
  total?: number;
  onLoadMore: () => void;
  onRetry?: () => void;
  onClearFilters?: () => void;
  /** Attach to a course card action */
  onPreview?: (course: DiscoveryCourse) => void;
  onSave?: (course: DiscoveryCourse) => void;
  onFindSimilar?: (course: DiscoveryCourse) => void;
  /** Key used for scroll-position persistence */
  scrollKey?: string;
  /**
   * Enable windowed rendering for very large datasets.
   * Requires a fixed container height.
   */
  enableVirtualization?: boolean;
  /** Height of the scroll container when virtualization is enabled (px). */
  containerHeight?: number;
}

export const InfiniteScrollList: React.FC<InfiniteScrollListProps> = ({
  courses,
  isLoading,
  isInitialLoad,
  hasMore,
  error,
  view = 'grid',
  query,
  total,
  onLoadMore,
  onRetry,
  onClearFilters,
  onPreview,
  onSave,
  onFindSimilar,
  scrollKey,
  enableVirtualization = false,
  containerHeight = 800,
}) => {
  const { sentinelRef } = useInfiniteScroll({
    onLoadMore,
    hasMore,
    isLoading,
    rootMargin: '300px',
  });

  const { containerRef: scrollContainerRef } = useScrollRestoration({
    key: scrollKey,
    disabled: isInitialLoad,
  });

  const itemHeight = view === 'list' ? CARD_HEIGHT_LIST : CARD_HEIGHT_GRID;
  const useVirtual = enableVirtualization && courses.length >= VIRTUAL_THRESHOLD;

  const { virtualItems, totalHeight, containerRef: virtualContainerRef } =
    useVirtualList({
      items: courses,
      itemHeight,
      containerHeight,
    });

  // Merge scroll-restoration ref and virtual-list ref into one callback
  const mergedContainerRef = useCallback(
    (node: HTMLElement | null) => {
      scrollContainerRef(node);
      if (useVirtual) virtualContainerRef(node);
    },
    [scrollContainerRef, useVirtual, virtualContainerRef],
  );

  // ── Initial skeleton ──────────────────────────────────────────
  if (isInitialLoad) {
    return (
      <div
        className={
          view === 'grid'
            ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
            : 'flex flex-col gap-4'
        }
      >
        <CourseGridSkeleton count={6} view={view} />
      </div>
    );
  }

  // ── Error (first page) ────────────────────────────────────────
  if (error && courses.length === 0) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  // ── Empty ─────────────────────────────────────────────────────
  if (!isLoading && courses.length === 0) {
    return <EmptyState query={query} onClear={onClearFilters} />;
  }

  // ── Virtualized rendering ─────────────────────────────────────
  if (useVirtual) {
    return (
      <div
        ref={mergedContainerRef}
        style={{ height: containerHeight, overflowY: 'auto' }}
        className="relative"
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {virtualItems.map(({ item, index, offsetTop }) => (
            <div
              key={item.id}
              style={{
                position: 'absolute',
                top: offsetTop,
                width: '100%',
              }}
            >
              <CourseCard
                course={item}
                view={view}
                onPreview={() => onPreview?.(item)}
                onSave={() => onSave?.(item)}
                onFindSimilar={() => onFindSimilar?.(item)}
              />
            </div>
          ))}
        </div>

        {/* Sentinel for IntersectionObserver */}
        <div ref={sentinelRef} style={{ position: 'absolute', bottom: 0, height: 1, width: '100%' }} />

        {isLoading && <InfiniteScrollSpinner />}
        {!hasMore && courses.length > 0 && <EndOfList total={total ?? courses.length} />}
      </div>
    );
  }

  // ── Standard (non-virtualized) rendering ─────────────────────
  const gridClass =
    view === 'grid'
      ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
      : 'flex flex-col gap-4';

  return (
    <div ref={mergedContainerRef}>
      {/* Course cards */}
      <div className={gridClass}>
        {courses.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            view={view}
            onPreview={() => onPreview?.(course)}
            onSave={() => onSave?.(course)}
            onFindSimilar={() => onFindSimilar?.(course)}
          />
        ))}

        {/* Skeleton rows appended while loading a subsequent page */}
        {isLoading && <CourseGridSkeleton count={3} view={view} />}
      </div>

      {/* Inline error for pagination failures */}
      {error && courses.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              <RefreshCcw size={12} aria-hidden="true" />
              Retry
            </button>
          )}
        </div>
      )}

      {/* IntersectionObserver sentinel */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />

      {/* Bottom states */}
      {isLoading && !error && <InfiniteScrollSpinner />}
      {!hasMore && !isLoading && courses.length > 0 && (
        <EndOfList total={total ?? courses.length} />
      )}
    </div>
  );
};

export default InfiniteScrollList;
