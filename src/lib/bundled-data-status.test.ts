import { describe, expect, it } from "vitest";
import { isOfflineBundleResponse, OFFLINE_BUNDLE_CACHE_HEADER } from "./bundled-data-status";

describe("bundled official data response origin", () => {
  it("treats unmarked responses as network-fetched, not offline fallbacks", () => {
    expect(isOfflineBundleResponse(new Headers())).toBe(false);
    expect(isOfflineBundleResponse(new Headers({ [OFFLINE_BUNDLE_CACHE_HEADER]: "network" }))).toBe(false);
  });

  it("flags the explicit offline fallback header", () => {
    expect(isOfflineBundleResponse(new Headers({ [OFFLINE_BUNDLE_CACHE_HEADER]: "offline" }))).toBe(true);
  });
});
