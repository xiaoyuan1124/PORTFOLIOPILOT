import { describe, expect, it } from "vitest";
import type { AppState } from "./types";
import { allocationByAccount, dailySnapshotDelta, officialPriceCoverage, portfolioCashSummary, portfolioSummary, snapshotsForRange, withTodaySnapshot } from "./calc";

const state: AppState = {
  usdTwd: 32,
  holdings: [
    { id: "tw", symbol: "2330", name: "TSMC", market: "TW", type: "stock", quantity: 2, price: 1000, averageCost: 900, currency: "TWD", sector: "半導體", account: "券商A" },
    { id: "us", symbol: "QQQM", name: "QQQM", market: "US", type: "etf", quantity: 1, price: 100, averageCost: 80, currency: "USD", sector: "美國科技", account: "券商B" }
  ],
  etfCompositions: [],
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

  it("groups value by local account", () => {
    const result = allocationByAccount(state.holdings, state.usdTwd);
    expect(result.map((row) => [row.name, row.value])).toEqual([["券商B", 3200], ["券商A", 2000]]);
  });

  it("reports official Taiwan price coverage without hiding older holdings", () => {
    const coverage = officialPriceCoverage([
      { ...state.holdings[0]!, priceSource: "TWSE", priceAsOf: "2026-09-29" },
      { id: "tw2", symbol: "6488", name: "GlobalWafers", market: "TW", type: "stock", quantity: 1, price: 400, averageCost: 350, currency: "TWD", sector: "半導體", priceSource: "TPEx", priceAsOf: "2026-09-28" },
      { id: "tw3", symbol: "0050", name: "ETF", market: "TW", type: "etf", quantity: 1, price: 200, averageCost: 180, currency: "TWD", sector: "ETF" }
    ],);

    expect(coverage).toEqual({
      total: 3,
      covered: 2,
      manualOrUnknown: 1,
      oldestDate: "2026-09-28",
      newestDate: "2026-09-29",
      aligned: false
    });
  });

  it("never treats cash balance as unrealized investment gain", () => {
    const result = portfolioSummary([
      { id: "cash", symbol: "CASH-TWD", name: "現金", market: "TW", type: "cash", quantity: 1, price: 1000, averageCost: 0, currency: "TWD", sector: "現金" }
    ], 32);

    expect(result.total).toBe(1000);
    expect(result.cost).toBe(1000);
    expect(result.gain).toBe(0);
    expect(result.gainPct).toBe(0);
  });

  it("separates cash from invested assets", () => {
    const result = portfolioCashSummary([
      ...state.holdings,
      { id: "cash", symbol: "CASH", name: "Cash", market: "TW", type: "cash", quantity: 1, price: 800, averageCost: 800, currency: "TWD", sector: "現金" }
    ], state.usdTwd);
    expect(result.cash).toBe(800);
    expect(result.total).toBe(6000);
  });

  it("filters snapshots by year to date", () => {
    const rows = snapshotsForRange([
      { date: "2025-12-31", total: 90, cost: 90, gain: 0, usdTwd: 32 },
      { date: "2026-01-02", total: 100, cost: 90, gain: 10, usdTwd: 32 },
      { date: "2026-09-27", total: 110, cost: 90, gain: 20, usdTwd: 32 }
    ], "YTD");
    expect(rows.map((row) => row.date)).toEqual(["2026-01-02", "2026-09-27"]);
  });
});
