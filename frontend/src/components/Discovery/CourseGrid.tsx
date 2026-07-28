'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DiscoveryCourse as Course } from './types';
import InfiniteScrollList from './InfiniteScrollList';

const DEFAULT_PAGE_SIZE = 12;

// Simple sort options for the standalone listing page
const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Popular' },
  { value: 'rating', label: 'Top Rated' },
  { value: 'duration', label: 'Duration' },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

/**
 * Standalone course listing page with infinite-scroll pagination.
 *
 * Replaces the old "Load more" button with an IntersectionObserver sentinel so
 * the next page loads automatically as the user scrolls toward the bottom.
 * Scroll position is restored when navigating back to this page, and skeleton
 * placeholders are shown both on the initial load and between pages.
 *
 * Uses simple inline search/filter controls so it remains self-contained.
 * For the full-featured discovery experience (with voice search, curators,
 * recommendations etc.) see DiscoveryExperience.tsx.
 */
export const CourseGrid: React.FC = () => {
  const [query, setQuery] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortValue>('relevance');

  const [courses, setCourses] = useState<Course[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch available categories once
  useEffect(() => {
    let mounted = true;
    fetch('/api/categories')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (mounted && Array.isArray(data)) setCategories(data);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const buildQuery = useCallback(
    (currentPage: number) => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (selected.size) params.set('categories', Array.from(selected).join(','));
      if (sort) params.set('sort', sort);
      params.set('limit', String(DEFAULT_PAGE_SIZE));
      params.set('page', String(currentPage));
      return params.toString();
    },
    [query, selected, sort],
  );

  const fetchPage = useCallback(
    (currentPage: number, signal: AbortSignal) => {
      const qs = buildQuery(currentPage);
      setIsLoading(true);
      setError(null);

      return fetch(`/api/courses?${qs}`, { signal })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data: { items?: Course[]; total?: number }) => {
          const items = data.items ?? [];
          if (currentPage === 1) {
            setCourses(items);
          } else {
            setCourses((prev) => [...prev, ...items]);
          }
          setTotal(data.total ?? 0);
          setHasMore(items.length === DEFAULT_PAGE_SIZE);
        })
        .catch((err: Error) => {
          if (err.name === 'AbortError') return;
          setError(err.message || 'Failed to load courses. Please try again.');
        })
        .finally(() => {
          setIsLoading(false);
          setIsInitialLoad(false);
        });
    },
    [buildQuery],
  );

  // Fetch page 1 whenever query/filters/sort change
  useEffect(() => {
    const controller = new AbortController();
    setIsInitialLoad(true);
    setPage(1);
    fetchPage(1, controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sort, selected]);

  // Fetch subsequent pages (page > 1)
  const currentPageRef = useRef(page);
  useEffect(() => {
    currentPageRef.current = page;
    if (page === 1) return; // already handled by the filter-change effect above
    const controller = new AbortController();
    fetchPage(page, controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      setPage((p) => p + 1);
    }
  }, [isLoading, hasMore]);

  const retry = useCallback(() => {
    const controller = new AbortController();
    fetchPage(currentPageRef.current, controller.signal);
  }, [fetchPage]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(inputValue.trim());
  };

  const toggleCategory = (cat: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const clearFilters = () => {
    setSelected(new Set());
    setInputValue('');
    setQuery('');
  };

  return (
    <div className="flex gap-4">
      {/* ── Sidebar filters ── */}
      {categories.length > 0 && (
        <aside className="hidden w-48 shrink-0 md:block">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Categories
          </p>
          <ul className="space-y-1">
            {categories.map((cat) => (
              <li key={cat}>
                <button
                  onClick={() => toggleCategory(cat)}
                  className={`w-full rounded-lg px-3 py-1.5 text-left text-sm transition ${
                    selected.has(cat)
                      ? 'bg-amber-100 font-medium text-amber-900'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {/* ── Main content ── */}
      <main className="min-w-0 flex-1">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex flex-1 gap-2">
            <input
              type="search"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Search courses…"
              className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
              aria-label="Search courses"
            />
            <button
              type="submit"
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Search
            </button>
          </form>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortValue)}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
            aria-label="Sort courses"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Active category chips */}
        {selected.size > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {Array.from(selected).map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900"
              >
                {cat}
                <button
                  onClick={() => toggleCategory(cat)}
                  aria-label={`Remove ${cat} filter`}
                  className="ml-0.5 text-amber-700 hover:text-amber-900"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              onClick={clearFilters}
              className="text-xs text-slate-500 underline hover:text-slate-700"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Infinite scroll list */}
        <InfiniteScrollList
          courses={courses}
          isLoading={isLoading}
          isInitialLoad={isInitialLoad}
          hasMore={hasMore}
          error={error}
          view="grid"
          query={query}
          total={total}
          onLoadMore={loadMore}
          onRetry={retry}
          onClearFilters={clearFilters}
          scrollKey="course-grid"
        />
      </main>
    </div>
  );
};

export default CourseGrid;
