'use client';

import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { SortOption } from './types';

export interface SortDropdownOption {
  value: SortOption;
  label: string;
}

const DEFAULT_OPTIONS: SortDropdownOption[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most popular' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'duration', label: 'Shortest duration' },
  { value: 'price-low', label: 'Lowest price' },
  { value: 'price-high', label: 'Highest price' },
];

export interface SortDropdownProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  /** Override the default option set if needed. */
  options?: SortDropdownOption[];
  /** ARIA label override; defaults to "Sort by". */
  ariaLabel?: string;
  /** Optional className appended to the outer button. */
  className?: string;
  /** Optional ID linking the dropdown to an external label. */
  id?: string;
}

/**
 * SortDropdown — accessible button-styled dropdown used by the discovery
 * experience (issue #112). Implemented as a native `<select>` for keyboard
 * friendliness and screen-reader compatibility while still matching the
 * existing rounded-pill, slate colour palette.
 */
export const SortDropdown: React.FC<SortDropdownProps> = ({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  ariaLabel = 'Sort by',
  className = '',
  id,
}) => {
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <label
        className="mr-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"
        htmlFor={id}
      >
        Sort
      </label>
      <div className="relative">
        <select
          id={id}
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onChange(event.target.value as SortOption)}
          className="appearance-none rounded-full border border-slate-200 bg-white py-2 pl-4 pr-9 text-sm text-slate-700 focus:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>
    </div>
  );
};

export default SortDropdown;
