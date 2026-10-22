import { describe, expect, it } from "vitest";
import { emptyState, demoState } from "./demo-data";
import { buildPortfolioWidgetSnapshot } from "./widget-snapshot";
import type { AppState } from "./types";
import type { TwQuoteCache } from "./market-data";

const today = new Date("2026-10-23T02:00:00.000Z");
const ownState: AppState = {
  ...emptyState,
  holdings: [{
    id: "h1", symbol: "2330", name: "台積電", market: "TW", type: "stock",
    quantity: 2, price: 1100, averageCost: 900, currency: "TWD",
    sector: "半導體", priceSource: "TWSE", priceAsOf: "2026-10-22",
    account: "私人券商"
  }],
  watchlist: [{
    id: "w1", market: "TW", venue: "TWSE", symbol: "2330",
    name: "台積電", type: "stock", industry: "半導體", addedAt: "2026-10-01"
  }, {
    id: "w2", market: "TW", venue: "TPEx", symbol: "6488",
    name: "環球晶", type: "stock", industry: "電子", addedAt: "2026-10-01"
  }],
  journal: [{
    id: "j1", date: "2026-10-22", symbol: "2330",
    title: "私人筆記", thesis: "重要私人資訊", invalidation: "測試"
  }]
};
const cache: TwQuoteCache = {
  generatedAt: "2026-10-22T10:00:00.000Z",
  sources: [],
  quotes: [{
    code: "2330", name: "台積電", market: "TWSE", close: 1100,
    changePct: 1.5, date: "2026-10-22"
  }, {
    code: "6488", name: "環球晶", market: "TPEx", close: 420,
    changePct: -0.8, date: "2026-10-21"
  }]
};

describe("opt-in WidgetKit minimal snapshot", () => {
  it("uses official market-dated prices without exposing full personal state", () => {
    const snapshot = buildPortfolioWidgetSnapshot(ownState, cache, today);
    expect(snapshot).toEqual({
      version: 1, enabled: true, isDemo: false,
      generatedAt: "2026-10-23T02:00:00.000Z",
      totalTwd: 2200,
      gainPct: (2200 / 1800 - 1) * 100,
      quoteDate: "2026-10-22",
      watchlist: [{
        symbol: "2330", name: "台積電", close: 1100,
        changePct: 1.5, date: "2026-10-22"
      }, {
        symbol: "6488", name: "環球晶", close: 420,
        changePct: -0.8, date: "2026-10-21"
      }]
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("私人券商");
    expect(serialized).not.toContain("私人筆記");
    expect(serialized).not.toContain("important");
    expect(serialized).not.toContain("averageCost");
    expect(serialized).not.toContain("activities");
  });

  it("never publishes demo or an uninitialized install", () => {
    expect(buildPortfolioWidgetSnapshot(demoState, cache, today)).toBeNull();
    expect(buildPortfolioWidgetSnapshot(emptyState, cache, today)).toBeNull();
  });

  it("keeps a valid portfolio total but suppresses quotes when offline", () => {
    const result = buildPortfolioWidgetSnapshot(ownState, null, today);
    expect(result?.totalTwd).toBe(2200);
    expect(result?.watchlist).toEqual([]);
    expect(result?.quoteDate).toBe("2026-10-22");
  });

  it("rejects future, malformed, or duplicate same-venue prices", () => {
    const result = buildPortfolioWidgetSnapshot(ownState, {
      ...cache,
      quotes: [
        { ...cache.quotes[0]!, date: "2026-10-24" },
        { ...cache.quotes[1]!, date: "2026-02-30" }
      ]
    }, today);
    expect(result?.watchlist).toEqual([]);
    const duplicated = buildPortfolioWidgetSnapshot(ownState, {
      ...cache, quotes: [cache.quotes[0]!, cache.quotes[0]!]
    }, today);
    expect(duplicated?.watchlist).toEqual([]);
  });

  it("does not treat the same code on two different exchanges as ambiguous", () => {
    const dual = buildPortfolioWidgetSnapshot(ownState, {
      ...cache,
      quotes: [
        cache.quotes[0]!,
        { ...cache.quotes[0]!, market: "TPEx", close: 100 }
      ]
    }, today);
    expect(dual?.watchlist).toHaveLength(1);
    expect(dual?.watchlist[0]?.close).toBe(1100);
  });

  it("does not pass non-finite totals to native App Groups", () => {
    const result = buildPortfolioWidgetSnapshot({
      ...ownState, usdTwd: Number.POSITIVE_INFINITY
    }, cache, today);
    // The native contract refuses NaN/Infinity even if a corrupted AppState
    // bypassed its usual Zod checks.
    expect(result).toBeNull();
  });

  it("does not backfill an unknown daily percentage", () => {
    const result = buildPortfolioWidgetSnapshot(ownState, {
      ...cache, quotes: [{ ...cache.quotes[0]!, changePct: null }]
    }, today);
    expect(result?.watchlist[0]?.changePct).toBeNull();
  });
});
