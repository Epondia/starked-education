import React from 'react';

export default function GlobalLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Loading page content...</p>
      </div>
    </div>
  );
}
