// Same-origin Service Worker marks an offline fallback without changing
// the official dataset body or inventing a newer publication date.
export const OFFLINE_BUNDLE_CACHE_HEADER = "x-portfoliopilot-data-cache";

export function isOfflineBundleResponse(headers: Pick<Headers, "get">): boolean {
  return headers.get(OFFLINE_BUNDLE_CACHE_HEADER) === "offline";
}
