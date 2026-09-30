import { describe, expect, it } from "vitest";
import type { AppState, Holding } from "./types";
import { localDateKey } from "./calc";
import {
  applyCashExchange,
  applyCashLinkedActivity,
  applyCashTransfer,
  nextCashSnapshot,
  revertCashExchange,
  revertCashLinkedActivity,
  revertCashTransfer
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

  it("uses the current portfolio FX for an automatically captured USD boundary", () => {
    const usdCash = cash({
      market: "US",
      symbol: "CASH-USD",
      name: "USD 現金",
      price: 100,
      averageCost: 100,
      currency: "USD"
    });

    const next = applyCashLinkedActivity(state(usdCash), {
      id: "auto-usd-deposit",
      date: localDateKey(),
      type: "deposit",
      cashHoldingId: "cash",
      amount: 10,
      fxRate: 25,
      symbol: "",
      note: "",
      time: "10:16",
      capturePreFlowFromCurrentState: true
    });

    expect(next.activities[0]).toMatchObject({
      preFlowValueTwd: 3180,
      preFlowValueSource: "system_current_state",
      fxRate: 31.8
    });
    expect(next.holdings[0]?.price).toBe(110);
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

  it("rejects an automatic boundary when another external flow already uses the same minute", () => {
    const base = state();
    base.activities.push({
      id: "existing-flow",
      date: localDateKey(),
      time: "10:15",
      type: "deposit",
      symbol: "",
      amount: 10,
      currency: "TWD",
      fxRate: 1,
      quantity: 0,
      price: 0,
      note: ""
    });

    expect(() => applyCashLinkedActivity(base, {
      id: "ambiguous-auto",
      date: localDateKey(),
      type: "withdrawal",
      cashHoldingId: "cash",
      amount: 10,
      fxRate: 1,
      symbol: "",
      note: "",
      time: "10:15",
      capturePreFlowFromCurrentState: true
    })).toThrow(/同一分鐘已有入金／出金事件/);
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

  it("moves cash atomically between same-currency accounts without changing total cash value", () => {
    const base = state();
    base.holdings.push(cash({
      id: "cash-2",
      price: 2000,
      averageCost: 2000,
      account: "券商B"
    }));

    const next = applyCashTransfer(base, {
      id: "transfer-a",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-2",
      amount: 1000,
      note: "內部調撥"
    });

    expect(next.holdings.find((item) => item.id === "cash")?.price).toBe(4000);
    expect(next.holdings.find((item) => item.id === "cash-2")?.price).toBe(3000);
    expect(next.holdings.reduce((sum, item) => sum + item.price, 0)).toBe(7000);
    expect(next.activities[0]).toMatchObject({
      type: "transfer",
      amount: 1000,
      currency: "TWD",
      cashTransferImpact: {
        fromCashHoldingId: "cash",
        toCashHoldingId: "cash-2",
        amount: 1000
      }
    });
  });

  it("keeps a source cash account when an internal transfer spends it exactly to zero", () => {
    const base = state(cash({ price: 1000, averageCost: 1000 }));
    base.holdings.push(cash({
      id: "cash-2",
      price: 0,
      averageCost: 0,
      account: "券商B"
    }));

    const next = applyCashTransfer(base, {
      id: "transfer-zero",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-2",
      amount: 1000,
      note: ""
    });

    expect(next.holdings.find((item) => item.id === "cash")).toMatchObject({
      quantity: 1,
      price: 0,
      averageCost: 0
    });
    expect(next.holdings.find((item) => item.id === "cash-2")?.price).toBe(1000);
  });

  it("rejects cross-currency, same-account, historical and insufficient internal transfers", () => {
    const base = state();
    base.holdings.push(cash({
      id: "cash-usd",
      market: "US",
      symbol: "CASH-USD",
      name: "USD 現金",
      price: 100,
      averageCost: 100,
      currency: "USD",
      account: "美股"
    }));

    expect(() => applyCashTransfer(base, {
      id: "cross",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-usd",
      amount: 10,
      note: ""
    })).toThrow(/同幣別/);

    expect(() => applyCashTransfer(base, {
      id: "same",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash",
      amount: 10,
      note: ""
    })).toThrow(/不可相同/);

    expect(() => applyCashTransfer(base, {
      id: "historical-transfer",
      date: "2000-01-01",
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-usd",
      amount: 10,
      note: ""
    })).toThrow(/只允許從今天/);

    const sameCurrency = state();
    sameCurrency.holdings.push(cash({
      id: "cash-2",
      price: 0,
      averageCost: 0,
      account: "券商B"
    }));
    expect(() => applyCashTransfer(sameCurrency, {
      id: "too-much",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-2",
      amount: 6000,
      note: ""
    })).toThrow(/現金不足/);
  });

  it("rolls back both sides of the latest internal transfer exactly", () => {
    const base = state();
    base.holdings.push(cash({
      id: "cash-2",
      price: 2000,
      averageCost: 2000,
      account: "券商B"
    }));
    const next = applyCashTransfer(base, {
      id: "transfer-a",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-2",
      amount: 1000,
      note: ""
    });

    const reverted = revertCashTransfer(next, "transfer-a");
    expect(reverted.holdings).toEqual(base.holdings);
    expect(reverted.activities).toEqual([]);
  });

  it("blocks transfer rollback after either cash account has a later linked event", () => {
    const base = state();
    base.holdings.push(cash({
      id: "cash-2",
      price: 2000,
      averageCost: 2000,
      account: "券商B"
    }));
    const transferred = applyCashTransfer(base, {
      id: "activity-1",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-2",
      amount: 1000,
      note: ""
    });
    const later = applyCashLinkedActivity(transferred, {
      id: "activity-2",
      date: localDateKey(),
      type: "fee",
      cashHoldingId: "cash-2",
      amount: 10,
      fxRate: 1,
      symbol: "",
      note: ""
    });

    expect(() => revertCashTransfer(later, "activity-1")).toThrow(/最新一筆/);
  });

  it("blocks rollback of an older cash event when a later transfer touched that account", () => {
    const base = state();
    base.holdings.push(cash({
      id: "cash-2",
      price: 2000,
      averageCost: 2000,
      account: "券商B"
    }));
    const deposited = applyCashLinkedActivity(base, {
      id: "activity-1",
      date: localDateKey(),
      type: "deposit",
      cashHoldingId: "cash",
      amount: 100,
      fxRate: 1,
      symbol: "",
      note: ""
    });
    const transferred = applyCashTransfer(deposited, {
      id: "activity-2",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-2",
      amount: 100,
      note: ""
    });

    expect(() => revertCashLinkedActivity(transferred, "activity-1")).toThrow(/最新一筆/);
  });

  it("rejects transfer rollback after manual drift on either side", () => {
    const base = state();
    base.holdings.push(cash({
      id: "cash-2",
      price: 2000,
      averageCost: 2000,
      account: "券商B"
    }));
    const transferred = applyCashTransfer(base, {
      id: "transfer-a",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-2",
      amount: 1000,
      note: ""
    });
    const drifted = {
      ...transferred,
      holdings: transferred.holdings.map((item) =>
        item.id === "cash-2" ? { ...item, price: item.price + 1, averageCost: item.averageCost + 1 } : item
      )
    };

    expect(() => revertCashTransfer(drifted, "transfer-a")).toThrow(/手動修改或校正/);
  });

  it("exchanges TWD to USD atomically using the actual TWD/USD execution rate", () => {
    const base = state(cash({ price: 40000, averageCost: 40000 }));
    base.holdings.push(cash({
      id: "cash-usd",
      market: "US",
      symbol: "CASH-USD",
      name: "USD 現金",
      price: 100,
      averageCost: 100,
      currency: "USD",
      account: "美股"
    }));

    const next = applyCashExchange(base, {
      id: "fx-buy-usd",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-usd",
      sourceAmount: 31800,
      rateTwdPerUsd: 31.8,
      fee: 100,
      note: "買美元"
    });

    expect(next.holdings.find((item) => item.id === "cash")?.price).toBe(8100);
    expect(next.holdings.find((item) => item.id === "cash-usd")?.price).toBe(1100);
    expect(next.activities[0]).toMatchObject({
      type: "exchange",
      amount: 31800,
      currency: "TWD",
      cashExchangeImpact: {
        sourceAmount: 31800,
        targetAmount: 1000,
        rateTwdPerUsd: 31.8,
        fee: 100
      }
    });
  });

  it("exchanges USD to TWD atomically and keeps the fee in source currency", () => {
    const usd = cash({
      market: "US",
      symbol: "CASH-USD",
      name: "USD 現金",
      price: 1000,
      averageCost: 1000,
      currency: "USD",
      account: "美股"
    });
    const base = state(usd);
    base.holdings.push(cash({
      id: "cash-twd",
      price: 1000,
      averageCost: 1000,
      account: "台股"
    }));

    const next = applyCashExchange(base, {
      id: "fx-sell-usd",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-twd",
      sourceAmount: 500,
      rateTwdPerUsd: 32,
      fee: 2,
      note: ""
    });

    expect(next.holdings.find((item) => item.id === "cash")?.price).toBe(498);
    expect(next.holdings.find((item) => item.id === "cash-twd")?.price).toBe(17000);
    expect(next.activities[0]?.cashExchangeImpact?.targetAmount).toBe(16000);
    expect(next.activities[0]?.fxRate).toBe(32);
  });

  it("preserves a zero-balance source identity after an exact exchange debit", () => {
    const base = state(cash({ price: 31800, averageCost: 31800 }));
    base.holdings.push(cash({
      id: "cash-usd",
      market: "US",
      symbol: "CASH-USD",
      name: "USD 現金",
      price: 0,
      averageCost: 0,
      currency: "USD",
      account: "美股"
    }));

    const next = applyCashExchange(base, {
      id: "fx-zero",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-usd",
      sourceAmount: 31800,
      rateTwdPerUsd: 31.8,
      fee: 0,
      note: ""
    });

    expect(next.holdings.find((item) => item.id === "cash")).toMatchObject({
      quantity: 1,
      price: 0,
      averageCost: 0
    });
    expect(next.holdings.find((item) => item.id === "cash-usd")?.price).toBe(1000);
  });

  it("rejects same-currency, historical, invalid-rate and insufficient exchanges", () => {
    const sameCurrency = state();
    sameCurrency.holdings.push(cash({
      id: "cash-2",
      price: 1000,
      averageCost: 1000,
      account: "券商B"
    }));

    expect(() => applyCashExchange(sameCurrency, {
      id: "same-currency",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-2",
      sourceAmount: 100,
      rateTwdPerUsd: 31.8,
      fee: 0,
      note: ""
    })).toThrow(/不同幣別/);

    const cross = state();
    cross.holdings.push(cash({
      id: "cash-usd",
      market: "US",
      symbol: "CASH-USD",
      name: "USD 現金",
      price: 0,
      averageCost: 0,
      currency: "USD",
      account: "美股"
    }));

    expect(() => applyCashExchange(cross, {
      id: "historical-fx",
      date: "2000-01-01",
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-usd",
      sourceAmount: 100,
      rateTwdPerUsd: 31.8,
      fee: 0,
      note: ""
    })).toThrow(/只允許從今天/);

    expect(() => applyCashExchange(cross, {
      id: "bad-rate",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-usd",
      sourceAmount: 100,
      rateTwdPerUsd: 0,
      fee: 0,
      note: ""
    })).toThrow(/成交匯率/);

    expect(() => applyCashExchange(cross, {
      id: "too-much-fx",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-usd",
      sourceAmount: 4999,
      rateTwdPerUsd: 31.8,
      fee: 2,
      note: ""
    })).toThrow(/現金不足/);
  });

  it("rolls back both sides of the latest exchange exactly", () => {
    const base = state(cash({ price: 40000, averageCost: 40000 }));
    base.holdings.push(cash({
      id: "cash-usd",
      market: "US",
      symbol: "CASH-USD",
      name: "USD 現金",
      price: 100,
      averageCost: 100,
      currency: "USD",
      account: "美股"
    }));

    const exchanged = applyCashExchange(base, {
      id: "fx",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-usd",
      sourceAmount: 31800,
      rateTwdPerUsd: 31.8,
      fee: 100,
      note: ""
    });
    const reverted = revertCashExchange(exchanged, "fx");

    expect(reverted.holdings).toEqual(base.holdings);
    expect(reverted.activities).toEqual([]);
  });

  it("blocks exchange rollback when either account has a later linked event or manual drift", () => {
    const base = state(cash({ price: 40000, averageCost: 40000 }));
    base.holdings.push(cash({
      id: "cash-usd",
      market: "US",
      symbol: "CASH-USD",
      name: "USD 現金",
      price: 100,
      averageCost: 100,
      currency: "USD",
      account: "美股"
    }));

    const exchanged = applyCashExchange(base, {
      id: "activity-1",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-usd",
      sourceAmount: 3180,
      rateTwdPerUsd: 31.8,
      fee: 0,
      note: ""
    });
    const later = applyCashLinkedActivity(exchanged, {
      id: "activity-2",
      date: localDateKey(),
      type: "fee",
      cashHoldingId: "cash-usd",
      amount: 1,
      fxRate: 31.8,
      symbol: "",
      note: ""
    });
    expect(() => revertCashExchange(later, "activity-1")).toThrow(/最新一筆/);

    const drifted = {
      ...exchanged,
      holdings: exchanged.holdings.map((item) =>
        item.id === "cash-usd" ? { ...item, price: item.price + 1, averageCost: item.averageCost + 1 } : item
      )
    };
    expect(() => revertCashExchange(drifted, "activity-1")).toThrow(/手動修改或校正/);
  });

  it("blocks rollback of older cash events after a later currency exchange", () => {
    const base = state(cash({ price: 40000, averageCost: 40000 }));
    base.holdings.push(cash({
      id: "cash-usd",
      market: "US",
      symbol: "CASH-USD",
      name: "USD 現金",
      price: 100,
      averageCost: 100,
      currency: "USD",
      account: "美股"
    }));

    const deposited = applyCashLinkedActivity(base, {
      id: "activity-1",
      date: localDateKey(),
      type: "deposit",
      cashHoldingId: "cash",
      amount: 100,
      fxRate: 1,
      symbol: "",
      note: ""
    });
    const exchanged = applyCashExchange(deposited, {
      id: "activity-2",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-usd",
      sourceAmount: 100,
      rateTwdPerUsd: 31.8,
      fee: 0,
      note: ""
    });

    expect(() => revertCashLinkedActivity(exchanged, "activity-1")).toThrow(/最新一筆/);
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
