import { describe, expect, it } from "vitest";
import type { AppState } from "./types";
import { dailySnapshotDelta, portfolioSummary, withTodaySnapshot } from "./calc";

const state: AppState = {
  usdTwd: 32,
  holdings: [
    { id: "tw", symbol: "2330", name: "TSMC", market: "TW", type: "stock", quantity: 2, price: 1000, averageCost: 900, currency: "TWD", sector: "半導體" },
    { id: "us", symbol: "QQQM", name: "QQQM", market: "US", type: "etf", quantity: 1, price: 100, averageCost: 80, currency: "USD", sector: "美國科技" }
  ],
  journal: [],
  activities: [],
  snapshots: []
};

describe("portfolio calculations", () => {
  it("converts USD holdings into TWD", () => {
    const result = portfolioSummary(state.holdings, state.usdTwd);
    expect(result.total).toBe(5200);
    expect(result.cost).toBe(4360);
    expect(result.gain).toBe(840);
  });

  it("keeps only one snapshot per local day and updates it", () => {
    const first = withTodaySnapshot(state, new Date(2026, 8, 27, 9, 0));
    const changed: AppState = {
      ...first,
      holdings: [{ ...first.holdings[0], price: 1100 }, first.holdings[1]]
    };
    const second = withTodaySnapshot(changed, new Date(2026, 8, 27, 18, 0));
    expect(second.snapshots).toHaveLength(1);
    expect(second.snapshots[0]?.total).toBe(5400);
  });

  it("calculates change between the latest two snapshot days", () => {
    const result = dailySnapshotDelta([
      { date: "2026-09-26", total: 100, cost: 90, gain: 10, usdTwd: 32 },
      { date: "2026-09-27", total: 110, cost: 90, gain: 20, usdTwd: 32 }
    ]);
    expect(result?.amount).toBe(10);
    expect(result?.pct).toBe(10);
  });
});
