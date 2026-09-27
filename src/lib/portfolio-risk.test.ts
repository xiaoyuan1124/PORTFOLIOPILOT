import { describe, expect, it } from "vitest";
import { calculatePortfolioRisk } from "./portfolio-risk";
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
    sourceName: "Issuer",
    sourceUrl: "https://example.com/tw",
    sourceType: "user_import",
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
    sourceName: "Issuer",
    sourceUrl: "https://example.com/us",
    sourceType: "user_import",
    constituents: [
      { market: "US", symbol: "NVDA", name: "NVIDIA", weightPct: 25, sector: "半導體" },
      { market: "US", symbol: "MSFT", name: "Microsoft", weightPct: 75, sector: "軟體" }
    ]
  }
];

describe("portfolio risk", () => {
  it("builds company, sector and market exposure from direct plus ETF-implied holdings", () => {
    const result = calculatePortfolioRisk(holdings, compositions, 32);

    expect(result.portfolioValueTwd).toBe(9400);
    expect(result.cashValueTwd).toBe(1000);
    expect(result.resolvedCompanyValueTwd).toBe(8300);
    expect(result.unresolvedEtfValueTwd).toBe(100);
    expect(result.riskCoveragePct).toBeCloseTo((8300 / 8400) * 100);

    expect(result.largestCompany?.symbol).toBe("NVDA");
    expect(result.largestCompany?.totalValueTwd).toBe(4000);
    expect(result.largestSector?.label).toBe("半導體");
    expect(result.largestSector?.valueTwd).toBe(5400);

    expect(result.marketExposures.find((row) => row.key === "TW")?.valueTwd).toBe(1900);
    expect(result.marketExposures.find((row) => row.key === "US")?.valueTwd).toBe(6400);
  });

  it("uses full portfolio value for concentration percentages", () => {
    const result = calculatePortfolioRisk(holdings, compositions, 32);
    expect(result.largestCompany?.portfolioPct).toBeCloseTo((4000 / 9400) * 100);
    expect(result.top5CompanyPct).toBeCloseTo((8300 / 9400) * 100);
    expect(result.top3SectorPct).toBeCloseTo((8300 / 9400) * 100);
  });

  it("calculates HHI only across resolved company exposure", () => {
    const result = calculatePortfolioRisk(holdings, compositions, 32);
    const expected = (
      (4000 / 8300) ** 2 +
      (2400 / 8300) ** 2 +
      (1400 / 8300) ** 2 +
      (500 / 8300) ** 2
    ) * 10_000;
    expect(result.resolvedCompanyHhi).toBeCloseTo(expected);
    expect(result.effectiveCompanyCount).toBeCloseTo(10_000 / expected);
  });

  it("does not assign unresolved ETF value to a guessed sector or market", () => {
    const result = calculatePortfolioRisk(holdings, [], 32);
    expect(result.unresolvedEtfValueTwd).toBe(4200);
    expect(result.sectorExposures.reduce((sum, row) => sum + row.valueTwd, 0)).toBe(4200);
    expect(result.marketExposures.reduce((sum, row) => sum + row.valueTwd, 0)).toBe(4200);
    expect(result.riskCoveragePct).toBe(50);
  });
});
