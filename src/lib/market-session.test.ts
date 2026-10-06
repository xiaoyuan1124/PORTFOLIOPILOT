import { describe, expect, it } from "vitest";
import type { TwQuoteCache } from "./market-data";
import { taiwanMarketStatus } from "./market-session";

const cache: TwQuoteCache = {
  generatedAt: "2026-10-05T08:00:00.000Z",
  sources: [],
  quotes: [
    { code: "2330", name: "台積電", market: "TWSE", close: 1000, date: "2026-10-05" },
    { code: "6488", name: "環球晶", market: "TPEx", close: 500, date: "2026-10-05" }
  ]
};

describe("Taiwan market status", () => {
  it("labels weekday market hours without pretending the previous close is live", () => {
    const result = taiwanMarketStatus(cache, new Date("2026-10-06T03:00:00.000Z"));
    expect(result.phase).toBe("market_hours");
    expect(result.label).toBe("盤中時段");
    expect(result.latestOfficialDate).toBe("2026-10-05");
    expect(result.sameDayCloseAvailable).toBe(false);
  });

  it("labels the immediate post-close window while waiting for official close", () => {
    const result = taiwanMarketStatus(cache, new Date("2026-10-06T06:00:00.000Z"));
    expect(result.phase).toBe("post_close_refresh");
    expect(result.label).toBe("收盤資料更新中");
  });

  it("recognizes a same-day official close", () => {
    const current: TwQuoteCache = {
      ...cache,
      generatedAt: "2026-10-06T06:00:00.000Z",
      quotes: cache.quotes.map((quote) => ({ ...quote, date: "2026-10-06" }))
    };
    const result = taiwanMarketStatus(current, new Date("2026-10-06T06:30:00.000Z"));
    expect(result.phase).toBe("closed");
    expect(result.label).toBe("今日收盤已更新");
    expect(result.sameDayCloseAvailable).toBe(true);
  });

  it("keeps TWSE and TPEx dates separate when one market lags", () => {
    const split: TwQuoteCache = {
      ...cache,
      quotes: [
        { code: "2330", name: "台積電", market: "TWSE", close: 1000, date: "2026-10-06" },
        { code: "6488", name: "環球晶", market: "TPEx", close: 500, date: "2026-10-05" }
      ]
    };
    const result = taiwanMarketStatus(split, new Date("2026-10-06T06:30:00.000Z"));
    expect(result.twseDate).toBe("2026-10-06");
    expect(result.tpexDate).toBe("2026-10-05");
    expect(result.latestOfficialDate).toBe("2026-10-06");
  });

  it("labels weekends separately", () => {
    const result = taiwanMarketStatus(cache, new Date("2026-10-10T03:00:00.000Z"));
    expect(result.phase).toBe("weekend");
    expect(result.label).toBe("週末／非平日");
  });
});
