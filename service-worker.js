const CACHE_NAME = "camino-journal-cache-v2";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys.map(key => (key !== CACHE_NAME ? caches.delete(key) : null))
        )
      )
      .then(() => self.clients.claim())
  );
});

// IMPORTANT: this app's whole job is to be the source of truth for the
// user's journal, which lives in localStorage on whatever copy of the page
// is currently running. If this service worker ever serves a STALE copy of
// index.html, the page's code can disagree with itself about where data is
// stored, and make it look like entries vanished even though nothing was
// actually deleted. To prevent that, navigation requests (the page itself)
// always try the network FIRST, and only fall back to the cached copy if
// the network is genuinely unavailable (e.g. offline). Other static assets
// (fonts, icons, etc.) can still use cache-first for speed, since being
// stale there is harmless.
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const isNavigation =
    event.request.mode === "navigate" ||
    (event.request.method === "GET" &&
      event.request.headers.get("accept")?.includes("text/html"));

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      return (
        cached ||
        fetch(event.request)
          .then(response => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
            return response;
          })
          .catch(() => caches.match("./index.html"))
      );
    })
  );
});
