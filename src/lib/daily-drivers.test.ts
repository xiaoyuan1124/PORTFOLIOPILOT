import { describe, expect, it } from "vitest";
import { buildDailyHoldingDrivers, externalCashFlowForDate, summarizeDailyHoldingDrivers } from "./daily-drivers";
import type { Holding, PortfolioActivity } from "./types";
import type { TwQuoteCache } from "./market-data";

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
    priceSource: "TWSE",
    priceAsOf: "2026-09-30",
    ...patch
  };
}

function cache(quotes: TwQuoteCache["quotes"]): TwQuoteCache {
  return {
    generatedAt: "2026-09-30T05:00:00.000Z",
    sources: [],
    quotes
  };
}

describe("daily portfolio drivers", () => {
  it("estimates held-position impact from official comparable close change", () => {
    const result = buildDailyHoldingDrivers(
      [holding()],
      cache([{
        code: "2330",
        name: "台積電",
        market: "TWSE",
        close: 1010,
        change: 10,
        changePct: 1,
        date: "2026-09-30"
      }])
    );

    expect(result.latestDate).toBe("2026-09-30");
    expect(result.totalImpactTwd).toBe(100);
    expect(result.rows[0]).toMatchObject({
      symbol: "2330",
      venue: "TWSE",
      holdingType: "stock",
      impactTwd: 100,
      changePct: 1
    });
  });

  it("does not mix older venue dates into one daily contribution total", () => {
    const result = buildDailyHoldingDrivers(
      [
        holding(),
        holding({
          id: "h2",
          symbol: "6488",
          name: "環球晶",
          priceSource: "TPEx",
          priceAsOf: "2026-09-29",
          quantity: 2
        })
      ],
      cache([
        {
          code: "2330",
          name: "台積電",
          market: "TWSE",
          close: 1010,
          change: 10,
          changePct: 1,
          date: "2026-09-30"
        },
        {
          code: "6488",
          name: "環球晶",
          market: "TPEx",
          close: 500,
          change: -5,
          changePct: -0.99,
          date: "2026-09-29"
        }
      ])
    );

    expect(result.latestDate).toBe("2026-09-30");
    expect(result.rows).toHaveLength(1);
    expect(result.excludedDifferentDate).toBe(1);
    expect(result.totalImpactTwd).toBe(100);
  });

  it("fails closed on ambiguous same-code venue matches without holding provenance", () => {
    const result = buildDailyHoldingDrivers(
      [holding({ priceSource: undefined, priceAsOf: undefined })],
      cache([
        {
          code: "2330",
          name: "A",
          market: "TWSE",
          close: 100,
          change: 1,
          changePct: 1,
          date: "2026-09-30"
        },
        {
          code: "2330",
          name: "B",
          market: "TPEx",
          close: 100,
          change: 1,
          changePct: 1,
          date: "2026-09-30"
        }
      ])
    );

    expect(result.rows).toHaveLength(0);
    expect(result.unmatchedHoldings).toBe(1);
  });

  it("keeps external cash flow separate from investment movement", () => {
    const activities: PortfolioActivity[] = [
      {
        id: "d1",
        date: "2026-09-30",
        type: "deposit",
        symbol: "",
        amount: 1000,
        currency: "TWD",
        fxRate: 1,
        quantity: 0,
        price: 0,
        note: ""
      },
      {
        id: "w1",
        date: "2026-09-30",
        type: "withdrawal",
        symbol: "",
        amount: 10,
        currency: "USD",
        fxRate: 32,
        quantity: 0,
        price: 0,
        note: ""
      },
      {
        id: "b1",
        date: "2026-09-30",
        type: "buy",
        symbol: "2330",
        amount: 500,
        currency: "TWD",
        fxRate: 1,
        quantity: 1,
        price: 500,
        note: ""
      }
    ];

    expect(externalCashFlowForDate(activities, "2026-09-30")).toEqual({
      count: 2,
      depositsTwd: 1000,
      withdrawalsTwd: 320,
      netTwd: 680
    });
  });

  it("summarizes positive and negative daily contribution without netting away the gross drivers", () => {
    const rows = [
      {
        holdingId: "a",
        symbol: "2330",
        name: "台積電",
        venue: "TWSE" as const,
        holdingType: "stock" as const,
        date: "2026-09-30",
        quantity: 10,
        close: 1010,
        change: 10,
        changePct: 1,
        impactTwd: 100
      },
      {
        holdingId: "b",
        symbol: "00935",
        name: "ETF",
        venue: "TWSE" as const,
        holdingType: "etf" as const,
        date: "2026-09-30",
        quantity: 10,
        close: 20,
        change: -2,
        changePct: -10,
        impactTwd: -20
      }
    ];

    expect(summarizeDailyHoldingDrivers(rows)).toMatchObject({
      positiveImpactTwd: 100,
      negativeImpactTwd: -20,
      netImpactTwd: 80,
      absoluteImpactTwd: 120,
      positiveCount: 1,
      negativeCount: 1,
      flatCount: 0
    });
  });

});
