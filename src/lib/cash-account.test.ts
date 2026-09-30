import { describe, expect, it } from "vitest";
import type { AppState, Holding } from "./types";
import { localDateKey } from "./calc";
import {
  applyCashLinkedActivity,
  nextCashSnapshot,
  revertCashLinkedActivity
} from "./cash-account";

function cash(patch: Partial<Holding> = {}): Holding {
  return {
    id: "cash",
    symbol: "CASH-TWD",
    name: "TWD 現金",
    market: "TW",
    type: "cash",
    quantity: 1,
    price: 5000,
    averageCost: 5000,
    currency: "TWD",
    sector: "現金",
    account: "券商現金",
    ...patch
  };
}

function state(baseCash = cash()): AppState {
  return {
    holdings: [baseCash],
    etfCompositions: [],
    journal: [],
    activities: [],
    snapshots: [],
    allocationTargets: [],
    usdTwd: 31.8,
    dataMode: "personal"
  };
}

describe("cash account linkage", () => {
  it("adds deposits to cash and keeps the TWR boundary", () => {
    const next = applyCashLinkedActivity(state(), {
      id: "deposit",
      date: "2026-09-30",
      type: "deposit",
      cashHoldingId: "cash",
      amount: 1000,
      fxRate: 1,
      symbol: "",
      note: "入金",
      time: "09:30",
      preFlowValueTwd: 5000
    });

    expect(next.holdings[0]?.price).toBe(6000);
    expect(next.holdings[0]?.averageCost).toBe(6000);
    expect(next.activities[0]).toMatchObject({
      type: "deposit",
      amount: 1000,
      currency: "TWD",
      time: "09:30",
      preFlowValueTwd: 5000,
      preFlowValueSource: "manual",
      cashImpact: {
        delta: 1000,
        reason: "deposit"
      }
    });
  });

  it("auto-captures the current portfolio value before a same-day external cash flow", () => {
    const base = state();
    base.holdings.push({
      id: "usd-stock",
      symbol: "TEST",
      name: "Test",
      market: "US",
      type: "stock",
      quantity: 2,
      price: 100,
      averageCost: 90,
      currency: "USD",
      sector: "Test",
      account: "美股"
    });

    const next = applyCashLinkedActivity(base, {
      id: "auto-deposit",
      date: localDateKey(),
      type: "deposit",
      cashHoldingId: "cash",
      amount: 1000,
      fxRate: 1,
      symbol: "",
      note: "",
      time: "10:15",
      capturePreFlowFromCurrentState: true
    });

    expect(next.activities[0]).toMatchObject({
      preFlowValueTwd: 11360,
      preFlowValueSource: "system_current_state",
      time: "10:15"
    });
    expect(next.holdings.find((item) => item.id === "cash")?.price).toBe(6000);
  });

  it("rejects current-state boundary capture for historical flows", () => {
    expect(() => applyCashLinkedActivity(state(), {
      id: "historical",
      date: "2000-01-01",
      type: "deposit",
      cashHoldingId: "cash",
      amount: 100,
      fxRate: 1,
      symbol: "",
      note: "",
      time: "10:15",
      capturePreFlowFromCurrentState: true
    })).toThrow(/歷史入金／出金不可使用目前淨值/);
  });

  it("rejects auto boundary capture on non-external cash events", () => {
    expect(() => applyCashLinkedActivity(state(), {
      id: "dividend-auto",
      date: localDateKey(),
      type: "dividend",
      cashHoldingId: "cash",
      amount: 100,
      fxRate: 1,
      symbol: "2330",
      note: "",
      time: "10:15",
      capturePreFlowFromCurrentState: true
    })).toThrow(/只有入金／出金/);
  });

  it("subtracts withdrawals and preserves a zero-balance cash account", () => {
    const next = applyCashLinkedActivity(state(cash({ price: 1000, averageCost: 1000 })), {
      id: "withdrawal",
      date: "2026-09-30",
      type: "withdrawal",
      cashHoldingId: "cash",
      amount: 1000,
      fxRate: 1,
      symbol: "",
      note: ""
    });

    expect(next.holdings).toHaveLength(1);
    expect(next.holdings[0]).toMatchObject({ quantity: 1, price: 0, averageCost: 0 });
    expect(next.activities[0]?.cashImpact?.after).toMatchObject({ price: 0, averageCost: 0 });

    const reverted = revertCashLinkedActivity(next, "withdrawal");
    expect(reverted.holdings).toEqual([cash({ price: 1000, averageCost: 1000 })]);
    expect(reverted.activities).toHaveLength(0);
  });

  it("adds dividends and subtracts standalone fees", () => {
    const withDividend = applyCashLinkedActivity(state(), {
      id: "dividend",
      date: "2026-09-30",
      type: "dividend",
      cashHoldingId: "cash",
      amount: 120,
      fxRate: 1,
      symbol: "2330",
      note: ""
    });
    expect(withDividend.holdings[0]?.price).toBe(5120);

    const withFee = applyCashLinkedActivity(withDividend, {
      id: "fee",
      date: "2026-09-30",
      type: "fee",
      cashHoldingId: "cash",
      amount: 20,
      fxRate: 1,
      symbol: "",
      note: ""
    });
    expect(withFee.holdings[0]?.price).toBe(5100);
  });

  it("rejects withdrawals or fees that would create negative cash", () => {
    expect(() => applyCashLinkedActivity(state(), {
      id: "bad",
      date: "2026-09-30",
      type: "fee",
      cashHoldingId: "cash",
      amount: 6000,
      fxRate: 1,
      symbol: "",
      note: ""
    })).toThrow(/現金不足/);
  });

  it("preserves USD currency and historical FX on cash-linked activity", () => {
    const usdCash = cash({
      market: "US",
      symbol: "CASH-USD",
      name: "USD 現金",
      price: 100,
      averageCost: 100,
      currency: "USD"
    });

    const next = applyCashLinkedActivity(state(usdCash), {
      id: "usd-dividend",
      date: "2026-09-30",
      type: "dividend",
      cashHoldingId: "cash",
      amount: 5,
      fxRate: 31.5,
      symbol: "QQQM",
      note: ""
    });

    expect(next.activities[0]).toMatchObject({
      currency: "USD",
      fxRate: 31.5
    });
    expect(next.holdings[0]?.price).toBe(105);
  });

  it("rejects rollback when a later event touched the same cash account", () => {
    const first = applyCashLinkedActivity(state(), {
      id: "a",
      date: "2026-09-29",
      type: "deposit",
      cashHoldingId: "cash",
      amount: 100,
      fxRate: 1,
      symbol: "",
      note: ""
    });
    const second = applyCashLinkedActivity(first, {
      id: "b",
      date: "2026-09-30",
      type: "fee",
      cashHoldingId: "cash",
      amount: 10,
      fxRate: 1,
      symbol: "",
      note: ""
    });

    expect(() => revertCashLinkedActivity(second, "a")).toThrow(/最新一筆/);
  });

  it("rejects rollback after manual cash drift", () => {
    const next = applyCashLinkedActivity(state(), {
      id: "deposit",
      date: "2026-09-30",
      type: "deposit",
      cashHoldingId: "cash",
      amount: 100,
      fxRate: 1,
      symbol: "",
      note: ""
    });
    const drifted = {
      ...next,
      holdings: next.holdings.map((item) => ({ ...item, price: item.price + 1, averageCost: item.averageCost + 1 }))
    };

    expect(() => revertCashLinkedActivity(drifted, "deposit")).toThrow(/無法安全自動回滾/);
  });

  it("normalizes cash snapshots and rejects invalid deltas", () => {
    const after = nextCashSnapshot(cash(), -500);
    expect(after).toMatchObject({
      quantity: 1,
      price: 4500,
      averageCost: 4500,
      priceSource: undefined,
      priceAsOf: undefined
    });
    expect(() => nextCashSnapshot(cash(), 0)).toThrow(/無效/);
  });
});
