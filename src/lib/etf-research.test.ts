import { describe, expect, it } from "vitest";
import type { EtfComposition, Holding } from "./types";
import type { TwQuoteCache } from "./market-data";
import { analyzeEtf } from "./etf-research";

const composition: EtfComposition = {
  id: "etf-1",
  etfMarket: "TW",
  etfSymbol: "00999",
  etfName: "測試 ETF",
  asOf: "2026-10-01",
  sourceName: "issuer",
  sourceUrl: "https://example.com",
  sourceType: "official_issuer",
  constituents: [
    { market: "TW", symbol: "2330", name: "台積電", weightPct: 40, sector: "半導體" },
    { market: "TW", symbol: "2317", name: "鴻海", weightPct: 25, sector: "電子" },
    { market: "TW", symbol: "2454", name: "聯發科", weightPct: 15, sector: "半導體" },
    { market: "US", symbol: "AAPL", name: "Apple", weightPct: 10, sector: "科技" }
  ]
};

const holdings: Holding[] = [
  {
    id: "etf",
    symbol: "00999",
    name: "測試 ETF",
    market: "TW",
    type: "etf",
    quantity: 10,
    price: 100,
    averageCost: 90,
    currency: "TWD",
    sector: "ETF",
    account: "券商A"
  },
  {
    id: "stock",
    symbol: "2330",
    name: "台積電",
    market: "TW",
    type: "stock",
    quantity: 1,
    price: 1000,
    averageCost: 900,
    currency: "TWD",
    sector: "半導體",
    account: "券商A"
  }
];

const quotes: TwQuoteCache = {
  generatedAt: "2026-10-01T10:00:00.000Z",
  sources: [],
  quotes: [
    { code: "2330", name: "台積電", market: "TWSE", close: 1000, change: -20, changePct: -1.9607843137, date: "2026-10-01" },
    { code: "2317", name: "鴻海", market: "TWSE", close: 220, change: 4, changePct: 1.8518518519, date: "2026-10-01" },
    { code: "2454", name: "聯發科", market: "TWSE", close: 1300, change: 0, changePct: 0, date: "2026-09-30" }
  ]
};

describe("ETF research attribution", () => {
  it("calculates concentration, sector exposure and portfolio overlap", () => {
    const result = analyzeEtf(composition, holdings, quotes, 32);

    expect(result.compositionCoveragePct).toBe(90);
    expect(result.constituentCount).toBe(4);
    expect(result.top1WeightPct).toBe(40);
    expect(result.top5WeightPct).toBe(90);
    expect(result.top10WeightPct).toBe(90);
    expect(result.hhi).toBe(40 ** 2 + 25 ** 2 + 15 ** 2 + 10 ** 2);
    expect(result.effectiveHoldingCount).toBeCloseTo(10000 / result.hhi, 8);
    expect(result.topSector).toEqual({ sector: "半導體", weightPct: 55 });
    expect(result.directPortfolioOverlapWeightPct).toBe(40);
    expect(result.directPortfolioOverlapSymbols).toEqual(["2330"]);
    expect(result.heldEtfValueTwd).toBe(1000);
  });

  it("uses only same-latest-date uniquely matched Taiwan constituents for attribution", () => {
    const result = analyzeEtf(composition, holdings, quotes, 32);

    expect(result.attributionDate).toBe("2026-10-01");
    expect(result.attributionCoveredWeightPct).toBe(65);
    expect(result.attributionUnresolvedWeightPct).toBe(25);
    expect(result.rows.map((row) => row.symbol)).toEqual(["2330", "2317"]);
    expect(result.rows[0]?.contributionPctPoints).toBeCloseTo(40 * -1.9607843137 / 100, 8);
    expect(result.rows[1]?.contributionPctPoints).toBeCloseTo(25 * 1.8518518519 / 100, 8);
    expect(result.estimatedEtfReturnPct).toBeCloseTo(
      (40 * -1.9607843137 + 25 * 1.8518518519) / 100,
      8
    );
  });

  it("does not guess ambiguous quote venues", () => {
    const ambiguous: TwQuoteCache = {
      ...quotes,
      quotes: [
        ...quotes.quotes,
        { code: "2330", name: "duplicate", market: "TPEx", close: 10, change: 1, changePct: 11.1111111111, date: "2026-10-01" }
      ]
    };

    const result = analyzeEtf(composition, holdings, ambiguous, 32);
    expect(result.rows.some((row) => row.symbol === "2330")).toBe(false);
    expect(result.attributionCoveredWeightPct).toBe(25);
  });

  it("turns percentage-point contribution into estimated holding impact", () => {
    const result = analyzeEtf(composition, holdings, quotes, 32);
    const tsmc = result.rows.find((row) => row.symbol === "2330");

    expect(tsmc?.estimatedHoldingImpactTwd).toBeCloseTo(
      1000 * (40 * -1.9607843137 / 100) / 100,
      8
    );
  });
});
