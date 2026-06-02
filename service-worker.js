/* Inkwell service worker — offline support with safe updates.
   Strategy:
   - HTML app shell (navigations, *.html): NETWORK-FIRST, so a new
     deploy is picked up immediately (no stale interface).
   - modules.json: NETWORK-FIRST (fresh lessons), cache fallback offline.
   - icons / static assets: CACHE-FIRST (fast), updated in background.
   Bump CACHE on every change so old caches are dropped on activate. */
const CACHE = "inkwell-v16";

const ASSETS = [
  "./",
  "./index.html",
  "./inkwell-ai.html",
  "./modules.json",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon-180.png",
  "./favicon-32.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHTML(req, url){
  return req.mode === "navigate"
      || (req.headers.get("accept")||"").includes("text/html")
      || url.pathname.endsWith(".html")
      || url.pathname.endsWith("/");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return; // let cross-origin (fonts, APIs) go straight to network

  // NETWORK-FIRST for the app shell and lessons (always get the latest)
  if (isHTML(req, url) || url.pathname.endsWith("modules.json")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html") || caches.match("./inkwell-ai.html")))
    );
    return;
  }

  // CACHE-FIRST for everything else (icons, manifest), refresh in background
  e.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached)
    )
  );
});

// Allow the page to tell a waiting SW to activate now.
self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });
