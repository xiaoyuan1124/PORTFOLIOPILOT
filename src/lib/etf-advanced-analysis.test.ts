import { describe, expect, it } from "vitest";
import type { TwQuoteCache } from "./market-data";
import type { QuarterlyMarginCache } from "./quarterly-financials";
import type { RevenueHistoryCache } from "./revenue-history";
import type { EtfComposition } from "./types";
import type { ValuationCache } from "./valuation-data";
import {
  analyzeEtfAdvanced,
  compareEtfOverlap,
  overlapProductBand,
  sectorProductBand,
  singleHoldingProductBand,
  top10ProductBand
} from "./etf-advanced-analysis";

const selected: EtfComposition = {
  id: "selected-current",
  etfMarket: "TW",
  etfSymbol: "00999",
  etfName: "測試 ETF",
  asOf: "2026-10-01",
  sourceName: "issuer",
  sourceUrl: "https://example.com/current.csv",
  sourceType: "official_issuer",
  constituents: [
    { market: "TW", symbol: "2330", name: "台積電", weightPct: 40, sector: "半導體" },
    { market: "TW", symbol: "2317", name: "鴻海", weightPct: 25, sector: "電子" },
    { market: "TW", symbol: "2454", name: "聯發科", weightPct: 15, sector: "半導體" },
    { market: "US", symbol: "AAPL", name: "Apple", weightPct: 10, sector: "科技" }
  ]
};

const previous: EtfComposition = {
  ...selected,
  id: "selected-previous",
  asOf: "2026-09-01",
  sourceUrl: "https://example.com/previous.csv",
  constituents: [
    { market: "TW", symbol: "2330", name: "台積電", weightPct: 30, sector: "半導體" },
    { market: "TW", symbol: "2317", name: "鴻海", weightPct: 30, sector: "電子" },
    { market: "TW", symbol: "2454", name: "聯發科", weightPct: 20, sector: "半導體" },
    { market: "US", symbol: "AAPL", name: "Apple", weightPct: 10, sector: "科技" }
  ]
};

const other: EtfComposition = {
  id: "other",
  etfMarket: "TW",
  etfSymbol: "00888",
  etfName: "比較 ETF",
  asOf: "2026-09-30",
  sourceName: "issuer",
  sourceUrl: "https://example.com/other.csv",
  sourceType: "official_issuer",
  constituents: [
    { market: "TW", symbol: "2330", name: "台積電", weightPct: 35, sector: "半導體" },
    { market: "TW", symbol: "2317", name: "鴻海", weightPct: 10, sector: "電子" },
    { market: "TW", symbol: "3008", name: "大立光", weightPct: 20, sector: "電子" }
  ]
};

const quotes: TwQuoteCache = {
  generatedAt: "2026-10-01T09:00:00.000Z",
  sources: [],
  quotes: [
    { code: "00999", name: "測試 ETF", market: "TWSE", close: 20, change: -0.14, changePct: -0.7, date: "2026-10-01" },
    { code: "2330", name: "台積電", market: "TWSE", close: 1000, change: -20, changePct: -2, date: "2026-10-01" },
    { code: "2317", name: "鴻海", market: "TWSE", close: 220, change: 2.2, changePct: 1, date: "2026-10-01" },
    { code: "2454", name: "聯發科", market: "TWSE", close: 1300, change: 39, changePct: 3, date: "2026-09-30" }
  ]
};

const valuations: ValuationCache = {
  generatedAt: "2026-10-01T09:00:00.000Z",
  sources: [],
  rows: [
    { code: "2330", name: "台積電", market: "TWSE", date: "2026-10-01", pe: 20, pb: 5, dividendYield: 1 },
    { code: "2317", name: "鴻海", market: "TWSE", date: "2026-10-01", pe: 10, pb: 2, dividendYield: 4 }
  ]
};

