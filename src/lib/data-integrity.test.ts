import { describe, expect, it } from "vitest";
import type { AppState, PortfolioActivity } from "./types";
import { portfolioDataIntegrity } from "./data-integrity";

const TODAY = "2026-10-01";

function baseState(): AppState {
  return {
    dataMode: "personal",
    usdTwd: 31.8,
    holdings: [],
    etfCompositions: [],
    journal: [],
    activities: [],
    snapshots: [],
    allocationTargets: []
  };
}

function deposit(overrides: Partial<PortfolioActivity> = {}): PortfolioActivity {
  return {
    id: "deposit-1",
    date: "2026-09-30",
    time: "09:00",
    type: "deposit",
    symbol: "",
    amount: 1000,
    currency: "TWD",
    fxRate: 1,
    quantity: 0,
    price: 0,
    note: "",
    account: "券商A",
    ...overrides
  };
}

describe("portfolio data integrity", () => {
  it("returns no issues for a current official-TW state with today's snapshot", () => {
    const state = baseState();
    state.holdings = [{
      id: "tw",
      symbol: "2330",
      name: "台積電",
      market: "TW",
      type: "stock",
      quantity: 1,
      price: 1000,
      averageCost: 900,
      currency: "TWD",
      sector: "半導體",
      account: "券商A",
      priceSource: "TWSE",
      priceAsOf: TODAY
    }];
    state.snapshots = [{
      date: TODAY,
      total: 1000,
      cost: 900,
      gain: 100,
      usdTwd: 31.8
    }];

    expect(portfolioDataIntegrity(state, TODAY)).toEqual({
      today: TODAY,
      warningCount: 0,
      infoCount: 0,
      items: []
    });
  });

  it("surfaces future records, unverified Taiwan prices and stale snapshot coverage", () => {
    const state = baseState();
    state.holdings = [{
      id: "tw",
      symbol: "2330",
      name: "台積電",
      market: "TW",
      type: "stock",
      quantity: 1,
      price: 1000,
      averageCost: 900,
      currency: "TWD",
      sector: "半導體",
      account: "券商A",
      priceSource: "manual"
    }];
    state.activities = [deposit({ id: "future", date: "2026-10-02" })];
    state.snapshots = [
      { date: "2026-09-30", total: 1000, cost: 900, gain: 100, usdTwd: 31.8 },
      { date: "2026-10-03", total: 1000, cost: 900, gain: 100, usdTwd: 31.8 }
    ];

    const report = portfolioDataIntegrity(state, TODAY);

    expect(report.warningCount).toBe(4);
    expect(report.items.map((item) => item.id)).toEqual(expect.arrayContaining([
      "future_activities",
      "future_snapshots",
      "tw_price_provenance",
      "snapshot_missing_today"
    ]));
    expect(report.items.find((item) => item.id === "future_activities")?.examples)
      .toContain("2026-10-02 09:00 · deposit · 券商A");
    expect(report.items.find((item) => item.id === "future_activities")?.action)
      .toEqual({ label: "查看交易紀錄", target: "activity" });
    expect(report.items.find((item) => item.id === "tw_price_provenance")?.examples)
      .toContain("2330 · 券商A");
    expect(report.items.find((item) => item.id === "snapshot_missing_today")?.examples)
      .toEqual(["最近快照 2026-09-30"]);
  });

  it("flags future-dated Taiwan provenance separately from missing provenance", () => {
    const state = baseState();
    state.holdings = [{
      id: "tw",
      symbol: "2330",
      name: "台積電",
      market: "TW",
      type: "stock",
      quantity: 1,
      price: 1000,
      averageCost: 900,
      currency: "TWD",
      sector: "半導體",
      account: "券商A",
      priceSource: "TWSE",
      priceAsOf: "2026-10-02"
    }];
    state.snapshots = [{ date: TODAY, total: 1000, cost: 900, gain: 100, usdTwd: 31.8 }];

    const report = portfolioDataIntegrity(state, TODAY);
    expect(report.items.find((item) => item.id === "tw_future_price_date")?.count).toBe(1);
    expect(report.items.find((item) => item.id === "tw_future_price_date")?.examples)
      .toEqual(["2330 · 券商A · 2026-10-02"]);
    expect(report.items.find((item) => item.id === "tw_future_price_date")?.action.target)
      .toBe("holdings");
    expect(report.items.some((item) => item.id === "tw_price_provenance")).toBe(false);
  });

  it("reports missing and ambiguous Exact TWR boundaries", () => {
    const state = baseState();
    state.activities = [
      deposit({ id: "d1", date: "2026-09-20", time: undefined }),
      deposit({ id: "d2", date: "2026-09-20", time: undefined, amount: 500 })
    ];

    const report = portfolioDataIntegrity(state, TODAY);

    expect(report.items.find((item) => item.id === "twr_missing_boundary")?.count).toBe(2);
    expect(report.items.find((item) => item.id === "twr_missing_boundary")?.examples)
      .toEqual([
        "2026-09-20 · deposit · 券商A"
      ]);
    expect(report.items.find((item) => item.id === "twr_ambiguous_order")?.count).toBe(1);
    expect(report.items.find((item) => item.id === "twr_ambiguous_order")?.examples)
      .toEqual(["2026-09-20"]);
    expect(report.items.find((item) => item.id === "twr_missing_boundary")?.action)
      .toEqual({ label: "補 TWR 邊界", target: "activity" });
  });

  it("keeps legacy CSV provenance and manual US pricing informational", () => {
    const state = baseState();
    state.holdings = [{
      id: "us",
      symbol: "QQQM",
      name: "QQQM",
      market: "US",
      type: "etf",
      quantity: 1,
      price: 200,
      averageCost: 180,
      currency: "USD",
      sector: "ETF",
      account: "美股券商",
      priceSource: "manual"
    }];
    state.snapshots = [{ date: TODAY, total: 6360, cost: 5724, gain: 636, usdTwd: 31.8 }];
    state.activities = [{
      id: "legacy-csv",
      date: "2020-01-02",
      type: "buy",
      symbol: "QQQM",
      amount: 101,
      currency: "USD",
      fxRate: 30,
      quantity: 1,
      price: 100,
      note: "",
      account: "美股券商",
      historicalTrade: {
        mode: "ledger_only",
        market: "US",
        fee: 1,
        tax: 0,
        importSource: "csv",
        importFingerprint: "csv-id-old"
      }
    }];

    const report = portfolioDataIntegrity(state, TODAY);

    expect(report.warningCount).toBe(0);
    expect(report.infoCount).toBe(3);
    expect(report.items.map((item) => item.id)).toEqual(expect.arrayContaining([
      "legacy_csv_batch",
      "legacy_csv_filename",
      "manual_us_price"
    ]));
    expect(report.items.find((item) => item.id === "legacy_csv_batch")?.examples)
      .toEqual(["2020-01-02 · buy · QQQM · 美股券商"]);
    expect(report.items.find((item) => item.id === "manual_us_price")?.examples)
      .toEqual(["QQQM · 美股券商"]);
    expect(report.items.find((item) => item.id === "legacy_csv_batch")?.action.target)
      .toBe("historical_csv");
    expect(report.items.find((item) => item.id === "manual_us_price")?.action.target)
      .toBe("holdings");
  });

  it("does not flag complete V0.70+ CSV provenance", () => {
    const state = baseState();
    state.activities = [{
      id: "csv",
      date: "2020-01-02",
      type: "buy",
      symbol: "2330",
      amount: 101,
      currency: "TWD",
      fxRate: 1,
      quantity: 1,
      price: 100,
      note: "",
      account: "券商A",
      historicalTrade: {
        mode: "ledger_only",
        market: "TW",
        fee: 1,
        tax: 0,
        importSource: "csv",
        importFingerprint: "csv-id",
        importBatchId: "csv-batch-id",
        importFileName: "trades.csv"
      }
    }];

    const report = portfolioDataIntegrity(state, TODAY);
    expect(report.items.some((item) => item.id === "legacy_csv_batch")).toBe(false);
    expect(report.items.some((item) => item.id === "legacy_csv_filename")).toBe(false);
  });
});
