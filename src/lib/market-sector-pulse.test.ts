import { describe, expect, it } from "vitest";
import type { TwQuoteCache } from "./market-data";
import type { RevenueCache } from "./revenue-data";
import type { Holding } from "./types";
import {
  buildMarketSectorPulse,
  filterMarketSectorPulse,
  heldMarketIndustries
} from "./market-sector-pulse";

const revenue: RevenueCache = {
  generatedAt: "2026-09-30T00:00:00.000Z",
  sources: [],
  rows: [
    ...["1001","1002","1003","1004","1005"].map((code, index) => ({
      code,
      name: code,
      market: (index < 3 ? "TWSE" : "TPEx") as "TWSE" | "TPEx",
      industry: "半導體",
      period: "2026-08",
      revenue: 1,
      lastYearRevenue: 1,
      momPct: 0,
      yoyPct: 10,
      cumulativeRevenue: 1,
      cumulativeYoyPct: 1
    })),
    ...["2001","2002","2003","2004","2005"].map((code, index) => ({
      code,
      name: code,
      market: (index < 4 ? "TWSE" : "TPEx") as "TWSE" | "TPEx",
      industry: "航運",
      period: "2026-08",
      revenue: 1,
      lastYearRevenue: 1,
      momPct: 0,
      yoyPct: 10,
      cumulativeRevenue: 1,
      cumulativeYoyPct: 1
    }))
  ]
};

const quotes: TwQuoteCache = {
  generatedAt: "2026-09-30T00:00:00.000Z",
  sources: [],
  quotes: [
    { code: "1001", name: "A", market: "TWSE", close: 101, date: "2026-09-29", change: 1, changePct: 1 },
    { code: "1002", name: "B", market: "TWSE", close: 102, date: "2026-09-29", change: 2, changePct: 2 },
    { code: "1003", name: "C", market: "TWSE", close: 103, date: "2026-09-29", change: 3, changePct: 3 },
    { code: "1004", name: "D", market: "TPEx", close: 104, date: "2026-09-29", change: -1, changePct: -1 },
    { code: "1005", name: "E", market: "TPEx", close: 105, date: "2026-09-29", change: 0, changePct: 0 },
    { code: "2001", name: "F", market: "TWSE", close: 100, date: "2026-09-29", change: -4, changePct: -4 },
    { code: "2002", name: "G", market: "TWSE", close: 100, date: "2026-09-29", change: -3, changePct: -3 },
    { code: "2003", name: "H", market: "TWSE", close: 100, date: "2026-09-29", change: -2, changePct: -2 },
    { code: "2004", name: "I", market: "TWSE", close: 100, date: "2026-09-29", change: -1, changePct: -1 },
    { code: "2005", name: "J", market: "TPEx", close: 100, date: "2026-09-29", change: 1, changePct: 1 }
  ]
};

describe("market sector pulse", () => {
  it("aggregates official daily price changes by latest revenue industry", () => {
    const rows = buildMarketSectorPulse(quotes, revenue);
    expect(rows.map((row) => row.industry)).toEqual(["半導體", "航運"]);
    expect(rows[0]?.medianChangePct).toBe(1);
    expect(rows[0]?.upSharePct).toBe(60);
    expect(rows[0]?.downSharePct).toBe(20);
    expect(rows[0]?.flatSharePct).toBe(20);
    expect(rows[0]?.twseDate).toBe("2026-09-29");
    expect(rows[0]?.tpexDate).toBe("2026-09-29");
  });

  it("excludes quotes without comparable daily change", () => {
    const withExDate: TwQuoteCache = {
      ...quotes,
      quotes: quotes.quotes.map((row) => row.code === "1001" ? { ...row, change: null, changePct: null } : row)
    };
    const rows = buildMarketSectorPulse(withExDate, revenue);
    expect(rows.find((row) => row.industry === "半導體")).toBeUndefined();
  });

  it("resolves held industries with venue-aware identities", () => {
    const holdings: Holding[] = [{
      id: "held",
      symbol: "1004",
      name: "D",
      market: "TW",
      type: "stock",
      quantity: 1,
      price: 104,
      averageCost: 100,
      currency: "TWD",
      sector: "半導體",
      priceSource: "TPEx",
      priceAsOf: "2026-09-29"
    }];
    expect([...heldMarketIndustries(revenue, holdings)]).toEqual(["半導體"]);
  });

  it("filters to held industries without changing numeric ordering", () => {
    const rows = buildMarketSectorPulse(quotes, revenue);
    expect(filterMarketSectorPulse(rows, "", new Set(["航運"]), true).map((row) => row.industry)).toEqual(["航運"]);
  });
});