const revenueHistory: RevenueHistoryCache = {
  generatedAt: "2026-09-10T00:00:00.000Z",
  periods: ["2026-06", "2026-07", "2026-08"],
  sources: [],
  rows: [
    { code: "2330", name: "台積電", market: "TWSE", industry: "半導體", period: "2026-08", revenue: 100, previousMonthRevenue: 90, lastYearRevenue: 70, momPct: 11, yoyPct: 30, cumulativeRevenue: 800, lastYearCumulativeRevenue: 650, cumulativeYoyPct: 23, note: "" },
    { code: "2317", name: "鴻海", market: "TWSE", industry: "電子", period: "2026-08", revenue: 100, previousMonthRevenue: 90, lastYearRevenue: 90, momPct: 11, yoyPct: 10, cumulativeRevenue: 800, lastYearCumulativeRevenue: 700, cumulativeYoyPct: 14, note: "" },
    { code: "2454", name: "聯發科", market: "TWSE", industry: "半導體", period: "2026-08", revenue: 100, previousMonthRevenue: 90, lastYearRevenue: 80, momPct: 11, yoyPct: 20, cumulativeRevenue: 800, lastYearCumulativeRevenue: 680, cumulativeYoyPct: 18, note: "" }
  ]
};

const quarterlyMargins: QuarterlyMarginCache = {
  generatedAt: "2026-08-20T00:00:00.000Z",
  periods: ["2025-Q4", "2026-Q1", "2026-Q2"],
  sources: [],
  notApplicable: [],
  rows: [
    { code: "2330", name: "台積電", market: "TWSE", period: "2026-Q1", revenue: 100, operatingCost: 47, grossProfit: 53, grossMarginPct: 53, basis: "official" },
    { code: "2330", name: "台積電", market: "TWSE", period: "2026-Q2", revenue: 100, operatingCost: 45, grossProfit: 55, grossMarginPct: 55, basis: "official" },
    { code: "2317", name: "鴻海", market: "TWSE", period: "2026-Q1", revenue: 100, operatingCost: 92, grossProfit: 8, grossMarginPct: 8, basis: "official" },
    { code: "2317", name: "鴻海", market: "TWSE", period: "2026-Q2", revenue: 100, operatingCost: 93, grossProfit: 7, grossMarginPct: 7, basis: "official" },
    { code: "2454", name: "聯發科", market: "TWSE", period: "2026-Q1", revenue: 100, operatingCost: 53, grossProfit: 47, grossMarginPct: 47, basis: "official" },
    { code: "2454", name: "聯發科", market: "TWSE", period: "2026-Q2", revenue: 100, operatingCost: 52, grossProfit: 48, grossMarginPct: 48, basis: "official" }
  ]
};

