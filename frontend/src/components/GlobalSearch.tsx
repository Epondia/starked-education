'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, X, Clock, Trash2, ArrowRight, BookOpen, User, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { discoveryApi } from '@/lib/discoveryApi';

const DEBOUNCE_MS = 300;
const RECENT_SEARCHES_KEY = 'starked-global-recent-searches';
const MAX_RECENT_SEARCHES = 8;

interface SearchResult {
  id: string;
  title: string;
  type: 'course' | 'credential' | 'profile';
  description?: string;
  subtitle?: string;
  category?: string;
  rating?: number;
  url?: string;
}

interface GlobalSearchProps {
  className?: string;
}

/**
 * Load recent searches from localStorage
 */
function loadRecentSearches(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save recent searches to localStorage
 */
function saveRecentSearches(searches: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES)));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Highlight matching text in a string
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-amber-100 text-amber-950 rounded-sm px-0.5 font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/**
 * Get icon for result type
 */
function ResultIcon({ type }: { type: SearchResult['type'] }) {
  const iconClass = 'w-4 h-4 shrink-0';
  switch (type) {
    case 'course':
      return <BookOpen className={cn(iconClass, 'text-blue-500')} />;
    case 'credential':
      return <Award className={cn(iconClass, 'text-amber-500')} />;
    case 'profile':
      return <User className={cn(iconClass, 'text-green-500')} />;
    default:
      return <Search className={cn(iconClass, 'text-slate-400')} />;
  }
}

/**
 * Type badge for result
 */
function TypeBadge({ type }: { type: SearchResult['type'] }) {
  const styles: Record<string, string> = {
    course: 'bg-blue-50 text-blue-700 border-blue-200',
    credential: 'bg-amber-50 text-amber-700 border-amber-200',
    profile: 'bg-green-50 text-green-700 border-green-200',
  };
  return (
    <span className={cn('text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', styles[type] || 'bg-slate-50 text-slate-600 border-slate-200')}>
      {type}
    </span>
  );
}

export function GlobalSearch({ className }: GlobalSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recent searches on mount
  useEffect(() => {
    setRecentSearches(loadRecentSearches());
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    debounceRef.current = setTimeout(async () => {
      try {
        const sessionId = window.sessionStorage.getItem('starked-discovery-session') ||
          `globalsearch_${Math.random().toString(36).slice(2, 10)}`;

        // Fetch from multiple sources in parallel
        const [searchData, suggestionData] = await Promise.allSettled([
          discoveryApi.search(
            {
              query: query.trim(),
              categories: [],
              levels: [],
              languages: [],
              tags: [],
              minRating: 0,
              maxPrice: undefined,
              maxDuration: undefined,
              freeOnly: false,
              sortBy: 'relevance',
              view: 'grid',
              page: 1,
              limit: 8,
            },
            sessionId
          ),
          discoveryApi.suggestions(query.trim(), sessionId),
        ]);

        const combinedResults: SearchResult[] = [];

        // Parse search results
        if (searchData.status === 'fulfilled' && searchData.value?.results) {
          for (const course of searchData.value.results.slice(0, 5)) {
            combinedResults.push({
              id: course.id,
              title: course.title,
              type: 'course',
              description: course.description?.substring(0, 150),
              category: course.category,
              rating: course.rating,
              url: `/courses/${course.id}`,
            });
          }
        }

        // Parse suggestions as additional results
        if (suggestionData.status === 'fulfilled' && suggestionData.value?.suggestions) {
          const existingTitles = new Set(combinedResults.map(r => r.title.toLowerCase()));
          for (const suggestion of suggestionData.value.suggestions) {
            if (!existingTitles.has(suggestion.toLowerCase())) {
              combinedResults.push({
                id: `suggestion-${suggestion}`,
                title: suggestion,
                type: 'course',
                url: `/discovery?q=${encodeURIComponent(suggestion)}`,
              });
            }
          }
        }

        setResults(combinedResults.slice(0, 8));
        setError(null);
      } catch (err) {
        setError('Search failed. Please try again.');
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  // Keyboard shortcut (Cmd/Ctrl + K) and Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  const displayItems = useMemo(() => {
    if (query.trim()) return results;
    return [];
  }, [query, results]);

  const showRecent = !query.trim() && recentSearches.length > 0;

  const handleSelect = useCallback(
    (item: SearchResult | string) => {
      const searchTerm = typeof item === 'string' ? item : item.title;
      // Save to recent searches
      const updated = [searchTerm, ...recentSearches.filter(s => s !== searchTerm)].slice(0, MAX_RECENT_SEARCHES);
      setRecentSearches(updated);
      saveRecentSearches(updated);

      setIsOpen(false);
      setQuery('');

      if (typeof item === 'object' && item.url) {
        window.location.href = item.url;
      } else {
        window.location.href = `/discovery?q=${encodeURIComponent(searchTerm)}`;
      }
    },
    [recentSearches]
  );

  const handleClearRecent = useCallback(() => {
    setRecentSearches([]);
    saveRecentSearches([]);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = displayItems;
    const recentItems = showRecent ? recentSearches : [];

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => {
        const max = showRecent ? recentItems.length - 1 : items.length - 1;
        if (prev >= max) return 0;
        return prev + 1;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => {
        const max = showRecent ? recentItems.length - 1 : items.length - 1;
        if (prev <= 0) return max;
        return prev - 1;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showRecent && selectedIndex >= 0 && recentSearches[selectedIndex]) {
        handleSelect(recentSearches[selectedIndex]);
      } else if (!showRecent && selectedIndex >= 0 && items[selectedIndex]) {
        handleSelect(items[selectedIndex]);
      } else if (query.trim()) {
        handleSelect(query.trim());
      }
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger button */}
      <button
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-400 transition-all hover:border-slate-300 hover:text-slate-600 hover:shadow-sm"
        aria-label="Search courses, credentials, and profiles"
      >
        <Search size={16} />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          ⌘K
        </kbd>
      </button>

      {/* Dropdown overlay */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Search panel */}
          <div
            className="fixed inset-x-0 top-[15%] z-50 mx-auto max-w-xl px-4 sm:px-0"
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded="true"
          >
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5">
              {/* Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <Search size={18} className="text-slate-400 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search courses, credentials, profiles..."
                  className="flex-1 bg-transparent border-none outline-none text-base text-slate-900 placeholder:text-slate-400"
                  aria-label="Search query"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    aria-label="Clear search"
                  >
                    <X size={16} />
                  </button>
                )}
                <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-100 rounded-md border border-slate-200">
                  Esc
                </kbd>
              </div>

              {/* Results / Recent */}
              <div className="max-h-80 overflow-y-auto">
                {/* Loading */}
                {isLoading && (
                  <div className="px-4 py-8 text-center">
                    <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                    <p className="mt-2 text-sm text-slate-500">Searching...</p>
                  </div>
                )}

                {/* Error */}
                {error && !isLoading && (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-red-500">{error}</p>
                  </div>
                )}

                {/* Empty results */}
                {!isLoading && !error && query.trim() && results.length === 0 && (
                  <div className="px-4 py-8 text-center">
                    <Search size={24} className="mx-auto text-slate-300" />
                    <p className="mt-2 text-sm text-slate-500">No results found for "{query}"</p>
                    <p className="mt-1 text-xs text-slate-400">Try a different search term or browse categories</p>
                  </div>
                )}

                {/* Results list */}
                {!isLoading && !error && results.length > 0 && (
                  <div className="py-1">
                    <div className="px-4 py-2 text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                      Results
                    </div>
                    {results.map((item, idx) => (
                      <button
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
                          idx === selectedIndex
                            ? 'bg-blue-50'
                            : 'hover:bg-slate-50'
                        )}
                      >
                        <ResultIcon type={item.type} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-900 truncate">
                              {highlightMatch(item.title, query)}
                            </span>
                            <TypeBadge type={item.type} />
                            {item.rating && (
                              <span className="text-[11px] text-amber-600 font-medium shrink-0">
                                ★ {item.rating.toFixed(1)}
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">
                              {highlightMatch(item.description, query)}
                            </p>
                          )}
                          {item.category && (
                            <span className="mt-1 inline-block text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                              {item.category}
                            </span>
                          )}
                        </div>
                        <ArrowRight size={14} className="shrink-0 text-slate-300 mt-1" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Recent searches */}
                {showRecent && (
                  <div className="py-1">
                    <div className="flex items-center justify-between px-4 py-2">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                        Recent Searches
                      </div>
                      <button
                        onClick={handleClearRecent}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors"
                        aria-label="Clear recent searches"
                      >
                        <Trash2 size={11} />
                        Clear
                      </button>
                    </div>
                    {recentSearches.map((term, idx) => (
                      <button
                        key={term}
                        onClick={() => handleSelect(term)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          idx === selectedIndex
                            ? 'bg-blue-50'
                            : 'hover:bg-slate-50'
                        )}
                      >
                        <Clock size={14} className="text-slate-400 shrink-0" />
                        <span className="text-sm text-slate-700 truncate">{term}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-400">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-slate-200 rounded text-[10px]">↑↓</kbd> Navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1 py-0.5 bg-slate-200 rounded text-[10px]">↵</kbd> Select
                  </span>
                </div>
                <span>Search courses, credentials, and profiles</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default GlobalSearch;
