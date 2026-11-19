import { describe, expect, it } from "vitest";
import { calculateMarketStress, marketStressDateMismatch, marketStressLabel } from "./market-stress";

function series(count: number, start = "2024-01-01") {
  const base = new Date(start + "T00:00:00Z");
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10),
    value: 100 + i * 0.2 + Math.sin(i / 5) * 3
  }));
}

describe("independent market stress model", () => {
  it("returns no fabricated score for short official series", () => {
    expect(calculateMarketStress(series(200))).toEqual([]);
  });

  it("uses sorted unique dates and one official index series", () => {
    const p = series(380);
    const result = calculateMarketStress([p[20], ...p.slice().reverse(), p[20]]);
    expect(result.length).toBe(380 - 251);
    expect(result.at(-1)?.date).toBe(p.at(-1)?.date);
    expect(result.every((x) => x.score >= 0 && x.score <= 100)).toBe(true);
    expect(result.at(-1)?.factors).toHaveLength(3);
  });

  it("rejects future dates and never mislabels cross-date comparisons", () => {
    const p = series(380);
    const output = calculateMarketStress(p, p[370].date);
    expect(output.at(-1)?.date).toBe(p[370].date);
    expect(marketStressDateMismatch("2026-11-18", "2026-11-19")).toBe(true);
    expect(marketStressDateMismatch("2026-11-19", "2026-11-18")).toBe(false);
  });

  it("provides an explanatory stress level", () => {
    expect(marketStressLabel(93)).toBe("極度緊張");
    expect(marketStressLabel(15)).toBe("相對平靜");
  });
});
