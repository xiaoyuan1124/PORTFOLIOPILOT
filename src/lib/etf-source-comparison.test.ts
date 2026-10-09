import { describe, expect, it } from "vitest";
import type { CompanyExposure } from "./etf-lookthrough";
import { compareCompanyEtfSources } from "./etf-source-comparison";

const company: CompanyExposure = {
  market: "TW",
  symbol: "2330",
  name: "台積電",
  sector: "半導體",
  directValueTwd: 1000,
  implicitValueTwd: 900,
  totalValueTwd: 1900,
  portfolioPct: 25,
  contributions: [
    { etfMarket: "TW", etfSymbol: "00935", etfName: "野村臺灣新科技50", valueTwd: 100, weightPct: 20, asOf: "2026-10-08", sourceName: "野村", sourceUrl: "https://example.org/00935" },
    { etfMarket: "TW", etfSymbol: "009816", etfName: "凱基台灣TOP50", valueTwd: 600, weightPct: 30, asOf: "2026-10-08", sourceName: "凱基", sourceUrl: "https://example.org/009816" },
    { etfMarket: "TW", etfSymbol: "00935", etfName: "野村臺灣新科技50", valueTwd: 200, weightPct: 20, asOf: "2026-10-08", sourceName: "野村", sourceUrl: "https://example.org/00935" }
  ]
};

describe("cross-ETF underlying company comparison", () => {
  it("aggregates lots of the same ETF without reporting fake cross-fund overlap", () => {
    const result = compareCompanyEtfSources(company);
    expect(result.distinctEtfCount).toBe(2);
    expect(result.funds.map((row) => row.etfSymbol)).toEqual(["009816", "00935"]);
    expect(result.funds[1]?.valueTwd).toBe(300);
    expect(result.funds[0]?.etfValueSharePct).toBeCloseTo(600 / 900 * 100);
    expect(result.etfTotalValueTwd).toBe(900);
    expect(result.totalIdentifiedValueTwd).toBe(1900);
    expect(company.contributions).toHaveLength(3);
  });

  it("keeps direct-only holdings separate from ETF-implied exposure", () => {
    const directOnly = { ...company, implicitValueTwd: 0, totalValueTwd: 1000, contributions: [] };
    const result = compareCompanyEtfSources(directOnly);
    expect(result.distinctEtfCount).toBe(0);
    expect(result.funds).toEqual([]);
    expect(result.etfTotalValueTwd).toBe(0);
    expect(result.totalIdentifiedValueTwd).toBe(1000);
  });

  it("uses the market and symbol together to avoid conflating Taiwan and US tickers", () => {
    const duplicate = { ...company, contributions: [
      { ...company.contributions[0]!, valueTwd: 100 },
      { ...company.contributions[1]!, etfSymbol: "00935", etfMarket: "US" as const, valueTwd: 200 }
    ] };
    const result = compareCompanyEtfSources(duplicate);
    expect(result.distinctEtfCount).toBe(2);
    expect(result.funds.map((row) => row.sourceKey).sort()).toEqual(["TW:00935", "US:00935"].sort());
  });
});
