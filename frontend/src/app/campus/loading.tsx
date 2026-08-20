import React from 'react';

export default function CampusLoading() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <div className="h-12 w-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <h2 className="text-xl font-semibold">Initializing Metaverse Campus...</h2>
        <p className="text-slate-400 text-sm max-w-sm">Loading 3D assets, avatar systems, and interactive campus nodes.</p>
      </div>
    </div>
  );
}