describe("advanced ETF analysis", () => {
  it("calculates composition changes and ETF overlap", () => {
    const result = analyzeEtfAdvanced(selected, [selected, previous, other], { quotes });
    expect(result.compositionCoveragePct).toBe(90);
    expect(result.top1WeightPct).toBe(40);
    expect(result.top10WeightPct).toBe(90);
    expect(result.previousCompositionAsOf).toBe("2026-09-01");
    expect(result.weightChanges[0]).toMatchObject({ symbol: "2330", changePctPoints: 10, changeType: "increased" });
    expect(result.overlapComparisons[0]).toMatchObject({ etfSymbol: "00888", overlapWeightPct: 45, sharedCount: 2 });
    expect(compareEtfOverlap(selected, other).topShared.map((row) => row.symbol)).toEqual(["2330", "2317"]);
  });

  it("detects additions, removals, increases and decreases between snapshots", () => {
    const current: EtfComposition = {
      ...selected,
      asOf: "2026-10-02",
      constituents: [
        { market: "TW", symbol: "2330", name: "台積電", weightPct: 42, sector: "半導體" },
        { market: "TW", symbol: "2454", name: "聯發科", weightPct: 12, sector: "半導體" },
        { market: "TW", symbol: "3008", name: "大立光", weightPct: 8, sector: "電子" }
      ]
    };
    const prior: EtfComposition = {
      ...selected,
      asOf: "2026-10-01",
      constituents: [
        { market: "TW", symbol: "2330", name: "台積電", weightPct: 40, sector: "半導體" },
        { market: "TW", symbol: "2454", name: "聯發科", weightPct: 15, sector: "半導體" },
        { market: "TW", symbol: "2317", name: "鴻海", weightPct: 10, sector: "電子" }
      ]
    };

    const result = analyzeEtfAdvanced(current, [current, prior], {});
    expect(result.previousCompositionAsOf).toBe("2026-10-01");
    expect(result.compositionChangeSummary).toEqual({
      added: 1,
      removed: 1,
      increased: 1,
      decreased: 1,
      unchanged: 0
    });
    expect(result.weightChanges.find((row) => row.symbol === "3008")?.changeType).toBe("added");
    expect(result.weightChanges.find((row) => row.symbol === "2317")?.changeType).toBe("removed");
    expect(result.weightChanges.find((row) => row.symbol === "2330")?.changeType).toBe("increased");
    expect(result.weightChanges.find((row) => row.symbol === "2454")?.changeType).toBe("decreased");
  });

  it("aggregates only covered official constituent fundamentals and valuations", () => {
    const result = analyzeEtfAdvanced(selected, [selected], { quotes, valuations, revenueHistory, quarterlyMargins });
    expect(result.revenueYoY.coveredWeightPct).toBe(80);
    expect(result.revenueYoY.value).toBeCloseTo(21.875, 8);
    expect(result.grossMargin.coveredWeightPct).toBe(80);
    expect(result.grossMarginImprovingSharePct).toBeCloseTo(68.75, 8);
    expect(result.weightedPe.coveredWeightPct).toBe(65);
    expect(result.weightedPe.value).toBeCloseTo((40 * 20 + 25 * 10) / 65, 8);
    expect(result.earningsYieldPct.value).toBeCloseTo((40 * 5 + 25 * 10) / 65, 8);
  });

  it("audits attribution coverage and reconciles against official ETF daily return", () => {
    const result = analyzeEtfAdvanced(selected, [selected], { quotes });
    expect(result.attributionDate).toBe("2026-10-01");
    expect(result.attributionCoveredWeightPct).toBe(65);
    expect(result.attributionUnresolvedImportedWeightPct).toBe(25);
    expect(result.attributionUnimportedWeightPct).toBe(10);
    expect(result.estimatedCoveredReturnPct).toBeCloseTo(-0.55, 8);
    expect(result.officialEtfDailyReturnPct).toBe(-0.7);
    expect(result.attributionResidualPctPoints).toBeCloseTo(-0.15, 8);
    expect(result.attributionExclusions.map((row) => [row.symbol, row.reason])).toEqual([
      ["2454", "different_trading_date"],
      ["AAPL", "unsupported_market"]
    ]);
  });

  it("never turns ambiguous quotes into a zero-return constituent", () => {
    const ambiguous: TwQuoteCache = {
      ...quotes,
      quotes: [...quotes.quotes, { code: "2330", name: "duplicate", market: "TPEx", close: 10, change: 1, changePct: 11, date: "2026-10-01" }]
    };
    const result = analyzeEtfAdvanced(selected, [selected], { quotes: ambiguous });
    expect(result.attributionCoveredWeightPct).toBe(25);
    expect(result.attributionExclusions.some((row) => row.symbol === "2330" && row.reason === "ambiguous_quote")).toBe(true);
  });

  it("uses the requested neutral product thresholds", () => {
    expect(singleHoldingProductBand(9.99)).toBe("low");
    expect(singleHoldingProductBand(10)).toBe("medium");
    expect(singleHoldingProductBand(20)).toBe("high");
    expect(singleHoldingProductBand(30.01)).toBe("very_high");
    expect(top10ProductBand(39.99)).toBe("low");
    expect(top10ProductBand(40)).toBe("medium");
    expect(top10ProductBand(60.01)).toBe("high");
    expect(sectorProductBand(50.01)).toBe("high");
    expect(overlapProductBand(70)).toBe("medium");
    expect(overlapProductBand(70.01)).toBe("high");
  });
});
