import { describe, expect, it } from "vitest";
import { calculateEtfLookThrough } from "./etf-lookthrough";
import { groupEtfCoverageByFund } from "./etf-coverage-presentation";
import type { EtfComposition, Holding } from "./types";

const composition: EtfComposition = {
  id: "tw-etf", etfMarket: "TW", etfSymbol: "009816",
  etfName: "凱基台灣TOP50", asOf: "2026-10-08",
  sourceName: "凱基投信", sourceUrl: "https://example.org/issuer",
  sourceType: "official_issuer",
  constituents: [
    { market: "TW", symbol: "2330", name: "台積電", sector: "半導體", weightPct: 60 },
    { market: "TW", symbol: "2317", name: "鴻海", sector: "電子", weightPct: 30 }
  ]
};

function holding(id: string, price: number): Holding {
  return {
    id, market: "TW", symbol: "009816", name: "凱基台灣TOP50",
    type: "etf", quantity: 1, price, averageCost: price,
    currency: "TWD", sector: "ETF"
  };
}

describe("ETF coverage display across accounts", () => {
  it("shows one ETF for multiple account positions while preserving values and original holdings", () => {
    const localHoldings = [holding("broker-1", 1000), holding("broker-2", 500)];
    const raw = calculateEtfLookThrough(localHoldings, [composition], 32);
    expect(raw.etfs).toHaveLength(2);
    const cards = groupEtfCoverageByFund(raw.etfs);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      symbol: "009816",
      valueTwd: 1500,
      compositionCoveragePct: 90,
      coveredValueTwd: 1350,
      unresolvedValueTwd: 150,
      status: "partial",
      asOf: "2026-10-08"
    });
    expect(raw.exposures.find((row) => row.symbol === "2330")?.implicitValueTwd).toBe(900);
    expect(localHoldings).toHaveLength(2);
    expect(raw.etfs).toHaveLength(2);
  });

  it("keeps different ETF market identities separate", () => {
    const raw = calculateEtfLookThrough([holding("a", 100)], [composition], 32).etfs;
    const mixed = groupEtfCoverageByFund([
      ...raw,
      { ...raw[0]!, market: "US", valueTwd: 3200 }
    ]);
    expect(mixed).toHaveLength(2);
  });

  it("fails closed on inconsistent issuer dates across otherwise identical ETF cards", () => {
    const rows = calculateEtfLookThrough([holding("a", 100)], [composition], 32).etfs;
    const current = rows[0]!;
    const inconsistent = { ...current, asOf: "2026-10-07" };
    const merged = groupEtfCoverageByFund([current, inconsistent]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("insufficient");
    expect(merged[0]?.sourceUrl).toBeNull();
    expect(merged[0]?.coveredValueTwd).toBe(180);
    expect(merged[0]?.unresolvedValueTwd).toBe(20);
  });

  it("handles an empty portfolio without inventing coverage", () => {
    expect(groupEtfCoverageByFund([])).toEqual([]);
  });
});
