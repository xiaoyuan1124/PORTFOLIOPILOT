import { describe, expect, it } from "vitest";
import { annualizedVolatilityPct, maxDrawdownPct, priceHistoryMetrics, relativePerformancePct, trailingPriceReturn } from "./price-history";
import type { TwPriceHistoryPoint } from "./price-history-data";

const points: TwPriceHistoryPoint[] = [
  ["2025-10-01", 100],
  ["2025-11-03", 110],
  ["2026-04-01", 120],
  ["2026-07-01", 90],
  ["2026-09-01", 130],
  ["2026-10-01", 125]
];

describe("Taiwan price-history analytics", () => {
  it("calculates trailing price returns from the nearest trading point on/after target date", () => {
    expect(trailingPriceReturn(points, 1)).toMatchObject({
      startDate: "2026-09-01",
      endDate: "2026-10-01",
      returnPct: (125 / 130 - 1) * 100
    });
    expect(trailingPriceReturn(points, 12)?.startDate).toBe("2025-10-01");
  });

  it("calculates max drawdown on raw official closing prices", () => {
    expect(maxDrawdownPct(points)).toBeCloseTo(-25);
  });

  it("requires enough daily observations for annualized volatility", () => {
    expect(annualizedVolatilityPct(points)).toBeNull();

    const dense: TwPriceHistoryPoint[] = Array.from({ length: 30 }, (_, index) => [
      `2026-09-${String(index + 1).padStart(2, "0")}`,
      100 + index + (index % 2 ? 1 : -1)
    ]);
    expect(annualizedVolatilityPct(dense)).not.toBeNull();
  });

  it("calculates relative performance on the same return basis", () => {
    expect(relativePerformancePct(10, 5)).toBeCloseTo((1.1 / 1.05 - 1) * 100);
    expect(relativePerformancePct(-5, -10)).toBeCloseTo((0.95 / 0.9 - 1) * 100);
    expect(relativePerformancePct(null, 5)).toBeNull();
    expect(relativePerformancePct(10, -100)).toBeNull();
  });

  it("returns a combined metrics object without inventing unavailable periods", () => {
    const metrics = priceHistoryMetrics(points);
    expect(metrics.firstDate).toBe("2025-10-01");
    expect(metrics.latestDate).toBe("2026-10-01");
    expect(metrics.oneMonth).not.toBeNull();
    expect(metrics.oneYear).not.toBeNull();
    expect(metrics.annualizedVolatilityPct).toBeNull();
  });
});
