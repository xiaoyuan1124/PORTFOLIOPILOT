import { describe, expect, it } from "vitest";
import type { AppState } from "./types";
import { localDateKey } from "./calc";
import { recordHistoricalTrade } from "./historical-trade";
import {
  exactTimeWeightedReturn,
  ledgerEconomicsSummary,
  netExternalContributions
} from "./performance";

function state(): AppState {
  return {
    holdings: [{
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
      account: "券商A"
    }],
    etfCompositions: [],
    journal: [],
    activities: [],
    snapshots: [{
      date: "2020-01-01",
      total: 9000,
      cost: 9000,
      gain: 0,
      usdTwd: 30
    }],
    allocationTargets: [],
    usdTwd: 31.8,
    dataMode: "personal"
  };
}

describe("historical ledger-only trades", () => {
  it("records a historical buy without changing current holdings or cash", () => {
    const base = state();
    const next = recordHistoricalTrade(base, {
      id: "old-buy",
      date: "2020-01-02",
      type: "buy",
      market: "TW",
      symbol: "2330",
      account: "券商A",
      quantity: 2,
      price: 500,
      fee: 10,
      tax: 0,
      fxRate: 1,
      note: "補登"
    });

    expect(next.holdings).toEqual(base.holdings);
    expect(next.activities[0]).toMatchObject({
      type: "buy",
      symbol: "2330",
      amount: 1010,
      currency: "TWD",
      fxRate: 1,
      quantity: 2,
      price: 500,
      account: "券商A",
      historicalTrade: {
        mode: "ledger_only",
        market: "TW",
        fee: 10,
        tax: 0
      }
    });
    expect(next.activities[0]?.inventoryImpact).toBeUndefined();
    expect(next.activities[0]?.cashImpact).toBeUndefined();
  });

  it("records a historical sell using net proceeds and explicit historical FX", () => {
    const next = recordHistoricalTrade(state(), {
      id: "old-us-sell",
      date: "2020-01-02",
      type: "sell",
      market: "US",
      symbol: "QQQM",
      account: "美股券商",
      quantity: 2,
      price: 100,
      fee: 1,
      tax: 2,
      fxRate: 29.5,
      note: ""
    });

    expect(next.activities[0]).toMatchObject({
      amount: 197,
      currency: "USD",
      fxRate: 29.5,
      historicalTrade: {
        market: "US",
        fee: 1,
        tax: 2
      }
    });
  });

  it("rejects today, future dates and invalid sell proceeds", () => {
    expect(() => recordHistoricalTrade(state(), {
      id: "today",
      date: localDateKey(),
      type: "buy",
      market: "TW",
      symbol: "2330",
      account: "券商A",
      quantity: 1,
      price: 100,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    })).toThrow(/今天以前/);

    expect(() => recordHistoricalTrade(state(), {
      id: "bad-sell",
      date: "2020-01-02",
      type: "sell",
      market: "TW",
      symbol: "2330",
      account: "券商A",
      quantity: 1,
      price: 10,
      fee: 6,
      tax: 5,
      fxRate: 1,
      note: ""
    })).toThrow(/淨收入必須大於 0/);
  });

  it("does not turn historical trades into external flows or TWR boundaries", () => {
    const next = recordHistoricalTrade(state(), {
      id: "old-buy",
      date: "2020-01-02",
      type: "buy",
      market: "TW",
      symbol: "2330",
      account: "券商A",
      quantity: 2,
      price: 500,
      fee: 10,
      tax: 0,
      fxRate: 1,
      note: ""
    });

    expect(netExternalContributions(next.activities)).toBe(0);
    const twr = exactTimeWeightedReturn(next, localDateKey());
    expect(twr.externalFlowCount).toBe(0);
  });

  it("adds explicitly entered historical fee and tax to cost transparency only", () => {
    const buy = recordHistoricalTrade(state(), {
      id: "old-buy",
      date: "2020-01-02",
      type: "buy",
      market: "TW",
      symbol: "2330",
      account: "券商A",
      quantity: 2,
      price: 500,
      fee: 10,
      tax: 3,
      fxRate: 1,
      note: ""
    });
    const both = recordHistoricalTrade(buy, {
      id: "old-us-sell",
      date: "2020-02-02",
      type: "sell",
      market: "US",
      symbol: "QQQM",
      account: "美股券商",
      quantity: 1,
      price: 100,
      fee: 2,
      tax: 1,
      fxRate: 30,
      note: ""
    });

    const economics = ledgerEconomicsSummary(both.activities);
    expect(economics.tradeFeesTwd).toBe(70);
    expect(economics.tradeTaxesTwd).toBe(33);
  });

  it("rejects duplicate activity IDs and normalizes TWD FX to one", () => {
    const first = recordHistoricalTrade(state(), {
      id: "duplicate",
      date: "2020-01-02",
      type: "buy",
      market: "TW",
      symbol: "2330",
      account: "",
      quantity: 1,
      price: 100,
      fee: 0,
      tax: 0,
      fxRate: 99,
      note: ""
    });
    expect(first.activities[0]?.fxRate).toBe(1);
    expect(first.activities[0]?.account).toBe("預設帳戶");

    expect(() => recordHistoricalTrade(first, {
      id: "duplicate",
      date: "2020-01-03",
      type: "sell",
      market: "TW",
      symbol: "2330",
      account: "券商A",
      quantity: 1,
      price: 100,
      fee: 0,
      tax: 0,
      fxRate: 1,
      note: ""
    })).toThrow(/ID 已存在/);
  });
});
