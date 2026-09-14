import React from 'react';

export default function PerformanceLoading() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="h-10 bg-gray-200 dark:bg-slate-800 rounded w-1/3 animate-pulse"></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-32 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse"></div>
        <div className="h-32 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse"></div>
        <div className="h-32 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse"></div>
      </div>
      <div className="h-48 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse"></div>
    </div>
  );
}
