import { describe, expect, it } from "vitest";
import { buildCompanySnapshots, companySnapshotsForView } from "./company-snapshot";
import type { OfficialStrategyResult } from "./strategy-gates";

function strategy(market: "TWSE" | "TPEx", code: string): OfficialStrategyResult {
  return {
    code, name: `Company ${code}`, market, industry: "測試", overallStatus: "pass", passedGateCount: 4,
    revenueGate: { status: "pass", reason: "ok", dataAsOf: "2026-09", values: [], sources: [] },
    grossMarginGate: { status: "pass", reason: "ok", dataAsOf: "2026-Q2", values: [], sources: [] },
    foreignGate: { status: "pass", reason: "ok", dataAsOf: "2026-09-24", net10d: 10, observedDays: 10, sources: [] },
    trustGate: { status: "pass", reason: "ok", dataAsOf: "2026-09-24", net10d: 20, observedDays: 10, sources: [] }
  };
}

describe("company snapshot", () => {
  it("joins official caches by market plus code instead of code alone", () => {
    const snapshots = buildCompanySnapshots({
      quotes: {
        generatedAt: "2026-09-27T00:00:00Z", sources: [],
        quotes: [
          { code: "1234", name: "上市甲", market: "TWSE", close: 10, date: "2026-09-24" },
          { code: "1234", name: "上櫃甲", market: "TPEx", close: 20, date: "2026-09-24" }
        ]
      },
      revenue: {
        generatedAt: "2026-09-27T00:00:00Z", sources: [],
        rows: [
          { code: "1234", name: "上市甲", market: "TWSE", industry: "A", period: "2026-08", revenue: 100, lastYearRevenue: 80, momPct: 2, yoyPct: 25, cumulativeRevenue: 800, cumulativeYoyPct: 12 },
          { code: "1234", name: "上櫃甲", market: "TPEx", industry: "B", period: "2026-08", revenue: 200, lastYearRevenue: 100, momPct: 3, yoyPct: 100, cumulativeRevenue: 900, cumulativeYoyPct: 20 }
        ]
      },
      valuations: {
        generatedAt: "2026-09-27T00:00:00Z", sources: [],
        rows: [
          { code: "1234", name: "上市甲", market: "TWSE", date: "2026-09-24", pe: 10, pb: 1, dividendYield: 2 },
          { code: "1234", name: "上櫃甲", market: "TPEx", date: "2026-09-24", pe: 20, pb: 2, dividendYield: 3 }
        ]
      },
      strategies: [strategy("TWSE", "1234"), strategy("TPEx", "1234")]
    });

    expect(snapshots).toHaveLength(2);
    expect(snapshots.find((row) => row.market === "TWSE")?.quote?.close).toBe(10);
    expect(snapshots.find((row) => row.market === "TWSE")?.valuation?.pe).toBe(10);
    expect(snapshots.find((row) => row.market === "TPEx")?.quote?.close).toBe(20);
    expect(snapshots.find((row) => row.market === "TPEx")?.valuation?.pe).toBe(20);
    expect(snapshots.every((row) => row.strategy?.overallStatus === "pass")).toBe(true);
  });

  it("includes official quote-only ETFs without fabricating company fundamentals", () => {
    const snapshots = buildCompanySnapshots({
      quotes: {
        generatedAt: "2026-09-29T00:00:00Z", sources: [],
        quotes: [{ code: "00935", name: "野村臺灣新科技50", market: "TWSE", close: 32.5, date: "2026-09-29" }]
      },
      revenue: { generatedAt: "2026-09-29T00:00:00Z", sources: [], rows: [] },
      valuations: { generatedAt: "2026-09-29T00:00:00Z", sources: [], rows: [] },
      strategies: []
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.type).toBe("etf");
    expect(snapshots[0]?.industry).toBe("ETF");
    expect(snapshots[0]?.revenue).toBeNull();
    expect(snapshots[0]?.strategy).toBeNull();
    expect(snapshots[0]?.quote?.close).toBe(32.5);
  });

  it("puts held symbols first and can restrict the result to holdings", () => {
    const base = [
      { code: "1101", name: "台泥", market: "TWSE" as const, industry: "水泥", type: "stock" as const, quote: null, valuation: null, revenue: { code: "1101", name: "台泥", market: "TWSE" as const, industry: "水泥", period: "2026-08", revenue: 1, lastYearRevenue: null, momPct: null, yoyPct: null, cumulativeRevenue: null, cumulativeYoyPct: null }, strategy: null },
      { code: "2330", name: "台積電", market: "TWSE" as const, industry: "半導體", type: "stock" as const, quote: null, valuation: null, revenue: { code: "2330", name: "台積電", market: "TWSE" as const, industry: "半導體", period: "2026-08", revenue: 1, lastYearRevenue: null, momPct: null, yoyPct: null, cumulativeRevenue: null, cumulativeYoyPct: null }, strategy: null }
    ];
    const held = new Set(["2330"]);
    expect(companySnapshotsForView(base, "", held).map((row) => row.code)).toEqual(["2330", "1101"]);
    expect(companySnapshotsForView(base, "", held, true).map((row) => row.code)).toEqual(["2330"]);
    expect(companySnapshotsForView(base, "半導體", held).map((row) => row.code)).toEqual(["2330"]);
  });
});
