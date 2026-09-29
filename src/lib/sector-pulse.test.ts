import { describe, expect, it } from "vitest";
import type { RevenueCache } from "./revenue-data";
import {
  buildRevenueSectorPulse,
  filterRevenueSectorPulse,
  heldRevenueIndustries
} from "./sector-pulse";

const cache: RevenueCache = {
  generatedAt: "2026-09-29T00:00:00.000Z",
  sources: [
    { name: "TWSE", url: "https://example.com/twse", fetchedAt: "2026-09-29T00:00:00.000Z" },
    { name: "TPEx", url: "https://example.com/tpex", fetchedAt: "2026-09-29T00:00:00.000Z" }
  ],
  rows: [
    { code: "1001", name: "A", market: "TWSE", industry: "半導體", period: "2026-08", revenue: 1, lastYearRevenue: 1, momPct: 1, yoyPct: 10, cumulativeRevenue: 1, cumulativeYoyPct: 1 },
    { code: "1002", name: "B", market: "TWSE", industry: "半導體", period: "2026-08", revenue: 1, lastYearRevenue: 1, momPct: 2, yoyPct: 20, cumulativeRevenue: 1, cumulativeYoyPct: 1 },
    { code: "1003", name: "C", market: "TWSE", industry: "半導體", period: "2026-08", revenue: 1, lastYearRevenue: 1, momPct: null, yoyPct: 30, cumulativeRevenue: 1, cumulativeYoyPct: 1 },
    { code: "1004", name: "D", market: "TPEx", industry: "半導體", period: "2026-08", revenue: 1, lastYearRevenue: 1, momPct: 4, yoyPct: -10, cumulativeRevenue: 1, cumulativeYoyPct: 1 },
    { code: "1005", name: "E", market: "TPEx", industry: "半導體", period: "2026-08", revenue: 1, lastYearRevenue: 1, momPct: 5, yoyPct: 40, cumulativeRevenue: 1, cumulativeYoyPct: 1 },
    { code: "2001", name: "F", market: "TWSE", industry: "航運", period: "2026-08", revenue: 1, lastYearRevenue: 1, momPct: 0, yoyPct: -20, cumulativeRevenue: 1, cumulativeYoyPct: 1 },
    { code: "2002", name: "G", market: "TWSE", industry: "航運", period: "2026-08", revenue: 1, lastYearRevenue: 1, momPct: 0, yoyPct: -10, cumulativeRevenue: 1, cumulativeYoyPct: 1 },
    { code: "2003", name: "H", market: "TWSE", industry: "航運", period: "2026-08", revenue: 1, lastYearRevenue: 1, momPct: 0, yoyPct: 0, cumulativeRevenue: 1, cumulativeYoyPct: 1 },
    { code: "2004", name: "I", market: "TPEx", industry: "航運", period: "2026-08", revenue: 1, lastYearRevenue: 1, momPct: 0, yoyPct: 10, cumulativeRevenue: 1, cumulativeYoyPct: 1 },
    { code: "2005", name: "J", market: "TPEx", industry: "航運", period: "2026-08", revenue: 1, lastYearRevenue: 1, momPct: 0, yoyPct: 20, cumulativeRevenue: 1, cumulativeYoyPct: 1 },
    { code: "3001", name: "Old", market: "TWSE", industry: "半導體", period: "2026-07", revenue: 1, lastYearRevenue: 1, momPct: 99, yoyPct: 999, cumulativeRevenue: 1, cumulativeYoyPct: 1 },
    { code: "4001", name: "Other", market: "TWSE", industry: "其他", period: "2026-08", revenue: 1, lastYearRevenue: 1, momPct: 1, yoyPct: 100, cumulativeRevenue: 1, cumulativeYoyPct: 1 }
  ]
};

describe("revenue sector pulse", () => {
  it("uses only the latest period and requires a sufficient YoY sample", () => {
    const rows = buildRevenueSectorPulse(cache);
    expect(rows.map((row) => row.industry)).toEqual(["半導體", "航運"]);
    expect(rows[0]?.period).toBe("2026-08");
    expect(rows[0]?.medianYoyPct).toBe(20);
    expect(rows[0]?.positiveYoySharePct).toBe(80);
    expect(rows[0]?.over20YoySharePct).toBe(40);
    expect(rows[0]?.twseCount).toBe(3);
    expect(rows[0]?.tpexCount).toBe(2);
  });

  it("does not use generic industries as a fake sector signal", () => {
    expect(buildRevenueSectorPulse(cache).some((row) => row.industry === "其他")).toBe(false);
  });

  it("can identify and filter to industries related to held stocks", () => {
    const held = heldRevenueIndustries(cache, new Set(["TWSE:1002"]));
    expect([...held]).toEqual(["半導體"]);
    const rows = filterRevenueSectorPulse(buildRevenueSectorPulse(cache), "", held, true);
    expect(rows.map((row) => row.industry)).toEqual(["半導體"]);
  });

  it("does not map a same-code holding to the other market's industry", () => {
    const split: RevenueCache = {
      ...cache,
      rows: [
        ...cache.rows,
        { code: "1002", name: "Same code TPEx", market: "TPEx", industry: "錯誤族群", period: "2026-08", revenue: 1, lastYearRevenue: 1, momPct: 0, yoyPct: 10, cumulativeRevenue: 1, cumulativeYoyPct: 1 }
      ]
    };
    const held = heldRevenueIndustries(split, new Set(["TWSE:1002"]));
    expect([...held]).toEqual(["半導體"]);
  });

  it("can search industry names without changing metric ordering", () => {
    const rows = filterRevenueSectorPulse(buildRevenueSectorPulse(cache), "航", new Set(), false);
    expect(rows.map((row) => row.industry)).toEqual(["航運"]);
  });
});
