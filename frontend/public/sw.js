/**
 * StarkEd Service Worker v3
 *
 * Caching strategies:
 *   - Course content (lessons, videos, quizzes):  CacheFirst, 7-day expiration
 *   - Static assets (images, scripts, styles):    CacheFirst, 30-day expiration
 *   - GET API responses:                          NetworkFirst, 3s timeout -> cache
 *   - Documents / pages:                          StaleWhileRevalidate
 *   - Mutating API requests (POST/PUT/DELETE):    NetworkOnly + BackgroundSync replay
 *
 * Other features:
 *   - Push notifications
 *   - Background sync for offline progress submissions
 *   - Persistent storage request on activation
 */

importScripts(
  'https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js'
);

if (workbox) {
  const { routing, strategies, backgroundSync, expiration, cacheableResponse } =
    workbox;

  const { routing, strategies, backgroundSync, expiration, cacheableResponse } = workbox;

  // Setup Background Sync for offline interactions (POST, PUT, DELETE)
  const bgSyncPlugin = new backgroundSync.BackgroundSyncPlugin('starked-offline-queue', {
    maxRetentionTime: 24 * 60, // Retry for up to 24 hours (specified in minutes)
    onSync: async ({ queue }) => {
      console.log('🔄 Replaying offline queued requests via Background Sync...');
      try {
        await queue.replayRequests();
        // Notify all clients that sync completed
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_COMPLETED', timestamp: Date.now() });
        });
      } catch (error) {
        console.error('❌ Background Sync replay failed:', error);
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_FAILED', error: error.message, timestamp: Date.now() });
        });
      }
    }
  });

  // Cache mutation requests (POST, PUT, DELETE) with background sync
  routing.registerRoute(
    ({ url, request }) => url.pathname.startsWith('/api/') && ['POST', 'PUT', 'DELETE'].includes(request.method),
    new strategies.NetworkOnly({
      plugins: [bgSyncPlugin]
    })
  );

  routing.registerRoute(
    ({ url, request }) =>
      url.pathname.startsWith('/api/') &&
      ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method),
    new strategies.NetworkOnly({ plugins: [bgSyncPlugin] })
  );

  // ---------------------------------------------------------------------------
  // Course content – CacheFirst so students can keep learning when offline.
  // ---------------------------------------------------------------------------
  routing.registerRoute(
    ({ url }) =>
      /\/api\/courses\/[^/]+\/(content|lessons|quizzes|assets)\b/.test(
        url.pathname
      ),
    new strategies.CacheFirst({
      cacheName: COURSE_CACHE,
      plugins: [
        new cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
        new expiration.ExpirationPlugin({
          maxEntries: 500,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          purgeOnQuotaError: true,
        }),
      ],
    })
  );

  // ---------------------------------------------------------------------------
  // Static assets – CacheFirst
  // ---------------------------------------------------------------------------
  routing.registerRoute(
    ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
    new strategies.NetworkFirst({
      cacheName: 'starked-api-v2',
      networkTimeoutSeconds: 3,
      plugins: [
        new expiration.ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 Days
        }),
      ],
    })
  );

  // Cache-First for course content pages (HTML)
  routing.registerRoute(
    ({ url }) => url.pathname.startsWith('/courses/') && url.pathname.endsWith('.html'),
    new strategies.CacheFirst({
      cacheName: 'starked-course-content-v1',
      plugins: [
        new expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 14 * 24 * 60 * 60, // 14 Days
        }),
      ],
    })
  );

  // Cache-First for course assets (images, videos within courses)
  routing.registerRoute(
    ({ url, request }) => url.pathname.startsWith('/courses/') && (request.destination === 'image' || request.destination === 'video' || request.destination === 'font'),
    new strategies.CacheFirst({
      cacheName: 'starked-course-assets-v1',
      plugins: [
        new expiration.ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 14 * 24 * 60 * 60, // 14 Days
        }),
      ],
    })
  );

  // ---------------------------------------------------------------------------
  // GET APIs – NetworkFirst with 3s timeout fallback to cache
  // ---------------------------------------------------------------------------
  routing.registerRoute(
    ({ url, request }) =>
      url.pathname.startsWith('/api/') && request.method === 'GET',
    new strategies.NetworkFirst({
      cacheName: API_CACHE,
      networkTimeoutSeconds: 3,
      plugins: [
        new expiration.ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
          purgeOnQuotaError: true,
        }),
      ],
    })
  );

  // ---------------------------------------------------------------------------
  // Documents / HTML – StaleWhileRevalidate
  // ---------------------------------------------------------------------------
  routing.registerRoute(
    ({ request }) => request.destination === 'document',
    new strategies.StaleWhileRevalidate({
      cacheName: 'starked-dynamic-v2',
      plugins: [
        new expiration.ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 24 * 60 * 60, // 1 Day
        }),
      ],
    })
  );

  // Cache course API data (list, details) with cache first
  routing.registerRoute(
    ({ url }) => url.pathname.match(/^\/api\/courses(\/|$)/) && url.searchParams.has('offline'),
    new strategies.CacheFirst({
      cacheName: 'starked-courses-offline-v1',
      plugins: [
        new expiration.ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 14 * 24 * 60 * 60, // 14 Days
        }),
      ],
    })
  );

  // ---------------------------------------------------------------------------
  // Activate – clean up old-version caches
  // ---------------------------------------------------------------------------
  self.addEventListener('activate', (event) => {
    const allowedCaches = [
      STATIC_CACHE,
      COURSE_CACHE,
      API_CACHE,
      DYNAMIC_CACHE,
    ];
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith('starked-') && !allowedCaches.includes(key))
            .map((key) => caches.delete(key))
        );
        await self.clients.claim();

        // Try to request persistent storage so we don't get evicted under pressure.
        if (navigator.storage && navigator.storage.persist) {
          try {
            await navigator.storage.persist();
          } catch (_) {
            // best-effort
          }
        }
      })()
    );
  });

  self.addEventListener('install', () => {
    self.skipWaiting();
  });
} else {
  console.warn('Workbox failed to load – service worker running without it.');
}

