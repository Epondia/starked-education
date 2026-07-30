'use client';

import React, { useCallback } from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  /** Current active page (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Called when a page is selected */
  onPageChange: (page: number) => void;
  /** Maximum visible sibling pages around the current page (default: 1) */
  siblingCount?: number;
  /** Show page size selector */
  pageSize?: number;
  /** Available page size options */
  pageSizeOptions?: number[];
  /** Called when page size changes */
  onPageSizeChange?: (size: number) => void;
  /** Total count of items (shown in summary) */
  totalItems?: number;
  /** Custom class */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

function range(start: number, end: number): number[] {
  const result: number[] = [];
  for (let i = start; i <= end; i++) result.push(i);
  return result;
}

/**
 * Builds the page number array with ellipses.
 * Example: [1, '...', 4, 5, 6, '...', 10]
 */
function buildPageNumbers(
  currentPage: number,
  totalPages: number,
  siblingCount: number,
): (number | 'ellipsis')[] {
  const totalPageNumbers = siblingCount * 2 + 5; // siblings + first + last + current + 2 ellipses

  if (totalPages <= totalPageNumbers) {
    return range(1, totalPages);
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

  const showLeftEllipsis = leftSiblingIndex > 2;
  const showRightEllipsis = rightSiblingIndex < totalPages - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftItemCount = 3 + 2 * siblingCount;
    const leftRange = range(1, leftItemCount);
    return [...leftRange, 'ellipsis' as const, totalPages];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightItemCount = 3 + 2 * siblingCount;
    const rightRange = range(totalPages - rightItemCount + 1, totalPages);
    return [1, 'ellipsis' as const, ...rightRange];
  }

  return [
    1,
    'ellipsis' as const,
    ...range(leftSiblingIndex, rightSiblingIndex),
    'ellipsis' as const,
    totalPages,
  ];
}

const baseButtonClass =
  'inline-flex items-center justify-center min-w-[40px] h-10 px-3 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2';

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  pageSize,
  pageSizeOptions = [10, 20, 50],
  onPageSizeChange,
  totalItems,
  className,
  disabled = false,
}: PaginationProps) {
  const pageNumbers = buildPageNumbers(currentPage, totalPages, siblingCount);

  const handlePrev = useCallback(() => {
    if (currentPage > 1 && !disabled) onPageChange(currentPage - 1);
  }, [currentPage, disabled, onPageChange]);

  const handleNext = useCallback(() => {
    if (currentPage < totalPages && !disabled) onPageChange(currentPage + 1);
  }, [currentPage, totalPages, disabled, onPageChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, page: number) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!disabled) onPageChange(page);
      }
    },
    [disabled, onPageChange],
  );

  if (totalPages <= 1 && !pageSize) return null;

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={cn('flex flex-col items-center gap-3 sm:flex-row sm:justify-between', className)}
    >
      {/* Item summary */}
      <div className="text-sm text-slate-500 dark:text-slate-400">
        {totalItems !== undefined && (
          <span>
            Showing {totalItems === 0 ? 0 : (currentPage - 1) * (pageSize ?? 10) + 1}
            {' – '}
            {Math.min(currentPage * (pageSize ?? 10), totalItems)} of {totalItems} results
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Prev button */}
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentPage <= 1 || disabled}
          aria-label="Go to previous page"
          className={cn(
            baseButtonClass,
            'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            (currentPage <= 1 || disabled) && 'pointer-events-none opacity-40',
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Page buttons */}
        {pageNumbers.map((page, idx) => {
          if (page === 'ellipsis') {
            return (
              <span
                key={`ellipsis-${idx}`}
                className="flex h-10 w-10 items-center justify-center text-sm text-slate-400"
                aria-hidden="true"
              >
                <MoreHorizontal className="h-4 w-4" />
              </span>
            );
          }

          const isActive = page === currentPage;

          return (
            <button
              key={page}
              type="button"
              onClick={() => !disabled && onPageChange(page as number)}
              onKeyDown={(e) => handleKeyDown(e, page as number)}
              disabled={disabled}
              aria-current={isActive ? 'page' : undefined}
              aria-label={isActive ? `Page ${page}, current page` : `Go to page ${page}`}
              className={cn(
                baseButtonClass,
                isActive
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              {page}
            </button>
          );
        })}

        {/* Next button */}
        <button
          type="button"
          onClick={handleNext}
          disabled={currentPage >= totalPages || disabled}
          aria-label="Go to next page"
          className={cn(
            baseButtonClass,
            'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            (currentPage >= totalPages || disabled) && 'pointer-events-none opacity-40',
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Page size selector */}
      {pageSize && onPageSizeChange && (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <label htmlFor="pagination-page-size" className="whitespace-nowrap">
            Items per page:
          </label>
          <select
            id="pagination-page-size"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      )}
    </nav>
  );
}

/**
 * Simplified Pagination component that only shows Previous/Next buttons
 * with page information. Useful for compact layouts.
 */
export function PaginationSimple({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  disabled = false,
  className,
}: Omit<PaginationProps, 'siblingCount' | 'pageSize' | 'pageSizeOptions' | 'onPageSizeChange'> & { pageSize?: number }) {
  if (totalPages <= 1) return null;

  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={cn('flex items-center justify-between gap-4', className)}
    >
      <span className="text-sm text-slate-500 dark:text-slate-400">
        Page {currentPage} of {totalPages}
        {totalItems !== undefined && pageSize && (
          <> &middot; {totalItems} total</>
        )}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || disabled}
          aria-label="Previous page"
          className={cn(
            baseButtonClass,
            'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            (currentPage <= 1 || disabled) && 'pointer-events-none opacity-40',
          )}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Prev
        </button>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages || disabled}
          aria-label="Next page"
          className={cn(
            baseButtonClass,
            'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            (currentPage >= totalPages || disabled) && 'pointer-events-none opacity-40',
          )}
        >
          Next
          <ChevronRight className="ml-1 h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
