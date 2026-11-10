const CACHE_NAME = "dcds-shell-v4";
const CACHE_PREFIX = "dcds-";
const APP_SCOPE_PATH = new URL(self.registration.scope).pathname;
const OFFLINE_URL = new URL("./offline.html", self.location.href).href;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.mode !== "navigate" ||
    !url.pathname.startsWith(APP_SCOPE_PATH)
  ) return;

  event.respondWith(
    fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error())
  );
});
