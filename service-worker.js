
const CACHE_NAME = 'pems-v14c-b2a-step3a-v1';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=b2a-step3a',
  './app.js?v=b2a-step3a',
  './manifest.json?v=b2a-step3a'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Google Sign-In dan Apps Script heartbeat selalu network.
  if (
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleusercontent.com')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return resp;
      })
      .catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))
  );
});
