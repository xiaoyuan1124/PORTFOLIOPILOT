import { describe, expect, it } from "vitest";
import { latestRevenuePeriod, revenueRowsForView, type RevenueCache } from "./revenue-data";

const cache: RevenueCache = {
  generatedAt: "2026-09-27T10:30:00.000Z",
  sources: [],
  rows: [
    { code: "2330", name: "台積電", market: "TWSE", industry: "半導體業", period: "2026-08", revenue: 100, lastYearRevenue: 70, momPct: 4, yoyPct: 42, cumulativeRevenue: 800, cumulativeYoyPct: 31 },
    { code: "6488", name: "環球晶", market: "TPEx", industry: "半導體業", period: "2026-08", revenue: 90, lastYearRevenue: 80, momPct: -2, yoyPct: 12, cumulativeRevenue: 700, cumulativeYoyPct: 10 },
    { code: "3017", name: "奇鋐", market: "TWSE", industry: "電腦及週邊設備業", period: "2026-07", revenue: 80, lastYearRevenue: 50, momPct: 6, yoyPct: 60, cumulativeRevenue: 600, cumulativeYoyPct: 40 }
  ]
};

describe("monthly revenue cache", () => {
  it("defaults to held Taiwan symbols", () => {
    const rows = revenueRowsForView(cache, "", new Set(["2330"]));
    expect(rows.map((row) => row.code)).toEqual(["2330"]);
  });

  it("searches by code, name, or industry", () => {
    const rows = revenueRowsForView(cache, "半導體", new Set());
    expect(rows.map((row) => row.code)).toEqual(["2330", "6488"]);
  });

  it("reports latest available period", () => {
    expect(latestRevenuePeriod(cache)).toBe("2026-08");
  });
});
