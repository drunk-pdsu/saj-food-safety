/* 食安警戒 Service Worker：网络优先，离线回退缓存（保证在线时永远拿最新） */
var CACHE = 'shian-v1';
var ASSETS = ['/', '/index.html', '/app.js', '/manifest.json', '/icon.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async function () {
    try {
      var net = await fetch(req);
      var cache = await caches.open(CACHE);
      cache.put(req, net.clone());
      return net;
    } catch (err) {
      var cache2 = await caches.open(CACHE);
      var hit = await cache2.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') {
        var idx = await cache2.match('/index.html');
        if (idx) return idx;
      }
      throw err;
    }
  })());
});
