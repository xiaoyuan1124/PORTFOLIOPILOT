import { describe, expect, it } from "vitest";
import type { AppState, Holding } from "./types";
import { localDateKey } from "./calc";
import { applyCashTransfer } from "./cash-account";
import {
  applyManagedTrade,
  applyOpeningBuy,
  realizedManagedTradePnlTwd,
  revertManagedTrade
} from "./trade-inventory";

function holding(patch: Partial<Holding> = {}): Holding {
  return {
    id: "h1",
    symbol: "2330",
    name: "台積電",
    market: "TW",
    type: "stock",
    quantity: 10,
    price: 1000,
    averageCost: 900,
    currency: "TWD",
    sector: "半導體",
    account: "券商A",
    priceSource: "TWSE",
    priceAsOf: "2026-09-30",
    ...patch
  };
}

function cashFor(baseHolding: Holding): Holding {
  return {
    id: "cash",
    symbol: `CASH-${baseHolding.currency}`,
    name: `${baseHolding.currency} 現金`,
    market: baseHolding.currency === "USD" ? "US" : "TW",
    type: "cash",
    quantity: 1,
    price: 10000,
    averageCost: 10000,
    currency: baseHolding.currency,
    sector: "現金",
    account: "交易現金"
  };
}

function state(baseHolding = holding()): AppState {
  return {
    holdings: [baseHolding, cashFor(baseHolding)],
    etfCompositions: [],
    journal: [],
    activities: [],
    snapshots: [],
    allocationTargets: [],
    usdTwd: 31.8,
    dataMode: "personal"
  };
}

