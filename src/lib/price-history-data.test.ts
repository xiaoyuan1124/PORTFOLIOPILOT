import { afterEach, describe, expect, it, vi } from "vitest";

function indexPayload(generatedAt: string) {
  return {
    version: 1,
    universeVersion: 2,
    generatedAt,
    calendarDays: 400,
    startDate: "2025-08-27",
    endDate: "2026-10-01",
    targetEndDate: "2026-10-01",
    markets: {
      TWSE: { symbols: 1, points: 1, buckets: 1 },
      TPEx: { symbols: 0, points: 0, buckets: 0 }
    },
    failed: []
  };
}

function bucketPayload(generatedAt: string, close: number) {
  return {
    version: 1,
    generatedAt,
    market: "TWSE",
    prefix: "23",
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    securities: {
      "2330": {
        name: "台積電",
        points: [["2026-10-01", close]]
      }
    }
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Taiwan price-history client cache", () => {
  it("invalidates an in-memory bucket when the published history generation changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));

    let generation = "generation-1";
    let close = 100;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes("/index.json")
        ? indexPayload(generation)
        : bucketPayload(generation, close);
      return { ok: true, json: async () => payload } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { loadTwPriceHistory } = await import("./price-history-data");

    const first = await loadTwPriceHistory("TWSE", "2330");
    expect(first.points.at(-1)?.[1]).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    close = 999;
    const cached = await loadTwPriceHistory("TWSE", "2330");
    expect(cached.points.at(-1)?.[1]).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    generation = "generation-2";
    close = 101;
    vi.setSystemTime(new Date("2026-10-01T00:01:01Z"));

    const refreshed = await loadTwPriceHistory("TWSE", "2330");
    expect(refreshed.points.at(-1)?.[1]).toBe(101);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("throttles failed generation probes while still using the cached bucket offline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/index.json")) throw new Error("offline");
      return { ok: true, json: async () => bucketPayload("cached-generation", 100) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const { loadTwPriceHistory } = await import("./price-history-data");

    const first = await loadTwPriceHistory("TWSE", "2330");
    const cached = await loadTwPriceHistory("TWSE", "2330");
    vi.setSystemTime(new Date("2026-10-01T00:00:59Z"));
    const stillThrottled = await loadTwPriceHistory("TWSE", "2330");

    expect(first.points.at(-1)?.[1]).toBe(100);
    expect(cached.points.at(-1)?.[1]).toBe(100);
    expect(stillThrottled.points.at(-1)?.[1]).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date("2026-10-01T00:01:01Z"));
    const retried = await loadTwPriceHistory("TWSE", "2330");

    expect(retried.points.at(-1)?.[1]).toBe(100);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
