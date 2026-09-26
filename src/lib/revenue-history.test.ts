import { describe, expect, it } from "vitest";
import { evaluateThreeMonthRevenueGate, type RevenueHistoryCache } from "./revenue-history";

const cache: RevenueHistoryCache = {
  generatedAt: "2026-09-27T00:00:00.000Z",
  periods: ["2026-08", "2026-07", "2026-06"],
  sources: [],
  rows: [
    { code:"AAA", name:"A", market:"TWSE", industry:"Test", period:"2026-08", revenue:130, previousMonthRevenue:120, lastYearRevenue:100, momPct:8, yoyPct:30, cumulativeRevenue:300, lastYearCumulativeRevenue:240, cumulativeYoyPct:25, note:"" },
    { code:"AAA", name:"A", market:"TWSE", industry:"Test", period:"2026-07", revenue:125, previousMonthRevenue:115, lastYearRevenue:100, momPct:8, yoyPct:25, cumulativeRevenue:250, lastYearCumulativeRevenue:205, cumulativeYoyPct:22, note:"" },
    { code:"AAA", name:"A", market:"TWSE", industry:"Test", period:"2026-06", revenue:121, previousMonthRevenue:110, lastYearRevenue:100, momPct:10, yoyPct:21, cumulativeRevenue:200, lastYearCumulativeRevenue:165, cumulativeYoyPct:21, note:"" },
    { code:"BBB", name:"B", market:"TPEx", industry:"Test", period:"2026-08", revenue:140, previousMonthRevenue:130, lastYearRevenue:100, momPct:7, yoyPct:40, cumulativeRevenue:310, lastYearCumulativeRevenue:250, cumulativeYoyPct:24, note:"" },
    { code:"BBB", name:"B", market:"TPEx", industry:"Test", period:"2026-07", revenue:119, previousMonthRevenue:110, lastYearRevenue:100, momPct:8, yoyPct:19, cumulativeRevenue:240, lastYearCumulativeRevenue:205, cumulativeYoyPct:17, note:"" },
    { code:"BBB", name:"B", market:"TPEx", industry:"Test", period:"2026-06", revenue:130, previousMonthRevenue:120, lastYearRevenue:100, momPct:8, yoyPct:30, cumulativeRevenue:200, lastYearCumulativeRevenue:170, cumulativeYoyPct:18, note:"" }
  ]
};

describe("official three-month revenue gate", () => {
  it("passes only companies with YoY > 20 in all three months", () => {
    const result = evaluateThreeMonthRevenueGate(cache);
    expect(result.find((item) => item.code === "AAA")?.pass).toBe(true);
    expect(result.find((item) => item.code === "AAA")?.minYoy).toBe(21);
    expect(result.find((item) => item.code === "BBB")?.pass).toBe(false);
  });

  it("requires all three expected periods", () => {
    const incomplete: RevenueHistoryCache = {
      ...cache,
      rows: cache.rows.filter((row) => !(row.code === "AAA" && row.period === "2026-06"))
    };
    expect(evaluateThreeMonthRevenueGate(incomplete).some((item) => item.code === "AAA")).toBe(false);
  });
});
