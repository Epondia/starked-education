/**
 * MobileTable
 *
 * A responsive table wrapper that renders a standard <table> on md+ screens
 * and collapses each row into a labelled card on smaller screens.
 *
 * Usage:
 * ```tsx
 * <MobileTable
 *   columns={[
 *     { key: 'name',   label: 'Name' },
 *     { key: 'email',  label: 'Email' },
 *     { key: 'status', label: 'Status', render: (v) => <Badge>{v}</Badge> },
 *   ]}
 *   rows={users}
 *   keyField="id"
 * />
 * ```
 */

import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MobileTableColumn<T = Record<string, unknown>> {
  /** Unique key matching a property on the row data (or used as identifier). */
  key: string;
  /** Human-readable column heading. */
  label: string;
  /**
   * Optional custom renderer.  Receives the cell value and the full row.
   * Falls back to `String(value)` when omitted.
   */
  render?: (value: unknown, row: T) => React.ReactNode;
  /** Hide this column in the card view (e.g. for columns shown elsewhere). */
  hideInCard?: boolean;
  /** Extra className applied to the <th> / <td> (desktop). */
  className?: string;
}

export interface MobileTableProps<T extends Record<string, unknown> = Record<string, unknown>> {
  columns: MobileTableColumn<T>[];
  rows: T[];
  /** Property name used as React key for each row. */
  keyField: keyof T;
  /**
   * Optional slot rendered after each card row (mobile) or at the end of
   * each table row (desktop) — useful for action buttons.
   */
  rowActions?: (row: T) => React.ReactNode;
  /** Message shown when `rows` is empty. */
  emptyMessage?: string;
  /** Additional className on the root wrapper element. */
  className?: string;
  /** Applied to the <table> element (desktop only). */
  tableClassName?: string;
  /** Whether to show a loading skeleton. */
  loading?: boolean;
  /** Number of skeleton rows to show when `loading` is true. */
  loadingRows?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCellValue<T extends Record<string, unknown>>(
  row: T,
  column: MobileTableColumn<T>,
): React.ReactNode {
  const raw = row[column.key];
  if (column.render) return column.render(raw, row);
  if (raw === null || raw === undefined) return '—';
  return String(raw);
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton({ columns, rows }: { columns: number; rows: number }) {
  return (
    <>
      {/* Desktop skeleton */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-700">
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-4 py-3 text-left">
                  <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded animate-pulse w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, ri) => (
              <tr key={ri} className="border-b border-gray-100 dark:border-slate-800">
                {Array.from({ length: columns }).map((_, ci) => (
                  <td key={ci} className="px-4 py-3">
                    <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded animate-pulse w-full max-w-xs" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile skeleton */}
      <div className="md:hidden space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="mobile-card space-y-2 animate-pulse">
            {Array.from({ length: columns }).map((_, j) => (
              <div key={j} className="flex justify-between">
                <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-20" />
                <div className="h-3 bg-gray-100 dark:bg-slate-600 rounded w-32" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MobileTable<T extends Record<string, unknown> = Record<string, unknown>>({
  columns,
  rows,
  keyField,
  rowActions,
  emptyMessage = 'No data available.',
  className = '',
  tableClassName = '',
  loading = false,
  loadingRows = 5,
}: MobileTableProps<T>) {
  if (loading) {
    return (
      <div className={`no-overflow ${className}`}>
        <LoadingSkeleton columns={columns.length + (rowActions ? 1 : 0)} rows={loadingRows} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className={`py-12 text-center text-gray-500 dark:text-slate-400 ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  const visibleCardColumns = columns.filter((c) => !c.hideInCard);

  return (
    <div className={`no-overflow ${className}`}>
      {/* ── Desktop: standard table ─────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto scroll-x-auto">
        <table className={`w-full text-sm text-left ${tableClassName}`}>
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3 font-semibold text-gray-700 dark:text-slate-300 whitespace-nowrap ${col.className ?? ''}`}
                >
                  {col.label}
                </th>
              ))}
              {rowActions && (
                <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-slate-300 text-right">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {rows.map((row) => (
              <tr
                key={String(row[keyField])}
                className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-gray-800 dark:text-slate-200 ${col.className ?? ''}`}
                  >
                    {getCellValue(row, col)}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {rowActions(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: card view ───────────────────────────────────────────── */}
      <div className="md:hidden space-y-3" role="list">
        {rows.map((row) => (
          <article
            key={String(row[keyField])}
            role="listitem"
            className="mobile-card"
          >
            <dl className="space-y-2">
              {visibleCardColumns.map((col, idx) => (
                <div
                  key={col.key}
                  className={`flex items-start justify-between gap-3 ${
                    idx !== visibleCardColumns.length - 1
                      ? 'pb-2 border-b border-gray-100 dark:border-slate-700'
                      : ''
                  }`}
                >
                  <dt className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide flex-shrink-0 min-w-[80px]">
                    {col.label}
                  </dt>
                  <dd className="text-sm text-gray-800 dark:text-slate-200 text-right flex-1">
                    {getCellValue(row, col)}
                  </dd>
                </div>
              ))}
            </dl>
            {rowActions && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-2">
                {rowActions(row)}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

export default MobileTable;
