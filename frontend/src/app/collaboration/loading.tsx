import React from 'react';

export default function CollaborationLoading() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-white text-lg">Connecting to collaboration workspace...</p>
      </div>
    </div>
  );
}
