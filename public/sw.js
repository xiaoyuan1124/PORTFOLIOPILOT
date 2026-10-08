const CACHE = "portfoliopilot-v3";
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

// A cached response is useful offline, but must never be mistaken for a
// freshly fetched official market dataset by the manual Sync action.
async function offlineDataFallback(request) {
  const cached = await caches.match(request);
  if (!cached) return undefined;
  const headers = new Headers(cached.headers);
  headers.set("x-portfoliopilot-data-cache", "offline");
  return new Response(cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers
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
        .catch(() => offlineDataFallback(canonical))
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
