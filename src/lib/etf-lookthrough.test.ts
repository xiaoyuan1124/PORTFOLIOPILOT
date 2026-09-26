import { describe, expect, it } from "vitest";
import { calculateEtfLookThrough } from "./etf-lookthrough";
import type { EtfComposition, Holding } from "./types";

const holdings: Holding[] = [
  { id: "tw-stock", symbol: "2330", name: "台積電", market: "TW", type: "stock", quantity: 1, price: 1000, averageCost: 900, currency: "TWD", sector: "半導體" },
  { id: "tw-etf", symbol: "009999", name: "測試台股 ETF", market: "TW", type: "etf", quantity: 10, price: 100, averageCost: 90, currency: "TWD", sector: "台灣大型股" },
  { id: "us-stock", symbol: "NVDA", name: "NVIDIA", market: "US", type: "stock", quantity: 1, price: 100, averageCost: 80, currency: "USD", sector: "半導體" },
  { id: "us-etf", symbol: "ETFUS", name: "測試美股 ETF", market: "US", type: "etf", quantity: 1, price: 100, averageCost: 90, currency: "USD", sector: "美國大型股" },
  { id: "cash", symbol: "CASH-TWD", name: "現金", market: "TW", type: "cash", quantity: 1, price: 1000, averageCost: 1000, currency: "TWD", sector: "現金" }
];

const compositions: EtfComposition[] = [
  {
    id: "tw",
    etfMarket: "TW",
    etfSymbol: "009999",
    etfName: "測試台股 ETF",
    asOf: "2026-09-26",
    sourceName: "官方投信",
    sourceUrl: "https://example.com/tw",
    sourceType: "official_issuer",
    constituents: [
      { market: "TW", symbol: "2330", name: "台積電", weightPct: 40, sector: "半導體" },
      { market: "TW", symbol: "2317", name: "鴻海", weightPct: 50, sector: "電子" }
    ]
  },
  {
    id: "us",
    etfMarket: "US",
    etfSymbol: "ETFUS",
    etfName: "測試美股 ETF",
    asOf: "2026-09-26",
    sourceName: "官方發行人",
    sourceUrl: "https://example.com/us",
    sourceType: "official_issuer",
    constituents: [
      { market: "US", symbol: "NVDA", name: "NVIDIA", weightPct: 25, sector: "半導體" },
      { market: "US", symbol: "MSFT", name: "Microsoft", weightPct: 75, sector: "軟體" }
    ]
  }
];

describe("ETF look-through exposure", () => {
  it("combines direct and ETF-implied exposure for the same company", () => {
    const result = calculateEtfLookThrough(holdings, compositions, 32);
    const tsmc = result.exposures.find((item) => item.symbol === "2330");
    const nvidia = result.exposures.find((item) => item.symbol === "NVDA");

    expect(tsmc?.directValueTwd).toBe(1000);
    expect(tsmc?.implicitValueTwd).toBe(400);
    expect(tsmc?.totalValueTwd).toBe(1400);

    expect(nvidia?.directValueTwd).toBe(3200);
    expect(nvidia?.implicitValueTwd).toBe(800);
    expect(nvidia?.totalValueTwd).toBe(4000);
  });

  it("keeps the uncovered ETF residual unresolved instead of normalizing weights to 100%", () => {
    const result = calculateEtfLookThrough(holdings, compositions, 32);
    const twEtf = result.etfs.find((item) => item.symbol === "009999");

    expect(twEtf?.compositionCoveragePct).toBe(90);
    expect(twEtf?.coveredValueTwd).toBe(900);
    expect(twEtf?.unresolvedValueTwd).toBe(100);
    expect(twEtf?.status).toBe("partial");
  });

  it("marks a held ETF without composition data as insufficient", () => {
    const result = calculateEtfLookThrough(
      [...holdings, { id: "missing", symbol: "MISS", name: "Missing ETF", market: "US", type: "etf", quantity: 1, price: 50, averageCost: 50, currency: "USD", sector: "ETF" }],
      compositions,
      32
    );
    const missing = result.etfs.find((item) => item.symbol === "MISS");

    expect(missing?.status).toBe("insufficient");
    expect(missing?.coveredValueTwd).toBe(0);
    expect(missing?.unresolvedValueTwd).toBe(1600);
  });

  it("uses full portfolio value including cash as the company exposure denominator", () => {
    const result = calculateEtfLookThrough(holdings, compositions, 32);
    const nvidia = result.exposures.find((item) => item.symbol === "NVDA");

    expect(result.portfolioValueTwd).toBe(8400);
    expect(nvidia?.portfolioPct).toBeCloseTo((4000 / 8400) * 100);
  });
});
