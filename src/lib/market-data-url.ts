import { Capacitor } from "@capacitor/core";

// Public, read-only daily market files. Portfolio holdings never leave the device.
const PUBLIC_PAGES = "https://xiaoyuan1124.github.io/PORTFOLIOPILOT";
const PUBLIC_RAW = "https://raw.githubusercontent.com/xiaoyuan1124/PORTFOLIOPILOT/main/public";
const OFFLINE_HEADER = "x-portfoliopilot-data-cache";

export async function fetchMarketDataset(path: string): Promise<Response> {
  if (!/^[-a-zA-Z0-9_/]+\.json$/.test(path) || path.includes("..")) {
    throw new Error("Invalid market dataset path");
  }
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const query = "?ts=" + Date.now();
  const bundled = () => fetch(base + "/data/" + path + query, { cache: "no-store" });
  if (!Capacitor.isNativePlatform()) return bundled();

  // Native builds carry frozen assets. Prefer the main-branch daily cache: Pages deploys can lag commits.
  for (const url of [
    PUBLIC_RAW + "/data/" + path + query,
    PUBLIC_PAGES + "/data/" + path + query
  ]) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      // A GitHub Pages error page can return HTTP 200 HTML; do not pass it off as JSON.
      // Consume only a clone so the existing per-dataset schema validation remains authoritative.
      const contentType = response.headers.get("content-type") ?? "";
      if (!/json|text\/plain|octet-stream/i.test(contentType)) continue;
      const payload = await response.clone().json().catch(() => null);
      if (payload && typeof payload === "object" && !Array.isArray(payload)) return response;
    } catch {
      // Offline or network-restricted: continue to the next public source.
    }
  }

  const response = await bundled();
  if (!response.ok) return response;
  const headers = new Headers(response.headers);
  headers.set(OFFLINE_HEADER, "offline");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
