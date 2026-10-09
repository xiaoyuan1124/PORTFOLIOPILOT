import { describe, expect, it } from "vitest";
import { simulateContributionOnlyPlan } from "./contribution-plan";
import type { AllocationTarget, Holding } from "./types";

function holding(
  symbol: string, market: "TW" | "US", quantity: number, price: number,
  options: Partial<Holding> = {}
): Holding {
  return {
    id: symbol, symbol, name: symbol, market, type: "etf",
    quantity, price, averageCost: price, currency: market === "TW" ? "TWD" : "USD",
    sector: "ETF", priceAsOf: "2026-10-08", ...options
  };
}
const goals: AllocationTarget[] = [
  { key: "TW:00935", label: "00935", targetPct: 50 },
  { key: "TW:009816", label: "009816", targetPct: 50 }
];

describe("read-only new-money contribution planner", () => {
  it("purchases only the underweight asset with a valid whole-share quote", () => {
    const positions = [holding("00935", "TW", 6, 100), holding("009816", "TW", 4, 100)];
    const original = JSON.stringify(positions);
    const result = simulateContributionOnlyPlan(goals, positions, 32, 200);
    expect(result.currentTotalTwd).toBe(1000);
    expect(result.futureTotalTwd).toBe(1200);
    expect(result.plannedInvestmentTwd).toBe(200);
    expect(result.unallocatedTwd).toBe(0);
    expect(result.rows.find((row) => row.key === "TW:009816")).toMatchObject({
      buyUnits: 2, plannedTwd: 200, status: "buy"
    });
    expect(result.rows.find((row) => row.key === "TW:00935")?.buyUnits).toBe(0);
    expect(JSON.stringify(positions)).toBe(original);
  });

  it("adds exposure across accounts before choosing units", () => {
    const positions = [
      holding("00935", "TW", 1, 100, { id: "a" }),
      holding("00935", "TW", 2, 100, { id: "b" }),
      holding("009816", "TW", 7, 100)
    ];
    const result = simulateContributionOnlyPlan(goals, positions, 32, 400);
    expect(result.rows.find((row) => row.key === "TW:00935")).toMatchObject({
      currentValueTwd: 300, buyUnits: 4, plannedTwd: 400
    });
  });

  it("uses the locally stored USD/TWD reference only for TWD-equivalent valuation", () => {
    const positions = [
      holding("00935", "TW", 8, 100),
      holding("QQQM", "US", 1, 10)
    ];
    const result = simulateContributionOnlyPlan([
      { key: "TW:00935", label: "00935", targetPct: 50 },
      { key: "US:QQQM", label: "QQQM", targetPct: 50 }
    ], positions, 32, 320);
    expect(result.rows.find((row) => row.key === "US:QQQM")).toMatchObject({
      estimatedUnitPriceTwd: 320, buyUnits: 1, plannedTwd: 320
    });
  });

  it("does not invent share quantities for unheld targets without an observed price", () => {
    const result = simulateContributionOnlyPlan([
      { key: "TW:00935", label: "00935", targetPct: 50 },
      { key: "US:QQQM", label: "QQQM", targetPct: 50 }
    ], [holding("00935", "TW", 10, 100)], 32, 500);
    const unavailable = result.rows.find((row) => row.key === "US:QQQM");
    expect(unavailable).toMatchObject({ status: "no_price", buyUnits: 0, estimatedUnitPriceTwd: null });
    expect(result.unallocatedTwd).toBe(500);
  });

  it("honors whole-share minimums and never spends cash exceeding new funds", () => {
    const result = simulateContributionOnlyPlan(goals, [
      holding("00935", "TW", 1, 100),
      holding("009816", "TW", 1, 100)
    ], 32, 75);
    expect(result.plannedInvestmentTwd).toBe(0);
    expect(result.unallocatedTwd).toBe(75);
    expect(result.rows.every((row) => row.buyUnits === 0)).toBe(true);
  });

  it("reserves TWD cash targets without inventing USD cash conversions", () => {
    const targets: AllocationTarget[] = [
      { key: "TW:00935", label: "00935", targetPct: 60 },
      { key: "CASH:TWD", label: "台幣現金", targetPct: 20 },
      { key: "CASH:USD", label: "美元現金", targetPct: 20 }
    ];
    const result = simulateContributionOnlyPlan(targets, [
      holding("00935", "TW", 10, 100)
    ], 32, 500);
    expect(result.reservedCashTwd).toBe(300);
    expect(result.unallocatedTwd).toBe(200);
    expect(result.rows.find((row) => row.key === "CASH:USD")?.status).toBe("fx_required");
  });

  it("rejects invalid budgets, FX and incomplete allocation goals", () => {
    expect(() => simulateContributionOnlyPlan(goals, [], 32, 0)).toThrow();
    expect(() => simulateContributionOnlyPlan(goals, [], 0, 100)).toThrow();
    expect(() => simulateContributionOnlyPlan([{ key: "TW:00935", label: "00935", targetPct: 70 }], [], 32, 100)).toThrow();
  });
});
