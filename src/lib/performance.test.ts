import { describe, expect, it } from "vitest";
import type { AppState } from "./types";
import { calculateXirr, exactTimeWeightedReturn, incomeAfterFees, modifiedDietzReturn, netExternalContributions, portfolioXirr } from "./performance";
import { recordHistoricalCashActivity } from "./cash-account";

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
      etfCompositions: [],
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

  it("keeps historical backfill out of current cash while retaining performance semantics", () => {
    const base: AppState = {
      usdTwd: 1,
      holdings: [
        { id: "cash", symbol: "CASH-TWD", name: "Cash", market: "TW", type: "cash", quantity: 1, price: 250, averageCost: 250, currency: "TWD", sector: "現金", account: "券商A" }
      ],
      etfCompositions: [],
      journal: [],
      snapshots: [],
      activities: []
    };

    const next = recordHistoricalCashActivity(base, {
      id: "historical-deposit",
      date: "2000-01-01",
      type: "deposit",
      cashHoldingId: "cash",
      amount: 100,
      fxRate: 1,
      symbol: "",
      note: "",
      time: "09:00",
      preFlowValueTwd: 100
    });

    expect(next.holdings[0]?.price).toBe(250);
    expect(netExternalContributions(next.activities)).toBe(100);
    const twr = exactTimeWeightedReturn(next, "2000-01-02");
    expect(twr.externalFlowCount).toBe(1);
    expect(twr.boundedFlowCount).toBe(1);
    expect(twr.status).toBe("exact");
    expect(twr.value).toBeCloseTo(0.25, 10);
  });

  it("does not treat internal cash transfers as contributions, income or TWR boundaries", () => {
    const transfer = {
      id: "transfer",
      date: "2026-02-05",
      type: "transfer" as const,
      symbol: "",
      amount: 500,
      currency: "TWD" as const,
      fxRate: 1,
      quantity: 0,
      price: 0,
      note: ""
    };

    expect(netExternalContributions([transfer])).toBe(0);
    expect(incomeAfterFees([transfer])).toBe(0);

    const state: AppState = {
      usdTwd: 1,
      holdings: [
        { id: "cash", symbol: "CASH-TWD", name: "Cash", market: "TW", type: "cash", quantity: 1, price: 1100, averageCost: 1100, currency: "TWD", sector: "現金" }
      ],
      etfCompositions: [],
      journal: [],
      snapshots: [{ date: "2026-01-01", total: 1000, cost: 1000, gain: 0, usdTwd: 1 }],
      activities: [transfer]
    };

    const twr = exactTimeWeightedReturn(state, "2026-02-10");
    expect(twr.externalFlowCount).toBe(0);
    expect(twr.status).toBe("exact");
    expect(twr.value).toBeCloseTo(0.1, 10);
  });

  it("does not treat internal FX conversion as contributions, income or TWR boundaries", () => {
    const conversion = {
      id: "fx",
      date: "2026-02-05",
      type: "fx_conversion" as const,
      symbol: "",
      amount: 3200,
      currency: "TWD" as const,
      fxRate: 32,
      quantity: 0,
      price: 0,
      note: ""
    };

    expect(netExternalContributions([conversion])).toBe(0);
    expect(incomeAfterFees([conversion])).toBe(0);

    const state: AppState = {
      usdTwd: 32,
      holdings: [
        { id: "cash", symbol: "CASH-TWD", name: "Cash", market: "TW", type: "cash", quantity: 1, price: 1100, averageCost: 1100, currency: "TWD", sector: "現金" }
      ],
      etfCompositions: [],
      journal: [],
      snapshots: [{ date: "2026-01-01", total: 1000, cost: 1000, gain: 0, usdTwd: 32 }],
      activities: [conversion]
    };

    const twr = exactTimeWeightedReturn(state, "2026-02-10");
    expect(twr.externalFlowCount).toBe(0);
    expect(twr.status).toBe("exact");
    expect(twr.value).toBeCloseTo(0.1, 10);
  });

  it("does not treat security account transfer as contribution, income or TWR boundary", () => {
    const transfer = {
      id: "position-transfer",
      date: "2026-02-05",
      type: "position_transfer" as const,
      symbol: "2330",
      amount: 0,
      currency: "TWD" as const,
      fxRate: 1,
      quantity: 4,
      price: 0,
      note: ""
    };

    expect(netExternalContributions([transfer])).toBe(0);
    expect(incomeAfterFees([transfer])).toBe(0);

    const state: AppState = {
      usdTwd: 1,
      holdings: [
        { id: "h", symbol: "2330", name: "Test", market: "TW", type: "stock", quantity: 1, price: 1100, averageCost: 1000, currency: "TWD", sector: "Test" }
      ],
      etfCompositions: [],
      journal: [],
      snapshots: [{ date: "2026-01-01", total: 1000, cost: 1000, gain: 0, usdTwd: 1 }],
      activities: [transfer]
    };

    const twr = exactTimeWeightedReturn(state, "2026-02-10");
    expect(twr.externalFlowCount).toBe(0);
    expect(twr.status).toBe("exact");
    expect(twr.value).toBeCloseTo(0.1, 10);
  });

  it("excludes future external cash flows from current contribution totals", () => {
    const activities = [
      { id: "past", date: "2026-09-29", type: "deposit" as const, symbol: "", amount: 1000, currency: "TWD" as const, fxRate: 1, quantity: 0, price: 0, note: "" },
      { id: "future", date: "2026-10-05", type: "deposit" as const, symbol: "", amount: 500, currency: "TWD" as const, fxRate: 1, quantity: 0, price: 0, note: "" }
    ];
    expect(netExternalContributions(activities, "2026-09-30")).toBe(1000);
  });

  it("excludes future dividends and fees from current income totals", () => {
    const activities = [
      { id: "dividend", date: "2026-09-29", type: "dividend" as const, symbol: "2330", amount: 100, currency: "TWD" as const, fxRate: 1, quantity: 0, price: 0, note: "" },
      { id: "future-fee", date: "2026-10-05", type: "fee" as const, symbol: "", amount: 50, currency: "TWD" as const, fxRate: 1, quantity: 0, price: 0, note: "" }
    ];
    expect(incomeAfterFees(activities, "2026-09-30")).toBe(100);
  });

  it("calculates portfolio XIRR from external flows and terminal value", () => {
    const state: AppState = {
      usdTwd: 1,
      holdings: [
        { id: "cash", symbol: "CASH-TWD", name: "Cash", market: "TW", type: "cash", quantity: 1, price: 1100, averageCost: 1000, currency: "TWD", sector: "現金" }
      ],
      etfCompositions: [],
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
      etfCompositions: [],
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

  it("excludes future snapshots from the current Modified Dietz proxy", () => {
    const state: AppState = {
      usdTwd: 1,
      holdings: [],
      etfCompositions: [],
      journal: [],
      activities: [],
      snapshots: [
        { date: "2026-09-28", total: 100, cost: 100, gain: 0, usdTwd: 1 },
        { date: "2026-09-29", total: 110, cost: 100, gain: 10, usdTwd: 1 },
        { date: "2026-10-05", total: 220, cost: 100, gain: 120, usdTwd: 1 }
      ]
    };

    expect(modifiedDietzReturn(state, "2026-09-30")).toBeCloseTo(0.1, 10);
  });

  it("chains exact TWR across bounded external cash-flow events", () => {
    const state: AppState = {
      usdTwd: 1,
      holdings: [
        { id: "cash", symbol: "CASH-TWD", name: "Cash", market: "TW", type: "cash", quantity: 1, price: 176, averageCost: 100, currency: "TWD", sector: "現金" }
      ],
      etfCompositions: [],
      journal: [],
      snapshots: [],
      activities: [
        { id: "1", date: "2026-01-01", time: "09:00", type: "deposit", symbol: "", amount: 100, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "", preFlowValueTwd: 0 },
        { id: "2", date: "2026-01-10", time: "09:00", type: "deposit", symbol: "", amount: 50, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "", preFlowValueTwd: 110 }
      ]
    };

    const result = exactTimeWeightedReturn(state, "2026-01-20");
    expect(result.status).toBe("exact");
    expect(result.value).toBeCloseTo(0.21, 10);
    expect(result.periods).toBe(2);
    expect(result.coverageStartsAfterFirstFlow).toBe(true);
  });

  it("reports insufficient when any external cash flow lacks a pre-flow valuation", () => {
    const state: AppState = {
      usdTwd: 1,
      holdings: [],
      etfCompositions: [],
      journal: [],
      snapshots: [],
      activities: [
        { id: "1", date: "2026-01-01", type: "deposit", symbol: "", amount: 100, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "" }
      ]
    };

    const result = exactTimeWeightedReturn(state, "2026-01-20");
    expect(result.status).toBe("insufficient");
    expect(result.missingBoundaryIds).toEqual(["1"]);
  });

  it("requires times for multiple external flows on the same day", () => {
    const state: AppState = {
      usdTwd: 1,
      holdings: [
        { id: "cash", symbol: "CASH-TWD", name: "Cash", market: "TW", type: "cash", quantity: 1, price: 170, averageCost: 100, currency: "TWD", sector: "現金" }
      ],
      etfCompositions: [],
      journal: [],
      snapshots: [],
      activities: [
        { id: "1", date: "2026-01-01", type: "deposit", symbol: "", amount: 100, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "", preFlowValueTwd: 0 },
        { id: "2", date: "2026-01-01", type: "deposit", symbol: "", amount: 50, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "", preFlowValueTwd: 110 }
      ]
    };

    const result = exactTimeWeightedReturn(state, "2026-01-20");
    expect(result.status).toBe("insufficient");
    expect(result.ambiguousDates).toEqual(["2026-01-01"]);
  });

  it("rejects a withdrawal that would make post-flow portfolio value negative", () => {
    const state: AppState = {
      usdTwd: 1,
      holdings: [],
      etfCompositions: [],
      journal: [],
      snapshots: [],
      activities: [
        { id: "1", date: "2026-01-01", type: "withdrawal", symbol: "", amount: 120, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "", preFlowValueTwd: 100 }
      ]
    };

    const result = exactTimeWeightedReturn(state, "2026-01-20");
    expect(result.status).toBe("insufficient");
    expect(result.reason).toMatch(/小於 0/);
  });

  it("uses a prior snapshot to include the period before the first bounded cash flow", () => {
    const state: AppState = {
      usdTwd: 1,
      holdings: [
        { id: "cash", symbol: "CASH-TWD", name: "Cash", market: "TW", type: "cash", quantity: 1, price: 165, averageCost: 100, currency: "TWD", sector: "現金" }
      ],
      etfCompositions: [],
      journal: [],
      snapshots: [
        { date: "2025-12-20", total: 100, cost: 100, gain: 0, usdTwd: 1 }
      ],
      activities: [
        { id: "1", date: "2026-01-01", type: "deposit", symbol: "", amount: 50, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "", preFlowValueTwd: 110 }
      ]
    };

    const result = exactTimeWeightedReturn(state, "2026-01-20");
    expect(result.status).toBe("exact");
    expect(result.value).toBeCloseTo(0.134375, 10);
    expect(result.startDate).toBe("2025-12-20");
    expect(result.coverageStartsAfterFirstFlow).toBe(false);
  });
});
