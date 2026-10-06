import { describe, expect, it } from "vitest";
import type { InstitutionalCache } from "./institutional-data";
import type { QuarterlyMarginCache } from "./quarterly-financials";
import type { RevenueHistoryCache } from "./revenue-history";
import { defaultStrategyGateConfig, evaluateOfficialStrategy } from "./strategy-gates";

function revenueFor(code: string, name: string, market: "TWSE" | "TPEx", industry: string): RevenueHistoryCache["rows"] {
  return [
    { code, name, market, industry, period: "2026-08", revenue: 130, previousMonthRevenue: 120, lastYearRevenue: 100, momPct: 8, yoyPct: 30, cumulativeRevenue: 300, lastYearCumulativeRevenue: 240, cumulativeYoyPct: 25, note: "" },
    { code, name, market, industry, period: "2026-07", revenue: 125, previousMonthRevenue: 115, lastYearRevenue: 100, momPct: 8, yoyPct: 25, cumulativeRevenue: 250, lastYearCumulativeRevenue: 205, cumulativeYoyPct: 22, note: "" },
    { code, name, market, industry, period: "2026-06", revenue: 121, previousMonthRevenue: 110, lastYearRevenue: 100, momPct: 10, yoyPct: 21, cumulativeRevenue: 200, lastYearCumulativeRevenue: 165, cumulativeYoyPct: 21, note: "" }
  ];
}

const revenue: RevenueHistoryCache = {
  generatedAt: "2026-09-27T00:00:00.000Z",
  periods: ["2026-08", "2026-07", "2026-06"],
  sources: [],
  rows: revenueFor("2330", "台積電", "TWSE", "半導體業")
};

const institutional: InstitutionalCache = {
  generatedAt: "2026-09-27T00:00:00.000Z",
  tradingDates: Array.from({ length: 10 }, (_, index) => `2026-09-${String(15 + index).padStart(2, "0")}`),
  sources: [
    { name: "TWSE T86", urlTemplate: "https://www.twse.com.tw/rwd/zh/fund/T86?date=YYYYMMDD" }
  ],
  rows: [
    { code: "2330", name: "台積電", market: "TWSE", foreign10d: 100000, trust10d: 20000, observedDays: 10 }
  ]
};

function quarterly(margins = [30, 31, 32]): QuarterlyMarginCache {
  const periods = ["2025-Q4", "2026-Q1", "2026-Q2"];
  return {
    generatedAt: "2026-09-27T00:00:00.000Z",
    periods,
    sources: periods.map((period) => ({
      name: "MOPS 公開資訊觀測站－綜合損益表",
      market: "TWSE" as const,
      period,
      url: "https://mopsov.twse.com.tw/mops/web/ajax_t163sb04",
      method: "POST" as const,
      fetchedAt: "2026-09-27T00:00:00.000Z",
      generalRows: 800,
      notApplicableRows: 50
    })),
    rows: periods.map((period, index) => ({
      code: "2330",
      name: "台積電",
      market: "TWSE" as const,
      period,
      revenue: 100 + index * 10,
      operatingCost: 70,
      grossProfit: 30 + index * 5,
      grossMarginPct: margins[index]!,
      basis: index === 1 ? "Q1 cumulative statement equals the single quarter" : "cumulative difference"
    })),
    notApplicable: []
  };
}

describe("official four-gate scanner", () => {
  it("passes only when revenue, gross margin, foreign and trust gates all pass", () => {
    const result = evaluateOfficialStrategy(revenue, institutional, quarterly())[0];
    expect(result?.overallStatus).toBe("pass");
    expect(result?.passedGateCount).toBe(4);
    expect(result?.grossMarginGate.values.map((row) => row.grossMarginPct)).toEqual([30, 31, 32]);
  });

  it("fails when gross margin is not strictly improving", () => {
    const result = evaluateOfficialStrategy(revenue, institutional, quarterly([30, 30, 32]))[0];
    expect(result?.overallStatus).toBe("fail");
    expect(result?.grossMarginGate.status).toBe("fail");
  });

  it("returns insufficient when a required official quarter is missing and no gate has failed", () => {
    const cache = quarterly();
    cache.rows = cache.rows.filter((row) => row.period !== "2026-Q1");
    const result = evaluateOfficialStrategy(revenue, institutional, cache)[0];
    expect(result?.overallStatus).toBe("insufficient");
    expect(result?.grossMarginGate.status).toBe("insufficient");
  });

  it("marks special MOPS statement families not applicable instead of forcing a gross-margin rule", () => {
    const financeRevenue: RevenueHistoryCache = {
      ...revenue,
      rows: revenueFor("2881", "富邦金", "TWSE", "金融保險業")
    };
    const financeInstitutional: InstitutionalCache = {
      ...institutional,
      rows: [{ code: "2881", name: "富邦金", market: "TWSE", foreign10d: 100, trust10d: 100, observedDays: 10 }]
    };
    const cache: QuarterlyMarginCache = {
      ...quarterly(),
      rows: [],
      notApplicable: [{
        code: "2881",
        name: "富邦金",
        market: "TWSE",
        periods: ["2025-Q4", "2026-Q1", "2026-Q2"],
        reason: "MOPS 特殊產業損益表沒有營業毛利欄位。"
      }]
    };
    const result = evaluateOfficialStrategy(financeRevenue, financeInstitutional, cache)[0];
    expect(result?.overallStatus).toBe("not_applicable");
    expect(result?.grossMarginGate.status).toBe("not_applicable");
  });

  it("keeps a definitive failed gate as fail even if another gate is missing", () => {
    const failedInstitutional: InstitutionalCache = {
      ...institutional,
      rows: [{ ...institutional.rows[0]!, foreign10d: -1 }]
    };
    const cache = quarterly();
    cache.rows = cache.rows.filter((row) => row.period !== "2026-Q1");
    const result = evaluateOfficialStrategy(revenue, failedInstitutional, cache)[0];
    expect(result?.overallStatus).toBe("fail");
    expect(result?.foreignGate.status).toBe("fail");
    expect(result?.grossMarginGate.status).toBe("insufficient");
  });


  it("preserves the original scanner thresholds as defaults", () => {
    expect(defaultStrategyGateConfig).toEqual({
      revenueYoyMinPct: 20,
      foreignNet10dMin: 0,
      trustNet10dMin: 0
    });
    expect(evaluateOfficialStrategy(revenue, institutional, quarterly())[0]?.overallStatus).toBe("pass");
  });

  it("re-evaluates official gates when the user raises scanner thresholds", () => {
    const stricterRevenue = evaluateOfficialStrategy(revenue, institutional, quarterly(), {
      revenueYoyMinPct: 25,
      foreignNet10dMin: 0,
      trustNet10dMin: 0
    })[0];
    expect(stricterRevenue?.revenueGate.status).toBe("fail");
    expect(stricterRevenue?.overallStatus).toBe("fail");

    const stricterForeign = evaluateOfficialStrategy(revenue, institutional, quarterly(), {
      revenueYoyMinPct: 20,
      foreignNet10dMin: 100000,
      trustNet10dMin: 10000
    })[0];
    expect(stricterForeign?.foreignGate.status).toBe("fail");
    expect(stricterForeign?.trustGate.status).toBe("pass");
  });
});
