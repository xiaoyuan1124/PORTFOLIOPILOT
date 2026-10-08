import { describe, expect, it } from "vitest";
import type { Holding } from "./types";
import { applyTwQuotes, cacheFreshnessLabel, cacheMarketFreshness, closingPriceStatusLabel, shouldRejectStaleClosingCache, type TwQuoteCache } from "./market-data";

const holdings: Holding[] = [
  { id: "1", symbol: "2330", name: "台積電", market: "TW", type: "stock", quantity: 2, price: 1000, averageCost: 900, currency: "TWD", sector: "半導體" },
  { id: "2", symbol: "6488", name: "環球晶", market: "TW", type: "stock", quantity: 1, price: 400, averageCost: 350, currency: "TWD", sector: "半導體" },
  { id: "3", symbol: "QQQM", name: "QQQM", market: "US", type: "etf", quantity: 1, price: 300, averageCost: 250, currency: "USD", sector: "美國科技" },
  { id: "4", symbol: "CASH-TWD", name: "現金", market: "TW", type: "cash", quantity: 1, price: 1000, averageCost: 1000, currency: "TWD", sector: "現金" }
];

const cache: TwQuoteCache = {
  generatedAt: "2026-09-27T10:30:00.000Z",
  sources: [
    { name: "TWSE", url: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", fetchedAt: "2026-09-27T10:30:00.000Z" },
    { name: "TPEx", url: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes", fetchedAt: "2026-09-27T10:30:00.000Z" }
  ],
  quotes: [
    { code: "2330", name: "台積電", market: "TWSE", close: 1215, date: "2026-09-27" },
    { code: "6488", name: "環球晶", market: "TPEx", close: 438, date: "2026-09-27" }
  ]
};

describe("official Taiwan quote cache", () => {
  it("updates only TW non-cash holdings", () => {
    const result = applyTwQuotes(holdings, cache);
    expect(result.matched).toBe(2);
    expect(result.updated).toBe(2);
    expect(result.holdings[0]?.price).toBe(1215);
    expect(result.holdings[0]?.priceSource).toBe("TWSE");
    expect(result.holdings[1]?.price).toBe(438);
    expect(result.holdings[1]?.priceSource).toBe("TPEx");
    expect(result.holdings[2]?.price).toBe(300);
    expect(result.holdings[3]?.price).toBe(1000);
  });

  it("does not regress a holding to an older official date", () => {
    const current = [{ ...holdings[0]!, price: 1300, priceSource: "TWSE" as const, priceAsOf: "2026-09-28" }];
    const result = applyTwQuotes(current, cache);
    expect(result.updated).toBe(0);
    expect(result.skippedStale).toBe(1);
    expect(result.holdings[0]?.price).toBe(1300);
    expect(result.holdings[0]?.priceAsOf).toBe("2026-09-28");
  });

  it("uses the holding venue when the same code appears in both markets", () => {
    const duplicateCache: TwQuoteCache = {
      ...cache,
      quotes: [
        { code: "7777", name: "上市同碼", market: "TWSE", close: 100, date: "2026-09-27" },
        { code: "7777", name: "上櫃同碼", market: "TPEx", close: 200, date: "2026-09-27" }
      ]
    };
    const current: Holding[] = [{
      id: "x", symbol: "7777", name: "上櫃同碼", market: "TW", type: "stock",
      quantity: 1, price: 150, averageCost: 120, currency: "TWD", sector: "測試",
      priceSource: "TPEx", priceAsOf: "2026-09-26"
    }];
    const result = applyTwQuotes(current, duplicateCache);
    expect(result.holdings[0]?.price).toBe(200);
    expect(result.holdings[0]?.priceSource).toBe("TPEx");
  });

  it("fails closed on an ambiguous same-code quote without a known venue", () => {
    const duplicateCache: TwQuoteCache = {
      ...cache,
      quotes: [
        { code: "7777", name: "上市同碼", market: "TWSE", close: 100, date: "2026-09-27" },
        { code: "7777", name: "上櫃同碼", market: "TPEx", close: 200, date: "2026-09-27" }
      ]
    };
    const current: Holding[] = [{
      id: "x", symbol: "7777", name: "同碼", market: "TW", type: "stock",
      quantity: 1, price: 150, averageCost: 120, currency: "TWD", sector: "測試"
    }];
    const result = applyTwQuotes(current, duplicateCache);
    expect(result.updated).toBe(0);
    expect(result.skippedAmbiguous).toBe(1);
    expect(result.holdings[0]?.price).toBe(150);
  });

  it("does not overwrite holdings from a future-dated quote", () => {
    const current = [{ ...holdings[0]!, price: 1215, priceSource: "TWSE" as const }];
    const badCache: TwQuoteCache = {
      ...cache,
      quotes: [{ code: "2330", name: "台積電", market: "TWSE", close: 9999, date: "2026-10-09" }]
    };
    const now = new Date("2026-10-08T10:00:00.000Z");
    const result = applyTwQuotes(current, badCache, now);
    expect(result.updated).toBe(0);
    expect(result.skippedInvalidDate).toBe(1);
    expect(result.holdings[0]?.price).toBe(1215);
    expect(cacheMarketFreshness(badCache, now).TWSE).toBeNull();
    expect(cacheFreshnessLabel(badCache, now)).toBe("尚無有效收盤日期");
  });

  it("does not apply an impossible calendar date", () => {
    const invalid: TwQuoteCache = {
      ...cache,
      quotes: [{ code: "2330", name: "台積電", market: "TWSE", close: 9999, date: "2026-02-30" }]
    };
    const result = applyTwQuotes([holdings[0]!], invalid, new Date("2026-10-08T10:00:00.000Z"));
    expect(result.updated).toBe(0);
    expect(result.skippedInvalidDate).toBe(1);
    expect(result.holdings[0]?.price).toBe(1000);
  });

  it("does not arbitrarily select conflicting same-venue quotes", () => {
    const duplicated: TwQuoteCache = {
      ...cache,
      quotes: [
        { code: "2330", name: "台積電", market: "TWSE", close: 1000, date: "2026-10-07" },
        { code: "2330", name: "台積電", market: "TWSE", close: 9999, date: "2026-10-07" }
      ]
    };
    const current = [{ ...holdings[0]!, priceSource: "TWSE" as const }];
    const result = applyTwQuotes(current, duplicated, new Date("2026-10-08T10:00:00.000Z"));
    expect(result.matched).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skippedAmbiguous).toBe(1);
    expect(result.holdings).toEqual(current);
  });

  it("does not let a future date from one market contaminate the other's freshness", () => {
    const split: TwQuoteCache = {
      ...cache,
      quotes: [
        { code: "2330", name: "台積電", market: "TWSE", close: 9999, date: "2026-10-09" },
        { code: "6488", name: "環球晶", market: "TPEx", close: 438, date: "2026-10-07" }
      ]
    };
    expect(cacheMarketFreshness(split, new Date("2026-10-08T10:00:00.000Z"))).toEqual({
      TWSE: null,
      TPEx: "2026-10-07"
    });
  });

  it("does not report unchanged official holdings as updated", () => {
    const current = [
      { ...holdings[0]!, price: 1215, priceSource: "TWSE" as const, priceAsOf: "2026-09-27" },
      { ...holdings[1]!, price: 438, priceSource: "TPEx" as const, priceAsOf: "2026-09-27" }
    ];
    const result = applyTwQuotes(current, cache);

    expect(result.matched).toBe(2);
    expect(result.updated).toBe(0);
  });

  it("reports freshness separately for TWSE and TPEx", () => {
    const split: TwQuoteCache = {
      ...cache,
      quotes: [
        { code: "2330", name: "台積電", market: "TWSE", close: 1215, date: "2026-09-29" },
        { code: "6488", name: "環球晶", market: "TPEx", close: 438, date: "2026-09-28" }
      ]
    };
    expect(cacheMarketFreshness(split)).toEqual({
      TWSE: "2026-09-29",
      TPEx: "2026-09-28"
    });
  });

  it("reports the latest market date", () => {
    expect(cacheFreshnessLabel(cache)).toBe("2026-09-27");
  });

  it("labels the previous close clearly during Taiwan market hours", () => {
    expect(closingPriceStatusLabel("2026-10-05", new Date("2026-10-06T03:30:00.000Z")))
      .toBe("盤中時段 · 最近收盤 2026-10-05");
  });

  it("labels a same-day quote as today's close", () => {
    expect(closingPriceStatusLabel("2026-10-06", new Date("2026-10-06T06:30:00.000Z")))
      .toBe("今日收盤 · 2026-10-06");
  });

  it("labels an older quote generically outside market hours", () => {
    expect(closingPriceStatusLabel("2026-10-05", new Date("2026-10-06T07:00:00.000Z")))
      .toBe("最近收盤 · 2026-10-05");
  });

  it("rejects an older cache after the Taiwan close publishing window", () => {
    expect(shouldRejectStaleClosingCache(cache, new Date("2026-09-29T07:30:00.000Z"))).toBe(true);
  });

  it("allows an older trading date when the cache itself was refreshed today", () => {
    const holidayCache: TwQuoteCache = {
      ...cache,
      generatedAt: "2026-09-29T10:30:00.000Z",
      quotes: cache.quotes.map((quote) => ({ ...quote, date: "2026-09-28" }))
    };
    expect(shouldRejectStaleClosingCache(holidayCache, new Date("2026-09-29T12:00:00.000Z"))).toBe(false);
  });

  it("allows the previous close before the Taiwan publishing window", () => {
    expect(shouldRejectStaleClosingCache(cache, new Date("2026-09-28T04:00:00.000Z"))).toBe(false);
  });

  it("allows Friday close data during the weekend", () => {
    expect(shouldRejectStaleClosingCache(cache, new Date("2026-10-03T12:00:00.000Z"))).toBe(false);
  });
});
