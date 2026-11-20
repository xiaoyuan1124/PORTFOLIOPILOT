import { describe, expect, it } from "vitest";
import { formatNetWorthTick, netWorthChartScale, netWorthFullScale } from "./net-worth-chart-scale";

describe("net-worth chart scale", () => {
  it("keeps full-money context at zero while zoom focuses on the real spread", () => {
    const values = [79067, 79210, null, 79100];
    const full = netWorthFullScale(values);
    expect(full.domain[0]).toBe(0);
    expect(full.domain[1]).toBeGreaterThan(79210);
    expect(netWorthChartScale(values).domain[0]).toBeGreaterThan(78000);
    expect(full.minimum).toBe(79067);
  });
  it("zooms around observed values rather than starting at zero", () => {
    const scale = netWorthChartScale([79067, 79210, 79340, 79180]);
    expect(scale.domain[0]).toBeGreaterThan(78000);
    expect(scale.domain[1]).toBeLessThan(80000);
    expect(scale.ticks.length).toBeGreaterThanOrEqual(4);
    expect(scale.ticks.every((v, i, arr) => i === 0 || v > arr[i - 1])).toBe(true);
    expect(scale.unchanged).toBe(false);
  });

  it("keeps smaller-than-one-dollar movements visible with cent ticks", () => {
    const scale = netWorthChartScale([79067.12, 79067.15, null, 79067.20]);
    expect(scale.step).toBeLessThan(1);
    expect(scale.domain[0]).toBeLessThanOrEqual(79067.12);
    expect(scale.domain[1]).toBeGreaterThanOrEqual(79067.20);
    expect(formatNetWorthTick(79067.15, scale.step)).toBe("79,067.15");
  });

  it("does not create artificial variation for flat or missing data", () => {
    expect(netWorthChartScale([50000, null, 50000]).unchanged).toBe(true);
    const empty = netWorthChartScale([null, null]);
    expect(empty.minimum).toBeNull();
    expect(empty.unchanged).toBe(true);
  });

  it("handles zero and large values without losing real observations", () => {
    const zero = netWorthChartScale([0, 0]);
    expect(zero.domain[0]).toBe(0);
    const large = netWorthChartScale([1_500_000, 1_500_200, 1_499_800]);
    expect(large.domain[0]).toBeLessThan(1_499_800);
    expect(large.domain[1]).toBeGreaterThan(1_500_200);
    expect(formatNetWorthTick(1_500_000, large.step)).toBe("1,500,000");
  });
});
