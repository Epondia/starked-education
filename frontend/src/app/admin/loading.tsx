import React from 'react';

export default function AdminLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-20 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-36 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse"></div>
        ))}
      </div>
      <div className="h-64 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse"></div>
    </div>
  );
}
