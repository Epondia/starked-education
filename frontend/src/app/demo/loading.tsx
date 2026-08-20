import React from 'react';

export default function DemoLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-12 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse w-1/2 mx-auto"></div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse"></div>
          ))}
        </div>
        <div className="h-96 bg-gray-200 dark:bg-slate-800 rounded-lg animate-pulse"></div>
      </div>
    </div>
  );
}
