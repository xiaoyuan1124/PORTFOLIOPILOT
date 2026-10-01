import { describe, expect, it } from "vitest";
import {
  isTransientTwseRequestError,
  parseTwseTaiexPrice,
  parseTwseTaiexTotalReturn,
  retryTransientTwseRequest,
  rocDateToIso,
  rollingMonthStarts,
  twseMonthUrl,
  twsePriceMonthUrl
} from "./benchmark-data.mjs";

describe("TWSE TAIEX total-return benchmark parser", () => {
  it("converts ROC dates", () => {
    expect(rocDateToIso("115/09/24")).toBe("2026-09-24");
    expect(rocDateToIso("bad")).toBeNull();
  });

  it("parses official MFI94U rows and rejects invalid values", () => {
    expect(parseTwseTaiexTotalReturn({
      stat: "OK",
      data: [
        ["115/09/23", "111,356.64"],
        ["115/09/24", "111,049.87"],
        ["bad", "1"],
        ["115/09/25", "--"]
      ]
    })).toEqual([
      { date: "2026-09-23", value: 111356.64 },
      { date: "2026-09-24", value: 111049.87 }
    ]);
  });

  it("parses official FMTQIK TAIEX price-index rows by field name", () => {
    expect(parseTwseTaiexPrice({
      stat: "OK",
      fields: ["日期", "成交股數", "發行量加權股價指數", "漲跌點數"],
      data: [
        ["115/09/23", "1,000", "48,157.29", "100"],
        ["115/09/24", "1,200", "48,024.60", "-132.69"],
        ["bad", "1", "1", "0"]
      ]
    })).toEqual([
      { date: "2026-09-23", value: 48157.29 },
      { date: "2026-09-24", value: 48024.6 }
    ]);
  });

  it("builds deterministic rolling month requests", () => {
    expect(rollingMonthStarts(new Date("2026-09-27T00:00:00Z"), 3)).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01"
    ]);
    expect(twseMonthUrl("2026-09-01")).toContain("date=20260901");
    expect(twsePriceMonthUrl("2026-09-01")).toContain("FMTQIK");
  });
});

describe("TWSE benchmark transient retry", () => {
  it("retries transient network errors with bounded exponential backoff", async () => {
    let calls = 0;
    const sleeps = [];
    const result = await retryTransientTwseRequest(
      async () => {
        calls += 1;
        if (calls < 3) {
          const error = new TypeError("fetch failed");
          error.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
          throw error;
        }
        return "ok";
      },
      {
        attempts: 4,
        baseDelayMs: 100,
        sleepImpl: async (ms) => { sleeps.push(ms); }
      }
    );

    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it("retries HTTP 429 and 5xx but not ordinary 4xx", () => {
    expect(isTransientTwseRequestError(Object.assign(new Error("rate limit"), { status: 429 }))).toBe(true);
    expect(isTransientTwseRequestError(Object.assign(new Error("server"), { status: 503 }))).toBe(true);
    expect(isTransientTwseRequestError(Object.assign(new Error("bad request"), { status: 400 }))).toBe(false);
  });

  it("does not retry parser or completeness failures", async () => {
    let calls = 0;
    await expect(retryTransientTwseRequest(
      async () => {
        calls += 1;
        throw new Error("TWSE MFI94U returned no valid rows");
      },
      { sleepImpl: async () => {} }
    )).rejects.toThrow(/no valid rows/);
    expect(calls).toBe(1);
  });
});
