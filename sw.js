/* 엄만달 서비스 워커 — 전 파일 캐시로 오프라인 동작 */
var CACHE = 'ummandal-v5-0-3';
var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/vendor/xlsx.full.min.js',
  './js/engine.js',
  './js/engine2.js',
  './js/store.js',
  './js/vendor/supabase.js',
  './js/config.js',
  './js/cloud.js',
  './js/importer.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('message', function (e) {
  if (e.data === 'GET_VERSION' && e.source) e.source.postMessage({ type: 'VERSION', version: CACHE });
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.ok && e.request.url.indexOf(self.location.origin) === 0) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      });
    })
  );
});
