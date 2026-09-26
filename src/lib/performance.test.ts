import { describe, expect, it } from "vitest";
import type { AppState } from "./types";
import { calculateXirr, modifiedDietzReturn, netExternalContributions, portfolioXirr } from "./performance";

describe("performance math", () => {
  it("solves a simple one-year 10% XIRR", () => {
    const result = calculateXirr([
      { date: "2025-01-01", value: -1000 },
      { date: "2026-01-01", value: 1100 }
    ]);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0.1, 6);
  });

  it("uses deposits and withdrawals as external cash flows", () => {
    const state: AppState = {
      usdTwd: 32,
      holdings: [],
      journal: [],
      snapshots: [],
      activities: [
        { id: "1", date: "2026-01-01", type: "deposit", symbol: "", amount: 1000, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "" },
        { id: "2", date: "2026-02-01", type: "withdrawal", symbol: "", amount: 200, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "" },
        { id: "3", date: "2026-02-10", type: "buy", symbol: "2330", amount: 500, currency: "TWD", fxRate: 1, quantity: 1, price: 500, note: "" }
      ]
    };
    expect(netExternalContributions(state.activities)).toBe(800);
  });

  it("calculates portfolio XIRR from external flows and terminal value", () => {
    const state: AppState = {
      usdTwd: 1,
      holdings: [
        { id: "cash", symbol: "CASH-TWD", name: "Cash", market: "TW", type: "cash", quantity: 1, price: 1100, averageCost: 1000, currency: "TWD", sector: "現金" }
      ],
      journal: [],
      snapshots: [],
      activities: [
        { id: "1", date: "2025-01-01", type: "deposit", symbol: "", amount: 1000, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "" }
      ]
    };
    expect(portfolioXirr(state, "2026-01-01")).toBeCloseTo(0.1, 6);
  });

  it("returns a cash-flow-adjusted Modified Dietz proxy", () => {
    const state: AppState = {
      usdTwd: 1,
      holdings: [],
      journal: [],
      activities: [
        { id: "flow", date: "2026-01-02", type: "deposit", symbol: "", amount: 50, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "" }
      ],
      snapshots: [
        { date: "2026-01-01", total: 100, cost: 100, gain: 0, usdTwd: 1 },
        { date: "2026-01-02", total: 165, cost: 150, gain: 15, usdTwd: 1 }
      ]
    };

    expect(modifiedDietzReturn(state)).toBeCloseTo(0.12, 6);
  });
});
