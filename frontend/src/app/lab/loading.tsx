import React from 'react';

export default function LabLoading() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <h2 className="text-xl font-semibold">Loading Virtual Science Lab...</h2>
        <p className="text-gray-400 text-sm max-w-sm">Preparing 3D environment, physics engine, and interactive lab equipment.</p>
      </div>
    </div>
  );
}
