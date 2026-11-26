/* move2med driver: service worker.
 * Goal: the driver app opens and works with no signal. Only the app shell is cached; /api/* is never cached
 * (ride data lives encrypted in IndexedDB on the phone, not in the HTTP cache). */
const VERSION = "m2m-shell-v1";
const SHELL = ["/driver", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// The page tells us which files it loaded, so even the very first visit becomes available offline.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "cache" && Array.isArray(e.data.urls)) {
    e.waitUntil(
      caches.open(VERSION).then((c) =>
        Promise.all(e.data.urls.map((u) => fetch(u).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null))),
      ),
    );
  }
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Opening the driver app: network first (fresh code when online), cached shell when offline.
  if (req.mode === "navigate" && url.pathname.startsWith("/driver")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("/driver", copy));
          return res;
        })
        .catch(() => caches.match("/driver", { ignoreSearch: true })),
    );
    return;
  }

  // Hashed build files and icons never change: cache first, fill on first use.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
            return res;
          }),
      ),
    );
  }
});

// Android Chrome Background Sync: wake any open window so it uploads its queued events.
self.addEventListener("sync", (e) => {
  if (e.tag === "m2m-sync") {
    e.waitUntil(self.clients.matchAll({ includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage({ type: "sync" }))));
  }
});
