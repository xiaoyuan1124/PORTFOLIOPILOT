import { describe, expect, it } from "vitest";
import type { RevenueHistoryCache } from "./revenue-history";
import type { InstitutionalCache } from "./institutional-data";
import { evaluatePreGrossMarginStrategy } from "./strategy-gates";

const revenue: RevenueHistoryCache = {
  generatedAt: "2026-09-27T00:00:00.000Z",
  periods: ["2026-08", "2026-07", "2026-06"],
  sources: [],
  rows: [
    { code:"2330", name:"台積電", market:"TWSE", industry:"半導體", period:"2026-08", revenue:130, previousMonthRevenue:120, lastYearRevenue:100, momPct:8, yoyPct:30, cumulativeRevenue:300, lastYearCumulativeRevenue:240, cumulativeYoyPct:25, note:"" },
    { code:"2330", name:"台積電", market:"TWSE", industry:"半導體", period:"2026-07", revenue:125, previousMonthRevenue:115, lastYearRevenue:100, momPct:8, yoyPct:25, cumulativeRevenue:250, lastYearCumulativeRevenue:205, cumulativeYoyPct:22, note:"" },
    { code:"2330", name:"台積電", market:"TWSE", industry:"半導體", period:"2026-06", revenue:121, previousMonthRevenue:110, lastYearRevenue:100, momPct:10, yoyPct:21, cumulativeRevenue:200, lastYearCumulativeRevenue:165, cumulativeYoyPct:21, note:"" }
  ]
};

const institutional: InstitutionalCache = {
  generatedAt: "2026-09-27T00:00:00.000Z",
  tradingDates: Array.from({ length: 10 }, (_, index) => `2026-09-${String(24-index).padStart(2,"0")}`),
  sources: [],
  rows: [
    { code:"2330", name:"台積電", market:"TWSE", foreign10d:100000, trust10d:20000, observedDays:10 }
  ]
};

describe("pre-gross-margin strategy gates", () => {
  it("requires revenue, foreign, and trust gates to all pass", () => {
    const result = evaluatePreGrossMarginStrategy(revenue, institutional)[0];
    expect(result?.revenuePass).toBe(true);
    expect(result?.foreignPass).toBe(true);
    expect(result?.trustPass).toBe(true);
    expect(result?.threeOfficialGatesPass).toBe(true);
  });

  it("fails when one institutional direction is not net-buy", () => {
    const changed: InstitutionalCache = {
      ...institutional,
      rows: [{ ...institutional.rows[0]!, trust10d: -1 }]
    };
    expect(evaluatePreGrossMarginStrategy(revenue, changed)[0]?.threeOfficialGatesPass).toBe(false);
  });
});