describe("managed trade inventory", () => {
  it("opens a brand-new Taiwan position and deducts cash atomically", () => {
    const base = state();
    base.holdings = [cashFor(holding())];

    const next = applyOpeningBuy(base, {
      id: "open-2330",
      date: "2026-09-30",
      cashHoldingId: "cash",
      position: {
        id: "holding-open-2330",
        symbol: "2330",
        name: "台積電",
        market: "TW",
        type: "stock",
        price: 1000,
        currency: "TWD",
        sector: "半導體",
        account: "交易現金",
        priceSource: "TWSE",
        priceAsOf: "2026-09-30"
      },
      quantity: 2,
      price: 990,
      fee: 20,
      tax: 0,
      fxRate: 1,
      note: ""
    });

    expect(next.holdings.find((item) => item.id === "holding-open-2330")).toMatchObject({
      symbol: "2330",
      quantity: 2,
      averageCost: 1000,
      price: 1000,
      priceSource: "TWSE",
      priceAsOf: "2026-09-30"
    });
    expect(next.holdings.find((item) => item.id === "cash")?.price).toBe(8000);
    expect(next.activities[0]).toMatchObject({
      type: "buy",
      amount: 2000,
      inventoryImpact: {
        kind: "trade",
        before: null,
        holdingId: "holding-open-2330"
      },
      cashImpact: {
        delta: -2000,
        reason: "trade"
      }
    });

    const reverted = revertManagedTrade(next, "open-2330");
    expect(reverted.holdings.some((item) => item.id === "holding-open-2330")).toBe(false);
    expect(reverted.holdings.find((item) => item.id === "cash")?.price).toBe(10000);
  });

  it("rejects opening a duplicate market-symbol-account position", () => {
    const base = state();
    expect(() => applyOpeningBuy(base, {
      id: "duplicate",
      date: "2026-09-30",
      cashHoldingId: "cash",
      position: {
        id: "new-id",
        symbol: "2330",
        name: "台積電",
        market: "TW",
        type: "stock",
        price: 1000,
        currency: "TWD",
        sector: "半導體",
        account: "券商A",
        priceSource: "TWSE",
        priceAsOf: "2026-09-30"
      },
      quantity: 1,
      price: 1000,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    })).toThrow(/已存在/);
  });

  it("rejects opening a position when cash currency does not match", () => {
    const base = state();
    expect(() => applyOpeningBuy(base, {
      id: "wrong-currency-open",
      date: "2026-09-30",
      cashHoldingId: "cash",
      position: {
        id: "us-new",
        symbol: "QQQM",
        name: "QQQM",
        market: "US",
        type: "etf",
        price: 250,
        currency: "USD",
        sector: "ETF",
        account: "交易現金"
      },
      quantity: 1,
      price: 250,
      fee: 0,
      tax: 0,
      fxRate: 31.5,
      note: ""
    })).toThrow(/不可連動 TWD/);
  });

  it("rejects opening a position when linked cash is insufficient", () => {
    const base = state();
    base.holdings = [cashFor(holding())];

    expect(() => applyOpeningBuy(base, {
      id: "too-large-open",
      date: "2026-09-30",
      cashHoldingId: "cash",
      position: {
        id: "new",
        symbol: "2454",
        name: "聯發科",
        market: "TW",
        type: "stock",
        price: 1500,
        currency: "TWD",
        sector: "半導體",
        account: "交易現金"
      },
      quantity: 10,
      price: 1500,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    })).toThrow(/現金不足/);
  });
  it("applies a buy using weighted-average cost including fees", () => {
    const next = applyManagedTrade(state(), {
      id: "buy-1",
      date: "2026-09-30",
      type: "buy",
      holdingId: "h1",
      cashHoldingId: "cash",
      quantity: 2,
      price: 990,
      fee: 20,
      tax: 0,
      fxRate: 1,
      note: ""
    });

    expect(next.holdings[0]?.quantity).toBe(12);
    expect(next.holdings[0]?.averageCost).toBeCloseTo((9000 + 1980 + 20) / 12, 8);
    expect(next.holdings[0]?.price).toBe(1000);
    expect(next.holdings[0]?.priceSource).toBe("TWSE");
    expect(next.holdings.find((item) => item.id === "cash")?.price).toBe(8000);
    expect(next.activities[0]).toMatchObject({
      type: "buy",
      amount: 2000,
      currency: "TWD",
      quantity: 2,
      price: 990,
      inventoryImpact: {
        fee: 20,
        tax: 0,
        realizedPnl: 0,
        method: "average_cost"
      },
      cashImpact: {
        cashHoldingId: "cash",
        delta: -2000,
        reason: "trade"
      }
    });
  });

  it("applies a partial sell and preserves the remaining average cost", () => {
    const next = applyManagedTrade(state(), {
      id: "sell-1",
      date: "2026-09-30",
      type: "sell",
      holdingId: "h1",
      cashHoldingId: "cash",
      quantity: 4,
      price: 1000,
      fee: 20,
      tax: 12,
      fxRate: 1,
      note: ""
    });

    expect(next.holdings[0]?.quantity).toBe(6);
    expect(next.holdings[0]?.averageCost).toBe(900);
    expect(next.holdings.find((item) => item.id === "cash")?.price).toBe(13968);
    expect(next.activities[0]?.amount).toBe(3968);
    const impact = next.activities[0]?.inventoryImpact;
    expect(impact?.kind).toBe("trade");
    if (impact?.kind !== "trade") throw new Error("Expected trade inventory impact");
    expect(impact.realizedPnl).toBe(368);
    expect(realizedManagedTradePnlTwd(next.activities)).toBe(368);
  });

  it("removes a fully sold holding and can restore it by reverting the latest linked trade", () => {
    const sold = applyManagedTrade(state(), {
      id: "sell-all",
      date: "2026-09-30",
      type: "sell",
      holdingId: "h1",
      cashHoldingId: "cash",
      quantity: 10,
      price: 950,
      fee: 10,
      tax: 20,
      fxRate: 1,
      note: ""
    });

    expect(sold.holdings.some((item) => item.id === "h1")).toBe(false);
    expect(sold.holdings.find((item) => item.id === "cash")?.price).toBe(19470);

    const reverted = revertManagedTrade(sold, "sell-all");
    expect([...reverted.holdings].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [holding(), cashFor(holding())].sort((a, b) => a.id.localeCompare(b.id))
    );
    expect(reverted.activities).toHaveLength(0);
  });

  it("rejects overselling", () => {
    expect(() => applyManagedTrade(state(), {
      id: "bad",
      date: "2026-09-30",
      type: "sell",
      holdingId: "h1",
      cashHoldingId: "cash",
      quantity: 11,
      price: 1000,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    })).toThrow(/超過目前持有/);
  });

  it("rejects rollback after a later linked trade on the same holding", () => {
    const first = applyManagedTrade(state(), {
      id: "a",
      date: "2026-09-29",
      type: "buy",
      holdingId: "h1",
      cashHoldingId: "cash",
      quantity: 1,
      price: 900,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    });
    const second = applyManagedTrade(first, {
      id: "b",
      date: "2026-09-30",
      type: "sell",
      holdingId: "h1",
      cashHoldingId: "cash",
      quantity: 1,
      price: 950,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    });

    expect(() => revertManagedTrade(second, "a")).toThrow(/最新一筆/);
  });

  it("rejects rollback if the current holding drifted from the stored post-trade snapshot", () => {
    const bought = applyManagedTrade(state(), {
      id: "buy",
      date: "2026-09-30",
      type: "buy",
      holdingId: "h1",
      cashHoldingId: "cash",
      quantity: 1,
      price: 900,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    });

    const drifted = {
      ...bought,
      holdings: bought.holdings.map((item) => item.id === "h1" ? { ...item, quantity: item.quantity + 1 } : item)
    };

    expect(() => revertManagedTrade(drifted, "buy")).toThrow(/手動修改或校正/);
  });

  it("keeps the linked cash account when a buy uses the balance exactly", () => {
    const exact = state();
    exact.holdings = exact.holdings.map((item) =>
      item.id === "cash" ? { ...item, price: 1000, averageCost: 1000 } : item
    );

    const next = applyManagedTrade(exact, {
      id: "exact-cash",
      date: "2026-09-30",
      type: "buy",
      holdingId: "h1",
      cashHoldingId: "cash",
      quantity: 1,
      price: 1000,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    });

    expect(next.holdings.find((item) => item.id === "cash")).toMatchObject({
      quantity: 1,
      price: 0,
      averageCost: 0
    });

    const reverted = revertManagedTrade(next, "exact-cash");
    expect(reverted.holdings.find((item) => item.id === "cash")?.price).toBe(1000);
  });

  it("rejects a buy when linked cash is insufficient", () => {
    expect(() => applyManagedTrade(state(), {
      id: "too-expensive",
      date: "2026-09-30",
      type: "buy",
      holdingId: "h1",
      cashHoldingId: "cash",
      quantity: 20,
      price: 1000,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    })).toThrow(/現金不足/);
  });

  it("rejects a linked cash account with the wrong currency", () => {
    const mixed = state();
    mixed.holdings[1] = {
      ...mixed.holdings[1]!,
      market: "US",
      currency: "USD",
      symbol: "CASH-USD",
      name: "USD 現金"
    };

    expect(() => applyManagedTrade(mixed, {
      id: "wrong-currency",
      date: "2026-09-30",
      type: "buy",
      holdingId: "h1",
      cashHoldingId: "cash",
      quantity: 1,
      price: 1000,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    })).toThrow(/不可連動 USD/);
  });

  it("rejects trade rollback after later activity on the same cash account", () => {
    const bought = applyManagedTrade(state(), {
      id: "a",
      date: "2026-09-29",
      type: "buy",
      holdingId: "h1",
      cashHoldingId: "cash",
      quantity: 1,
      price: 900,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    });

    bought.activities.push({
      id: "b",
      date: "2026-09-30",
      type: "fee",
      symbol: "",
      amount: 10,
      currency: "TWD",
      fxRate: 1,
      quantity: 0,
      price: 0,
      note: "",
      account: "交易現金",
      cashImpact: {
        cashHoldingId: "cash",
        before: bought.holdings.find((item) => item.id === "cash")!,
        after: { ...bought.holdings.find((item) => item.id === "cash")!, price: 9090, averageCost: 9090 },
        delta: -10,
        reason: "fee"
      }
    });

    expect(() => revertManagedTrade(bought, "a")).toThrow(/現金帳戶後面已有/);
  });

  it("rejects trade rollback after a later internal transfer touched its cash account", () => {
    const base = state();
    base.holdings.push({
      ...cashFor(holding()),
      id: "cash-2",
      price: 2000,
      averageCost: 2000,
      account: "券商B"
    });

    const bought = applyManagedTrade(base, {
      id: "activity-1",
      date: localDateKey(),
      type: "buy",
      holdingId: "h1",
      cashHoldingId: "cash",
      quantity: 1,
      price: 900,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    });

    const transferred = applyCashTransfer(bought, {
      id: "activity-2",
      date: localDateKey(),
      fromCashHoldingId: "cash",
      toCashHoldingId: "cash-2",
      amount: 100,
      note: ""
    });

    expect(() => revertManagedTrade(transferred, "activity-1")).toThrow(/現金帳戶後面已有/);
  });

  it("converts realized USD P&L using the saved historical FX rate", () => {
    const us = state(holding({
      id: "us",
      symbol: "QQQM",
      name: "QQQM",
      market: "US",
      type: "etf",
      quantity: 2,
      price: 250,
      averageCost: 200,
      currency: "USD",
      sector: "ETF",
      account: "複委託",
      priceSource: undefined,
      priceAsOf: undefined
    }));

    const sold = applyManagedTrade(us, {
      id: "usd-sell",
      date: "2026-09-30",
      type: "sell",
      holdingId: "us",
      cashHoldingId: "cash",
      quantity: 1,
      price: 260,
      fee: 1,
      tax: 0,
      fxRate: 31.5,
      note: ""
    });

    const impact = sold.activities[0]?.inventoryImpact;
    expect(impact?.kind).toBe("trade");
    if (impact?.kind !== "trade") throw new Error("Expected trade inventory impact");
    expect(impact.realizedPnl).toBe(59);
    expect(realizedManagedTradePnlTwd(sold.activities)).toBeCloseTo(1858.5, 8);
  });
});
