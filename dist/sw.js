/* REACH offline-first service worker.
   Strategy:
   - App shell + build assets: stale-while-revalidate
   - Map tiles: cache-first with a bounded LRU so previously viewed areas stay available offline
   - Navigation: network first, falling back to the cached shell
   - Everything else: network with cache fallback
*/

const VERSION = 'reach-v1';
const SHELL = `${VERSION}-shell`;
const TILES = `${VERSION}-tiles`;
const ASSETS = `${VERSION}-assets`;
const TILE_LIMIT = 900;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(['/', '/index.html', '/manifest.webmanifest', '/reach-mark.svg'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Only handle http(s)
  if (!url.protocol.startsWith('http')) return;

  // Map tiles: cache-first, bounded
  if (/basemaps\.cartocdn\.com|tile\.openstreetmap\.org/.test(url.hostname)) {
    event.respondWith(
      caches.open(TILES).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const res = await fetch(request);
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(request, res.clone());
            trimCache(TILES, TILE_LIMIT);
          }
          return res;
        } catch (err) {
          return new Response('', { status: 504, statusText: 'offline tile unavailable' });
        }
      }),
    );
    return;
  }

  // Navigations: shell fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(SHELL).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.open(ASSETS).then(async (cache) => {
      const hit = await cache.match(request);
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok && url.origin === self.location.origin) cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || network;
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'reach:caches') {
    Promise.all([caches.keys().then((k) => k.length)]).then(([n]) => {
      event.source?.postMessage({ type: 'reach:caches', caches: n });
    });
  }
});
