import { describe, expect, it } from "vitest";
import type { AppState, Holding } from "./types";
import { localDateKey } from "./calc";
import { applyCashLinkedActivity } from "./cash-account";
import {
  applyCashFxConversion,
  executionTwdPerUsd,
  revertCashFxConversion
} from "./cash-fx";

function cash(
  id: string,
  currency: "TWD" | "USD",
  balance: number,
  account: string
): Holding {
  return {
    id,
    symbol: `CASH-${currency}`,
    name: `${currency} 現金`,
    market: currency === "USD" ? "US" : "TW",
    type: "cash",
    quantity: 1,
    price: balance,
    averageCost: balance,
    currency,
    sector: "現金",
    account
  };
}

function state(): AppState {
  return {
    holdings: [
      cash("twd", "TWD", 10000, "台幣帳戶"),
      cash("usd", "USD", 100, "美元帳戶")
    ],
    etfCompositions: [],
    journal: [],
    activities: [],
    snapshots: [],
    allocationTargets: [],
    usdTwd: 31.8,
    dataMode: "personal"
  };
}

describe("internal FX conversion", () => {
  it("converts TWD to USD atomically using explicit debit and credit amounts", () => {
    const next = applyCashFxConversion(state(), {
      id: "fx-1",
      date: localDateKey(),
      fromCashHoldingId: "twd",
      toCashHoldingId: "usd",
      fromAmount: 3250,
      toAmount: 100,
      note: "換美元"
    });

    expect(next.holdings.find((item) => item.id === "twd")).toMatchObject({
      price: 6750,
      averageCost: 6750
    });
    expect(next.holdings.find((item) => item.id === "usd")).toMatchObject({
      price: 200,
      averageCost: 200
    });
    expect(next.activities[0]).toMatchObject({
      type: "fx_conversion",
      amount: 3250,
      currency: "TWD",
      fxRate: 32.5,
      cashFxImpact: {
        fromAmount: 3250,
        toAmount: 100,
        executionTwdPerUsd: 32.5,
        valuationTwdPerUsd: 31.8
      }
    });
  });

  it("converts USD to TWD and derives the same TWD-per-USD quote direction", () => {
    const next = applyCashFxConversion(state(), {
      id: "fx-2",
      date: localDateKey(),
      fromCashHoldingId: "usd",
      toCashHoldingId: "twd",
      fromAmount: 50,
      toAmount: 1575,
      note: ""
    });

    expect(next.activities[0]?.fxRate).toBe(31.5);
    expect(next.activities[0]?.cashFxImpact?.executionTwdPerUsd).toBe(31.5);
    expect(next.holdings.find((item) => item.id === "usd")?.price).toBe(50);
    expect(next.holdings.find((item) => item.id === "twd")?.price).toBe(11575);
  });

  it("derives TWD per USD from either conversion direction", () => {
    expect(executionTwdPerUsd("TWD", 3200, 100)).toBe(32);
    expect(executionTwdPerUsd("USD", 100, 3200)).toBe(32);
  });

  it("rejects same-currency accounts and insufficient source cash", () => {
    const same = state();
    same.holdings.push(cash("twd-2", "TWD", 5000, "另一台幣帳戶"));

    expect(() => applyCashFxConversion(same, {
      id: "bad-same",
      date: localDateKey(),
      fromCashHoldingId: "twd",
      toCashHoldingId: "twd-2",
      fromAmount: 1000,
      toAmount: 1000,
      note: ""
    })).toThrow(/同幣別帳戶請使用內部轉帳/);

    expect(() => applyCashFxConversion(state(), {
      id: "bad-cash",
      date: localDateKey(),
      fromCashHoldingId: "usd",
      toCashHoldingId: "twd",
      fromAmount: 101,
      toAmount: 3200,
      note: ""
    })).toThrow(/現金不足/);
  });

  it("rejects historical replay into current cash balances", () => {
    expect(() => applyCashFxConversion(state(), {
      id: "historical",
      date: "2000-01-01",
      fromCashHoldingId: "twd",
      toCashHoldingId: "usd",
      fromAmount: 3200,
      toAmount: 100,
      note: ""
    })).toThrow(/只允許從今天/);
  });

  it("reverts both cash accounts exactly when no later dependency exists", () => {
    const base = state();
    const converted = applyCashFxConversion(base, {
      id: "fx-revert",
      date: localDateKey(),
      fromCashHoldingId: "twd",
      toCashHoldingId: "usd",
      fromAmount: 3200,
      toAmount: 100,
      note: ""
    });
    const reverted = revertCashFxConversion(converted, "fx-revert");

    expect(reverted.holdings).toEqual(base.holdings);
    expect(reverted.activities).toEqual([]);
  });

  it("rejects rollback after either cash account has a later linked event", () => {
    const converted = applyCashFxConversion(state(), {
      id: "activity-1",
      date: localDateKey(),
      fromCashHoldingId: "twd",
      toCashHoldingId: "usd",
      fromAmount: 3200,
      toAmount: 100,
      note: ""
    });
    const later = applyCashLinkedActivity(converted, {
      id: "activity-2",
      date: localDateKey(),
      type: "fee",
      cashHoldingId: "usd",
      amount: 1,
      fxRate: 31.8,
      symbol: "",
      note: ""
    });

    expect(() => revertCashFxConversion(later, "activity-1")).toThrow(/最新一筆/);
  });

  it("rejects rollback after manual cash drift", () => {
    const converted = applyCashFxConversion(state(), {
      id: "fx-drift",
      date: localDateKey(),
      fromCashHoldingId: "twd",
      toCashHoldingId: "usd",
      fromAmount: 3200,
      toAmount: 100,
      note: ""
    });
    const drifted = {
      ...converted,
      holdings: converted.holdings.map((item) =>
        item.id === "usd"
          ? { ...item, price: item.price + 1, averageCost: item.averageCost + 1 }
          : item
      )
    };

    expect(() => revertCashFxConversion(drifted, "fx-drift")).toThrow(/手動修改或校正/);
  });
});
