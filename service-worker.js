// ClarityText Service Worker - v7 (NUCLEAR CACHE CLEAR)
const CACHE_NAME = 'claritytext-v7';
const urlsToCache = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install event - FORCE IMMEDIATE ACTIVATION
self.addEventListener('install', (event) => {
  console.log('[SW v7] Installing - NUCLEAR CACHE CLEAR MODE');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW v7] Caching essentials');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW v7] Forcing immediate activation');
        return self.skipWaiting();
      })
  );
});

// Activate event - DELETE EVERYTHING
self.addEventListener('activate', (event) => {
  console.log('[SW v7] ACTIVATING - DELETING ALL OLD CACHES');
  event.waitUntil(
    Promise.all([
      // Delete all old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('[SW v7] Checking cache:', cacheName);
            if (cacheName !== CACHE_NAME) {
              console.log('[SW v7] DELETING old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control immediately
      self.clients.claim()
    ]).then(() => {
      console.log('[SW v7] All old caches deleted, now in control');
    })
  );
});

// Fetch event - NETWORK FIRST for ALL HTML
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // For ALL navigation and HTML requests: ALWAYS fetch fresh from network
  if (event.request.mode === 'navigate' || 
      url.pathname.endsWith('.html') || 
      url.pathname === '/' || 
      url.pathname === '/app.html' ||
      url.pathname === '/index.html') {
    
    console.log('[SW v7] Network-first for HTML:', url.pathname);
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // NEVER cache HTML responses
          return response;
        })
        .catch(() => {
          // If network fails, try cache as fallback
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // For manifest.json: ALWAYS fetch fresh (never cache)
  if (url.pathname.includes('manifest')) {
    console.log('[SW v7] Always fetching fresh manifest');
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  
  // For icons and other assets: cache-first strategy
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

// Listen for skip waiting messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW v7] Received SKIP_WAITING message');
    self.skipWaiting();
  }
});
