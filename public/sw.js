const CACHE_NAME = 'evivlive-v2';
const OFFLINE_URL = '/offline.html';

const ASSETS_TO_CACHE = [
  '/',
  '/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests and skip Next.js static chunks/web sockets or dev hot reloads.
  // API and stream traffic (/api/proxy playlists + segments) goes straight to the network: a
  // synthetic 480 "offline" response there would turn a retryable network blip into an HTTP
  // error that hls.js refuses to retry, killing playback instead of riding the blip out.
  if (
    event.request.method !== 'GET' || 
    event.request.url.includes('/_next/') || 
    new URL(event.request.url).pathname.startsWith('/api/') ||
    event.request.url.includes('webpack') ||
    event.request.url.includes('chrome-extension')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          return new Response('Offline Connection Lost', { 
            status: 480, 
            headers: { 'Content-Type': 'text/plain' } 
          });
        });
      })
  );
});
