import { describe, expect, it } from "vitest";
import {
  bucketFileName,
  bucketPrefix,
  calendarDateAdd,
  historyBucketStats,
  mergeHistoryBucket,
  mergeSeriesPoints,
  mapWithConcurrency,
  needsPriceHistoryRefresh,
  parseTpexDailyQuotesPayload,
  toRocDate,
  weekdayDates
} from "./price-history.mjs";

describe("Taiwan price-history cache helpers", () => {
  it("parses TPEx dailyQuotes table payload", () => {
    const rows = parseTpexDailyQuotesPayload({
      tables: [{
        fields: ["代號", "名稱", "收盤", "漲跌"],
        data: [
          ["6488", "環球晶", "445.00", "-5.00"],
          ["00961", "ETF", "12.34", "+0.10"]
        ]
      }]
    }, "2026-09-30");

    expect(rows).toEqual([
      { code: "6488", name: "環球晶", market: "TPEx", date: "2026-09-30", close: 445 },
      { code: "00961", name: "ETF", market: "TPEx", date: "2026-09-30", close: 12.34 }
    ]);
  });

  it("creates stable market/prefix bucket names", () => {
    expect(bucketPrefix("2330")).toBe("23");
    expect(bucketPrefix("009816")).toBe("00");
    expect(bucketFileName("TWSE", "2330")).toBe("twse-23.json");
    expect(bucketFileName("TPEx", "64")).toBe("tpex-64.json");
  });

  it("deduplicates same-date points and trims old points", () => {
    expect(mergeSeriesPoints(
      [["2025-09-01", 10], ["2026-09-29", 20]],
      [["2026-09-29", 21], ["2026-09-30", 22]],
      "2026-01-01"
    )).toEqual([
      ["2026-09-29", 21],
      ["2026-09-30", 22]
    ]);
  });

  it("merges rows into a bounded bucket without losing existing symbols", () => {
    const bucket = mergeHistoryBucket({
      securities: {
        "2330": { name: "台積電", points: [["2026-09-29", 1200]] }
      }
    }, "TWSE", "23", [
      { code: "2330", name: "台積電", market: "TWSE", date: "2026-09-30", close: 1250 },
      { code: "2303", name: "聯電", market: "TWSE", date: "2026-09-30", close: 50 }
    ], "2026-01-01", "2026-10-01T00:00:00.000Z");

    expect(bucket.securities["2330"].points).toEqual([
      ["2026-09-29", 1200],
      ["2026-09-30", 1250]
    ]);
    expect(bucket.securities["2303"].points).toEqual([["2026-09-30", 50]]);
    expect(historyBucketStats(bucket)).toEqual({ symbols: 2, points: 3 });
  });

  it("limits concurrent workers while preserving output order", async () => {
    let active = 0;
    let maxActive = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return value * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1);
  });

  it("skips an already-current clean cache but refreshes stale or unresolved history", () => {
    const current = {
      endDate: "2026-10-01",
      targetEndDate: "2026-10-01",
      failed: []
    };

    expect(needsPriceHistoryRefresh(current, "2026-10-01", true)).toBe(false);
    expect(needsPriceHistoryRefresh({ ...current, endDate: "2026-09-30" }, "2026-10-01", true)).toBe(true);
    expect(needsPriceHistoryRefresh({ ...current, failed: [{ market: "TPEx", date: "2026-10-01" }] }, "2026-10-01", true)).toBe(true);
    expect(needsPriceHistoryRefresh(current, "2026-10-01", false)).toBe(true);
  });

  it("converts ISO dates to TPEx ROC history dates", () => {
    expect(toRocDate("2026-09-30")).toBe("115/09/30");
    expect(() => toRocDate("bad-date")).toThrow(/Invalid ISO date/);
  });

  it("builds weekday date ranges and handles calendar arithmetic", () => {
    expect(calendarDateAdd("2026-09-30", 1)).toBe("2026-10-01");
    expect(weekdayDates("2026-10-01", "2026-10-05")).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-05"
    ]);
  });
});
