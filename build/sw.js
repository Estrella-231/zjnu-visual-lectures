/* ============================================================================
   Service Worker（build/sw.js → 构建时复制到 viz/）
   ----------------------------------------------------------------------------
   离线缓存：network-first（优先拿最新的，断网回落缓存）
   → 既保证内容更新后手机上立刻看到新版本，又保证没网时能翻已访问过的页面。

   缓存范围：SW 放在 viz/ 下，scope 即 /viz/，只管可视化页面，
             **不会**碰到 docs/ 里的教材 PDF。
   ========================================================================== */
'use strict';

const CACHE = 'txyl-viz-v1';
const CORE = [
  './00_学习入口.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(CORE).catch(function () { }); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then(function (res) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () { });
        return res;
      })
      .catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./00_学习入口.html');
        });
      })
  );
});
