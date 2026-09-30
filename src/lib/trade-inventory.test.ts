import { describe, expect, it } from "vitest";
import type { AppState, Holding } from "./types";
import {
  applyManagedTrade,
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

function state(baseHolding = holding()): AppState {
  return {
    holdings: [baseHolding],
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
  it("applies a buy using weighted-average cost including fees", () => {
    const next = applyManagedTrade(state(), {
      id: "buy-1",
      date: "2026-09-30",
      type: "buy",
      holdingId: "h1",
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
      }
    });
  });

  it("applies a partial sell and preserves the remaining average cost", () => {
    const next = applyManagedTrade(state(), {
      id: "sell-1",
      date: "2026-09-30",
      type: "sell",
      holdingId: "h1",
      quantity: 4,
      price: 1000,
      fee: 20,
      tax: 12,
      fxRate: 1,
      note: ""
    });

    expect(next.holdings[0]?.quantity).toBe(6);
    expect(next.holdings[0]?.averageCost).toBe(900);
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
      quantity: 10,
      price: 950,
      fee: 10,
      tax: 20,
      fxRate: 1,
      note: ""
    });

    expect(sold.holdings).toHaveLength(0);

    const reverted = revertManagedTrade(sold, "sell-all");
    expect(reverted.holdings).toEqual([holding()]);
    expect(reverted.activities).toHaveLength(0);
  });

  it("rejects overselling", () => {
    expect(() => applyManagedTrade(state(), {
      id: "bad",
      date: "2026-09-30",
      type: "sell",
      holdingId: "h1",
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
      quantity: 1,
      price: 900,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    });

    const drifted = {
      ...bought,
      holdings: bought.holdings.map((item) => ({ ...item, quantity: item.quantity + 1 }))
    };

    expect(() => revertManagedTrade(drifted, "buy")).toThrow(/手動修改或校正/);
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
