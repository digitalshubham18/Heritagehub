/* HeritageHub staff service worker: lets the counter and parking pages open without a connection.
 * It caches the app shell (static assets) and the HTML of /staff/counter and /staff/parking after they've been opened once online.
 * It never caches API calls (the pages keep their own data snapshot in localStorage) and it clears itself when staff sign out. */
const VERSION = "hh-staff-v1", PAGES = ["/staff/counter", "/staff/parking"];
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener("message", (e) => { if (e.data === "clear") e.waitUntil(caches.delete(VERSION)); });
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/")) { // fingerprinted assets: cache first
    e.respondWith(caches.open(VERSION).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }))); return;
  }
  if (req.mode === "navigate" && PAGES.includes(url.pathname)) { // network first, fall back to the last copy
    e.respondWith(fetch(req).then((r) => { if (r.ok && !r.redirected) caches.open(VERSION).then((c) => c.put(req, r.clone())); return r; }).catch(async () => (await caches.match(req)) || new Response("<h1>Offline</h1><p>Open this page once while online, then it will work without a connection.</p>", { headers: { "Content-Type": "text/html" }, status: 503 })));
  }
});
