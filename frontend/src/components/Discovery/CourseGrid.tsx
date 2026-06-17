import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DiscoveryCourse as Course } from './types';
import SearchBar from './SearchBar';
import FilterPanel from './FilterPanel';
import CourseCard from './CourseCard';

const DEFAULT_PAGE_SIZE = 12;

export const CourseGrid: React.FC = () => {
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<'relevance'|'newest'|'popular'|'duration'>('relevance');

  const [courses, setCourses] = useState<Course[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Fetch available categories (once)
  useEffect(() => {
    let mounted = true;
    fetch('/api/categories')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        if (mounted && Array.isArray(data)) setCategories(data);
      })
      .catch(() => {})
    return () => { mounted = false; };
  }, []);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (selected.size) params.set('categories', Array.from(selected).join(','));
    if (sort) params.set('sort', sort);
    params.set('limit', String(DEFAULT_PAGE_SIZE));
    params.set('page', String(page));
    return params.toString();
  }, [query, selected, sort, page]);

  useEffect(() => {
    const controller = new AbortController();
    const qs = buildQuery();
    setIsLoading(true);
    fetch(`/api/courses?${qs}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { items: Course[]; total?: number }) => {
        if (page === 1) setCourses(data.items || []);
        else setCourses((prev) => [...prev, ...(data.items || [])]);
        setHasMore((data.items || []).length === DEFAULT_PAGE_SIZE);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        console.error('Failed to load courses', err);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [buildQuery, page]);

  // reset page when query/filters change
  useEffect(() => { setPage(1); }, [query, Array.from(selected).join(','), sort]);

  const toggleCategory = (cat: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const loadMore = () => setPage((p) => p + 1);

  const courseList = useMemo(() => courses, [courses]);

  return (
    <div style={{display: 'flex', gap: 16}}>
      <FilterPanel categories={categories} selected={selected} onToggleCategory={toggleCategory} sort={sort as any} onSortChange={(s) => setSort(s)} />

      <main style={{flex: 1}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
          <SearchBar onSearch={setQuery} initial={query} />
        </div>

        <section>
          {isLoading && page === 1 ? (
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12}}>
              {Array.from({length: 6}).map((_, i) => (
                <div key={i} style={{background: '#fafafa', height: 100, borderRadius: 8}} />
              ))}
            </div>
          ) : (
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12}}>
              {courseList.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          )}
        </section>

        <div style={{marginTop: 12, textAlign: 'center'}}>
          {isLoading && page > 1 && <div>Loading more…</div>}
          {!isLoading && hasMore && (
            <button onClick={loadMore} style={{padding: '8px 12px'}}>Load more</button>
          )}
          {!isLoading && !hasMore && courses.length > 0 && <div style={{color: '#666'}}>End of results</div>}
          {!isLoading && courses.length === 0 && <div style={{color: '#666'}}>No courses found</div>}
        </div>
      </main>
    </div>
  );
};

export default CourseGrid;
