// ClarityText Service Worker - v3 (AGGRESSIVE UPDATE)
const CACHE_NAME = 'claritytext-v3';
const urlsToCache = [
  '/manifest-v2.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - cache only essentials, NOT app.html or index.html
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v3 - clearing old caches');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching essentials only');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Force immediate activation
        return self.skipWaiting();
      })
  );
});

// Activate event - DELETE ALL OLD CACHES
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v3 - nuking all old caches');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Taking control of all pages');
        return self.clients.claim();
      })
  );
});

// Fetch event - NETWORK FIRST for HTML files
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // For HTML files: ALWAYS fetch fresh from network
  if (event.request.mode === 'navigate' || 
      url.pathname.endsWith('.html') || 
      url.pathname === '/' || 
      url.pathname === '/app.html' ||
      url.pathname === '/index.html') {
    
    console.log('[SW] Network-first for:', url.pathname);
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Don't cache HTML responses
          return response;
        })
        .catch(() => {
          // If network fails, try cache as fallback
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // For other assets (icons, manifest): cache first
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200) {
            return response;
          }
          
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        });
      })
  );
});

// Listen for messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Received SKIP_WAITING message');
    self.skipWaiting();
  }
});
