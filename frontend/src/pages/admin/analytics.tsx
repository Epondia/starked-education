import React from 'react';
import Head from 'next/head';

export default function AnalyticsDashboard() {
  return (
    <>
      <Head>
        <title>Analytics Dashboard | StarkEd Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              View platform usage, user engagement, and performance metrics.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden min-h-[800px] flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex justify-between items-center">
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">Plausible Analytics</h2>
              <a 
                href="https://plausible.io/starked-education.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
              >
                Open in Plausible
              </a>
            </div>
            <div className="flex-grow w-full h-full p-0">
              <iframe 
                plausible-embed="true" 
                src="https://plausible.io/share/starked-education.com?auth=YOUR_AUTH_TOKEN&theme=system" 
                scrolling="no" 
                frameBorder="0" 
                loading="lazy" 
                style={{ width: '100%', height: '100%', minHeight: '800px' }}
                title="Plausible Analytics"
              ></iframe>
              <script async src="https://plausible.io/js/embed.host.js"></script>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
