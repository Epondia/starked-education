'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton, SkeletonRegion } from '@/components/ui/Skeleton';

/**
 * Single credential card skeleton matching CredentialList card layout.
 */
function CredentialCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-start gap-4">
        {/* Type icon */}
        <Skeleton className="h-12 w-12 rounded-lg" />

        {/* Content */}
        <div className="flex-1 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-48" />
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div className="flex items-center gap-1">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>

          {/* Skills */}
          <div>
            <Skeleton className="mb-2 h-3 w-12" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-16 rounded" />
              <Skeleton className="h-6 w-14 rounded" />
              <Skeleton className="h-6 w-20 rounded" />
              <Skeleton className="h-6 w-12 rounded" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Skeleton className="h-8 w-16 rounded" />
            <Skeleton className="h-8 w-20 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for the credential list page.
 * Mirrors the real CredentialList layout: stats header + filters + credential cards.
 */
export function CredentialListSkeleton({ className }: { className?: string }) {
  return (
    <SkeletonRegion
      aria-label="Loading credentials"
      className={cn('space-y-6', className)}
    >
      {/* Stats Header */}
      <div className="rounded-lg border border-green-200 bg-gradient-to-r from-green-50 to-blue-50 p-6 dark:border-green-800 dark:from-green-900/20 dark:to-blue-900/20">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-7 w-36" />
          </div>
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="text-center">
              <Skeleton className="mx-auto h-7 w-10" />
              <Skeleton className="mx-auto mt-1 h-3 w-12" />
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Credential Cards */}
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <CredentialCardSkeleton key={i} />
        ))}
      </div>
    </SkeletonRegion>
  );
}

export default CredentialListSkeleton;
