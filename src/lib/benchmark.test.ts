import { describe, expect, it } from "vitest";
import { benchmarkWindow, type BenchmarkSeries } from "./benchmark";

const series: BenchmarkSeries = {
  id: "TWSE:TAIEX-TR",
  symbol: "TAIEX-TR",
  name: "發行量加權股價報酬指數",
  market: "TW",
  currency: "TWD",
  returnType: "total_return",
  provider: "TWSE",
  sourceName: "TWSE MFI94U",
  sourceUrl: "https://www.twse.com.tw/zh/indices/taiex/mfi94u.html",
  sourceUrlTemplate: "https://www.twse.com.tw/indicesReport/MFI94U?response=json&date=YYYYMM01",
  fetchedAt: "2026-09-27T00:00:00.000Z",
  asOf: "2026-09-24",
  points: [
    { date: "2026-09-21", value: 100 },
    { date: "2026-09-22", value: 102 },
    { date: "2026-09-23", value: 101 },
    { date: "2026-09-24", value: 103 }
  ]
};

describe("benchmark comparison windows", () => {
  it("uses exact calendar endpoints when both are official trading dates", () => {
    const result = benchmarkWindow(series, "2026-09-21", "2026-09-24");
    expect(result.status).toBe("available");
    expect(result.calendarDatesExact).toBe(true);
    expect(result.returnPct).toBeCloseTo(3);
  });

  it("contains the benchmark inside weekend/non-trading target dates", () => {
    const result = benchmarkWindow(series, "2026-09-20", "2026-09-27");
    expect(result.status).toBe("available");
    expect(result.actualStart).toBe("2026-09-21");
    expect(result.actualEnd).toBe("2026-09-24");
    expect(result.calendarDatesExact).toBe(false);
  });

  it("returns insufficient instead of extrapolating a single point", () => {
    const result = benchmarkWindow(series, "2026-09-24", "2026-09-27");
    expect(result.status).toBe("insufficient");
    expect(result.returnPct).toBeNull();
  });

  it("refuses to replace a much earlier portfolio start with the cache first row", () => {
    const result = benchmarkWindow(series, "2026-08-01", "2026-09-24");
    expect(result.status).toBe("insufficient");
    expect(result.reason).toMatch(/未完整覆蓋/);
  });

  it("refuses stale benchmark coverage far before the target end", () => {
    const result = benchmarkWindow(series, "2026-09-21", "2026-10-20");
    expect(result.status).toBe("insufficient");
    expect(result.reason).toMatch(/未完整覆蓋/);
  });
});
