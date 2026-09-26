import { describe, expect, it } from "vitest";
import type { Holding } from "./types";
import { applyTwQuotes, cacheFreshnessLabel, type TwQuoteCache } from "./market-data";

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
    expect(result.updated).toBe(2);
    expect(result.holdings[0]?.price).toBe(1215);
    expect(result.holdings[0]?.priceSource).toBe("TWSE");
    expect(result.holdings[1]?.price).toBe(438);
    expect(result.holdings[1]?.priceSource).toBe("TPEx");
    expect(result.holdings[2]?.price).toBe(300);
    expect(result.holdings[3]?.price).toBe(1000);
  });

  it("reports the latest market date", () => {
    expect(cacheFreshnessLabel(cache)).toBe("2026-09-27");
  });
});
