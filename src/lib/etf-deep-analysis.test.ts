import { describe, expect, it } from "vitest";
import type { EtfComposition } from "./types";
import type { ValuationCache } from "./valuation-data";
import type { RevenueHistoryCache } from "./revenue-history";
import type { QuarterlyMarginCache } from "./quarterly-financials";
import { analyzeEtfFundamentals, compareEtfOverlaps } from "./etf-deep-analysis";

const primary: EtfComposition = {
  id: "primary",
  etfMarket: "TW",
  etfSymbol: "00999",
  etfName: "主要 ETF",
  asOf: "2026-10-01",
  sourceName: "issuer",
  sourceUrl: "https://example.com/primary",
  sourceType: "official_issuer",
  constituents: [
    { market: "TW", symbol: "2330", name: "台積電", weightPct: 40, sector: "半導體" },
    { market: "TW", symbol: "2317", name: "鴻海", weightPct: 30, sector: "電子" },
    { market: "US", symbol: "AAPL", name: "Apple", weightPct: 20, sector: "科技" }
  ]
};

const valuations: ValuationCache = {
  generatedAt: "2026-10-01T08:00:00Z",
  sources: [],
  rows: [
    { code: "2330", name: "台積電", market: "TWSE", date: "2026-10-01", pe: 20, pb: 5, dividendYield: 1.5 },
    { code: "2317", name: "鴻海", market: "TWSE", date: "2026-10-01", pe: 10, pb: 2, dividendYield: 3 }
  ]
};

const revenueHistory: RevenueHistoryCache = {
  generatedAt: "2026-10-01T08:00:00Z",
  periods: ["2026-08", "2026-09"],
  sources: [],
  rows: [
    {
      code: "2330", name: "台積電", market: "TWSE", industry: "半導體", period: "2026-09",
      revenue: 100, previousMonthRevenue: 90, lastYearRevenue: 80, momPct: 11.1, yoyPct: 25,
      cumulativeRevenue: 900, lastYearCumulativeRevenue: 700, cumulativeYoyPct: 28, note: ""
    },
    {
      code: "2317", name: "鴻海", market: "TWSE", industry: "電子", period: "2026-09",
      revenue: 100, previousMonthRevenue: 100, lastYearRevenue: 95, momPct: 0, yoyPct: 10,
      cumulativeRevenue: 900, lastYearCumulativeRevenue: 800, cumulativeYoyPct: 12, note: ""
    }
  ]
};

const quarterlyMargins: QuarterlyMarginCache = {
  generatedAt: "2026-10-01T08:00:00Z",
  periods: ["2026-Q1", "2026-Q2"],
  sources: [],
  rows: [
    { code: "2330", name: "台積電", market: "TWSE", period: "2026-Q1", revenue: 100, operatingCost: 50, grossProfit: 50, grossMarginPct: 50, basis: "official" },
    { code: "2330", name: "台積電", market: "TWSE", period: "2026-Q2", revenue: 110, operatingCost: 52, grossProfit: 58, grossMarginPct: 52.7273, basis: "official" },
    { code: "2317", name: "鴻海", market: "TWSE", period: "2026-Q1", revenue: 100, operatingCost: 90, grossProfit: 10, grossMarginPct: 10, basis: "official" },
    { code: "2317", name: "鴻海", market: "TWSE", period: "2026-Q2", revenue: 105, operatingCost: 95, grossProfit: 10, grossMarginPct: 9.5238, basis: "official" }
  ],
  notApplicable: []
};

describe("ETF deep analysis", () => {
  it("aggregates valuation and constituent quality only across covered Taiwan weight", () => {
    const result = analyzeEtfFundamentals(primary, valuations, revenueHistory, quarterlyMargins);

    expect(result.weightedPe.coveredWeightPct).toBe(70);
    expect(result.weightedPe.value).toBeCloseTo((40 * 20 + 30 * 10) / 70, 8);
    expect(result.weightedPb.value).toBeCloseTo((40 * 5 + 30 * 2) / 70, 8);
    expect(result.weightedEarningsYieldPct.value).toBeCloseTo((40 * 5 + 30 * 10) / 70, 8);
    expect(result.weightedRevenueYoyPct.value).toBeCloseTo((40 * 25 + 30 * 10) / 70, 8);
    expect(result.weightedGrossMarginPct.coveredWeightPct).toBe(70);
    expect(result.grossMarginTrendCoveragePct).toBe(70);
    expect(result.grossMarginImprovingWeightPct).toBe(40);
  });

  it("does not guess a venue when the same code is ambiguous", () => {
    const ambiguous: ValuationCache = {
      ...valuations,
      rows: [
        ...valuations.rows,
        { code: "2330", name: "duplicate", market: "TPEx", date: "2026-10-01", pe: 99, pb: 9, dividendYield: 0 }
      ]
    };

    const result = analyzeEtfFundamentals(primary, ambiguous, revenueHistory, quarterlyMargins);
    expect(result.weightedPe.coveredWeightPct).toBe(30);
    expect(result.weightedPe.value).toBe(10);
  });

  it("calculates ETF-to-ETF overlap with min-weight methodology", () => {
    const other: EtfComposition = {
      ...primary,
      id: "other",
      etfSymbol: "00888",
      etfName: "比較 ETF",
      constituents: [
        { market: "TW", symbol: "2330", name: "台積電", weightPct: 25, sector: "半導體" },
        { market: "TW", symbol: "2317", name: "鴻海", weightPct: 35, sector: "電子" },
        { market: "TW", symbol: "2454", name: "聯發科", weightPct: 20, sector: "半導體" }
      ]
    };

    const [overlap] = compareEtfOverlaps(primary, [primary, other]);
    expect(overlap?.otherSymbol).toBe("00888");
    expect(overlap?.commonConstituentCount).toBe(2);
    expect(overlap?.overlapWeightPct).toBe(55);
    expect(overlap?.common.map((item) => item.symbol)).toEqual(["2317", "2330"]);
  });
});
