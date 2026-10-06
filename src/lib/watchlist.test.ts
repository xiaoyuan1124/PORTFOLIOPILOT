import { describe, expect, it } from "vitest";
import type { HoldingLookupCandidate } from "./holding-autofill";
import { addToWatchlist, removeFromWatchlist, watchlistContains, watchlistItemFromCandidate } from "./watchlist";

const candidate: HoldingLookupCandidate = {
  code: "2330",
  name: "台積電",
  venue: "TWSE",
  close: 1000,
  date: "2026-10-06",
  industry: "半導體",
  type: "stock"
};

describe("watchlist helpers", () => {
  it("creates a normalized local watchlist item", () => {
    expect(watchlistItemFromCandidate(candidate, "2026-10-06")).toEqual({
      id: "watch-TWSE-2330",
      market: "TW",
      venue: "TWSE",
      symbol: "2330",
      name: "台積電",
      type: "stock",
      industry: "半導體",
      addedAt: "2026-10-06"
    });
  });

  it("does not duplicate the same venue and symbol", () => {
    const once = addToWatchlist([], candidate, "2026-10-06");
    const twice = addToWatchlist(once, candidate, "2026-10-06");
    expect(twice).toHaveLength(1);
    expect(watchlistContains(twice, { venue: "TWSE", symbol: "2330" })).toBe(true);
  });

  it("removes only the requested security", () => {
    const other: HoldingLookupCandidate = {
      ...candidate,
      code: "2317",
      name: "鴻海"
    };
    const current = addToWatchlist(addToWatchlist([], candidate, "2026-10-06"), other, "2026-10-06");
    const next = removeFromWatchlist(current, { venue: "TWSE", symbol: "2330" });
    expect(next.map((item) => item.symbol)).toEqual(["2317"]);
  });
});
