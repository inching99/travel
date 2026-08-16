// 自驾路书 Service Worker — 缓存应用壳，离线可用（地图瓦片需联网）
const CACHE = 'roadbook-v4';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/app.css', './js/config.js', './js/db.js', './js/tencent.js',
  './js/planner.js', './js/schematic.js', './js/app.js', './js/map.js', './js/poster.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, {cache:'reload'})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // API/瓦片请求直连
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
