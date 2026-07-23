import React from 'react';
import Head from 'next/head';

export default function Offline() {
  return (
    <>
      <Head>
        <title>Offline | StarkEd</title>
      </Head>
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100 px-4 text-center">
        <h1 className="text-4xl font-bold mb-4">You are offline</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-md">
          It looks like you've lost your internet connection. Some features of StarkEd may be unavailable until you reconnect.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    </>
  );
}
