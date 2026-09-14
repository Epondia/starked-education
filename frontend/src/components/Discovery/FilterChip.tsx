'use client';

import { X } from 'lucide-react';
import * as React from 'react';

export interface FilterChipProps {
  /** Visible label for the chip — e.g. "Blockchain" or "Min rating: 4.5". */
  label: string;
  /** Optional icon shown to the left of the label. */
  icon?: React.ReactNode;
  /** Fired when the user presses the chip's remove button or activates it. */
  onRemove: () => void;
  /** Optional callback when the chip body itself is clicked (excluding the remove control). */
  onClick?: () => void;
  /** Optional className for layout overrides. */
  className?: string;
  /** Provide a stable id used by aria-described relations. */
  id?: string;
}

/**
 * FilterChip — a single removable pill shown above the discovery grid to
 * represent an active filter (issue #112).
 *
 * Accessibility:
 *  - The whole pill acts as a focusable button (when `onClick` is supplied).
 *  - The remove `×` button gets a descriptive `aria-label`.
 *  - Visible focus rings stay on a high-contrast colour.
 *  - Colour palette mirrors the existing `bg-amber-100` chip styles used
 *    elsewhere in the app so the UI stays coherent.
 */
export const FilterChip: React.FC<FilterChipProps> = ({
  label,
  icon,
  onRemove,
  onClick,
  className = '',
  id,
}) => {
  return (
    <span
      id={id}
      className={`inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 ${className}`}
    >
      {onClick ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          onClick={onClick}
        >
          {icon}
          {label}
        </button>
      ) : (
        <>
          {icon}
          <span>{label}</span>
        </>
      )}
      <button
        type="button"
        aria-label={`Remove filter: ${label}`}
        className="-mr-1 ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-800 transition hover:bg-amber-200 hover:text-amber-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        onClick={onRemove}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  );
};

/**
 * ActiveFilters — renders a horizontal list of removable FilterChip
 * instances derived from the current `DiscoveryFilters`. Designed to be
 * dropped directly above the results grid (issue #112). Pair with
 * `useUrlFilters` so the on-chip removals propagate back to the URL.
 */
export interface ActiveFilterDescriptor {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** Called when the user removes the filter that this chip represents. */
  onRemove: () => void;
}

export interface ActiveFiltersProps {
  filters: ActiveFilterDescriptor[];
  onClearAll?: () => void;
  ariaLabel?: string;
}

export const ActiveFilters: React.FC<ActiveFiltersProps> = ({
  filters,
  onClearAll,
  ariaLabel = 'Active filters',
}) => {
  if (filters.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap items-center gap-2"
    >
      {filters.map((f) => (
        <FilterChip
          key={f.key}
          label={f.label}
          icon={f.icon}
          onRemove={f.onRemove}
        />
      ))}
      {onClearAll && filters.length > 1 ? (
        <button
          type="button"
          onClick={onClearAll}
          className="ml-1 rounded-full px-3 py-1 text-xs text-slate-500 underline-offset-2 transition hover:text-slate-900 hover:underline"
        >
          Clear all filters
        </button>
      ) : null}
    </div>
  );
};

export default FilterChip;
