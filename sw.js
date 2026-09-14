/**
 * Minimal service worker: caches the app shell so it loads offline / installs cleanly
 * as a PWA. Data always comes fresh from the network (Google Apps Script) - only the
 * static app files are cached.
 */
// Bump this on every deploy that changes any cached file - the fetch handler below
// serves cache-first, so a stale CACHE_NAME means an already-installed app (like the
// one you've already got on this PC) keeps serving old JS/CSS forever until this
// changes, even though the underlying files on GitHub Pages have moved on.
const CACHE_NAME = 'spe-payroll-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/store.js',
  './js/session.js',
  './js/xlsxlite.js',
  './js/payrollEngine.js',
  './js/views/login.js',
  './js/views/dashboard.js',
  './js/views/settings.js',
  './js/views/employees.js',
  './js/views/categories.js',
  './js/views/entry.js',
  './js/views/deductions.js',
  './js/views/payroll.js',
  './js/views/grossup.js',
  './js/views/periodPicker.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never cache API calls to Apps Script - always go to network.
  if (url.hostname.includes('script.google.com')) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => cached);
    })
  );
});
