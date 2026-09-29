const CACHE = "portfoliopilot-v2";
const CACHE_PREFIX = "portfoliopilot-";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
    ])
  );
});

function canonicalDataRequest(request) {
  const url = new URL(request.url);
  return new Request(`${url.origin}${url.pathname}`, {
    method: "GET",
    headers: { accept: request.headers.get("accept") ?? "*/*" },
    credentials: "same-origin"
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/data/")) {
    const canonical = canonicalDataRequest(event.request);
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(canonical, copy)));
          }
          return response;
        })
        .catch(() => caches.match(canonical))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