// Custom background sync for progress updates and quiz answers
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-progress') {
    console.log('🔄 Custom Background sync triggered:', event.tag);
    event.waitUntil(processOfflineActions());
  }
});

// Process offline actions from IndexedDB using the StarkEdOfflineDB
async function processOfflineActions() {
  try {
    const dbRequest = indexedDB.open('StarkEdOfflineDB', 1);
    const db = await new Promise((resolve, reject) => {
      dbRequest.onsuccess = () => resolve(dbRequest.result);
      dbRequest.onerror = () => reject(dbRequest.error);
      dbRequest.onupgradeneeded = (event) => {
        const db = dbRequest.result;
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('courses')) {
          db.createObjectStore('courses', { keyPath: 'id' });
        }
      };
    });

    const transaction = db.transaction('syncQueue', 'readwrite');
    const store = transaction.objectStore('syncQueue');
    const items = await new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const remaining = [];

    for (const item of items) {
      try {
        const action = item.payload || {};
        const response = await fetch(action.endpoint || '/api/sync', {
          method: action.method || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: action.data ? JSON.stringify(action.data) : undefined,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch (error) {
        const retryCount = (item.retryCount || 0) + 1;
        if (retryCount < 3) {
          remaining.push({ ...item, retryCount });
        }
      }
    }

    // Clear and re-add remaining items
    store.clear();
    for (const item of remaining) {
      store.add(item);
    }

    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'OFFLINE_ACTIONS_PROCESSED',
        synced: items.length - remaining.length,
        failed: remaining.length,
        timestamp: Date.now()
      });
    });

    db.close();
  } catch (error) {
    console.error('Error processing offline actions:', error);
  }
}

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_NOW') {
    console.log('📩 Client requested immediate sync');
    if ('sync' in self.registration) {
      event.waitUntil(self.registration.sync.register('sync-progress'));
    } else {
      event.waitUntil(processOfflineActions());
    }
  }
});

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  console.log('📬 Push notification received:', event);

  const options = {
    body: payload.body || 'You have a new notification from StarkEd',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: payload.data || {},
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'StarkEd', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('/');
    })
  );
});

// Install event - pre-cache critical assets
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker activated');
  const cacheWhitelist = [
    'starked-static-v2',
    'starked-api-v2',
    'starked-dynamic-v2',
    'starked-course-content-v1',
    'starked-course-assets-v1',
    'starked-courses-offline-v1'
  ];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('🧹 Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});
