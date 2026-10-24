import { describe, expect, it } from "vitest";
import { parseStrategyOhlcv, strategyCandlesFromCache, strategyOhlcvMissingMonths } from "./strategy-ohlcv-data";
const base = {
  version: 1,
  generatedAt: "2026-10-24T00:00:00.000Z",
  source: {
    name: "TWSE", urlTemplate: "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=YYYYMM01&stockNo=SYMBOL",
    adjusted: false, volumeUnit: "shares"
  },
  securities: {
    "2317": { market: "TWSE", points: [
      ["2026-10-22", 200, 210, 198, 205, 100000],
      ["2026-10-23", 205, 208, 199, 203, 300000]
    ]}
  },
  failed: []
};
describe("Strategy Lab official OHLCV reader", () => {
  it("validates exact market candles and maps real high low and shares", () => {
    const data = parseStrategyOhlcv(base);
    expect(strategyCandlesFromCache(data, "TWSE", "2317")).toEqual([
      { date: "2026-10-22", open: 200, high: 210, low: 198, close: 205, volume: 100000 },
      { date: "2026-10-23", open: 205, high: 208, low: 199, close: 203, volume: 300000 }
    ]);
    expect(strategyCandlesFromCache(data, "TPEx", "2317")).toBeNull();
    expect(strategyCandlesFromCache(data, "TWSE", "2345")).toBeNull();
  });
  it("rejects impossible OHLC observations and unverified volume units", () => {
    expect(() => parseStrategyOhlcv({ ...base, securities: { "2317": { market: "TWSE", points: [["2026-10-23", 205, 199, 198, 203, 1000]] } } })).toThrow();
    expect(() => parseStrategyOhlcv({ ...base, source: { ...base.source, volumeUnit: "lots" } })).toThrow();
  });
  it("blocks a single incomplete stock without hiding other verified symbols", () => {
    const data = parseStrategyOhlcv({
      ...base,
      failed: [
        { symbol: "3037", month: "2026-02", reason: "HTTP 307" },
        { symbol: "3037", month: "2026-03", reason: "HTTP 307" }
      ]
    });
    expect(strategyOhlcvMissingMonths(data, "TWSE", "3037")).toEqual(["2026-02", "2026-03"]);
    expect(strategyOhlcvMissingMonths(data, "TWSE", "2317")).toEqual([]);
    expect(strategyOhlcvMissingMonths(data, "TPEx", "3037")).toEqual([]);
  });
  it("accepts deliberately empty no-fake-price cache", () => {
    const data = parseStrategyOhlcv({ ...base, securities: {} });
    expect(strategyCandlesFromCache(data, "TWSE", "2317")).toBeNull();
  });
});
