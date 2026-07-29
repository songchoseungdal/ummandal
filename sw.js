/* 엄만달 서비스 워커 — 전 파일 캐시로 오프라인 동작.
   CACHE 버전은 이 파일에 직접 적는다(js/version.js와 같은 커밋에서 함께 올릴 것) —
   SW 갱신 감지는 본체 바이트 변경만이 전 브라우저에서 보장되기 때문(2026-07-29). */
var CACHE = 'ummandal-v7-7-0';
var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/vendor/xlsx.full.min.js',
  './js/holidays.js',
  './js/engine.js',
  './js/engine2.js',
  './js/store.js',
  './js/vendor/supabase.js',
  './js/version.js',
  './js/config.js',
  './js/cloud.js',
  './js/telemetry.js',
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
  /* cache:'reload' — HTTP 캐시(GitHub Pages max-age=600)의 낡은 사본이 새 버전 캐시에
     섞이지 않게 항상 네트워크에서 새로 받는다(버전 태깅 오염 방지, 2026-07-29) */
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
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
