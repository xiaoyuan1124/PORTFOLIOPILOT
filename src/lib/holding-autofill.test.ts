import { describe, expect, it } from "vitest";
import type { TwQuoteCache } from "./market-data";
import type { RevenueCache } from "./revenue-data";
import {
  buildHoldingLookupCatalog,
  findExactHoldingLookupCandidate,
  searchHoldingLookupCatalog
} from "./holding-autofill";

const quotes: TwQuoteCache = {
  generatedAt: "2026-09-29T00:00:00.000Z",
  sources: [],
  quotes: [
    { code: "2330", name: "台積電", market: "TWSE", close: 1250, date: "2026-09-29" },
    { code: "00935", name: "野村臺灣新科技50", market: "TWSE", close: 32.5, date: "2026-09-29" },
    { code: "6488", name: "環球晶", market: "TPEx", close: 445, date: "2026-09-29" }
  ]
};

const revenue: RevenueCache = {
  generatedAt: "2026-09-29T00:00:00.000Z",
  sources: [],
  rows: [
    {
      code: "2330",
      name: "台積電",
      market: "TWSE",
      industry: "半導體業",
      period: "2026-08",
      revenue: 100,
      lastYearRevenue: 80,
      momPct: 1,
      yoyPct: 25,
      cumulativeRevenue: 500,
      cumulativeYoyPct: 20
    },
    {
      code: "6488",
      name: "環球晶圓股份有限公司",
      market: "TPEx",
      industry: "半導體業",
      period: "2026-08",
      revenue: 50,
      lastYearRevenue: 45,
      momPct: 2,
      yoyPct: 11,
      cumulativeRevenue: 300,
      cumulativeYoyPct: 9
    }
  ]
};

describe("holding autofill catalog", () => {
  it("joins official quote and revenue metadata for stocks", () => {
    const catalog = buildHoldingLookupCatalog(quotes, revenue);
    const tsmc = catalog.find((item) => item.code === "2330");

    expect(tsmc).toEqual({
      code: "2330",
      name: "台積電",
      venue: "TWSE",
      close: 1250,
      date: "2026-09-29",
      industry: "半導體業",
      type: "stock"
    });
  });

  it("recognizes Taiwan 00-series quote-only products as ETFs", () => {
    const catalog = buildHoldingLookupCatalog(quotes, revenue);
    const etf = catalog.find((item) => item.code === "00935");

    expect(etf?.type).toBe("etf");
    expect(etf?.industry).toBe("ETF");
  });

  it("searches by either code or name and exact-matches one field", () => {
    const catalog = buildHoldingLookupCatalog(quotes, revenue);

    expect(searchHoldingLookupCatalog(catalog, "233").map((item) => item.code)).toEqual(["2330"]);
    expect(searchHoldingLookupCatalog(catalog, "環球").map((item) => item.code)).toEqual(["6488"]);
    expect(findExactHoldingLookupCandidate(catalog, "symbol", "2330")?.close).toBe(1250);
    expect(findExactHoldingLookupCandidate(catalog, "name", "環球晶")?.code).toBe("6488");
  });
});
