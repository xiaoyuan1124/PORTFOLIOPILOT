import { describe, expect, it } from "vitest";
import { applyHeldEtfCompositions, type EtfCompositionCache } from "./etf-composition-data";
import type { EtfComposition, Holding } from "./types";

const held: Holding[] = [
  { id: "a", symbol: "009816", name: "凱基台灣TOP50", market: "TW", type: "etf", quantity: 10, price: 10, averageCost: 9, currency: "TWD", sector: "ETF" },
  { id: "b", symbol: "00935", name: "野村臺灣新科技50", market: "TW", type: "etf", quantity: 10, price: 10, averageCost: 9, currency: "TWD", sector: "ETF" },
  { id: "c", symbol: "QQQM", name: "QQQM", market: "US", type: "etf", quantity: 1, price: 300, averageCost: 250, currency: "USD", sector: "ETF" }
];

function composition(symbol: string, asOf: string, sourceType: EtfComposition["sourceType"] = "official_issuer"): EtfComposition {
  return {
    id: `composition:TW:${symbol}`,
    etfMarket: "TW",
    etfSymbol: symbol,
    etfName: symbol === "00935" ? "野村臺灣新科技50" : "凱基台灣TOP50",
    asOf,
    sourceName: "official",
    sourceUrl: "https://example.com",
    sourceType,
    constituents: [
      { market: "TW", symbol: "2330", name: "台積電", weightPct: 40, sector: "半導體" },
      { market: "TW", symbol: "2454", name: "聯發科", weightPct: 5, sector: "半導體" }
    ]
  };
}

function cache(
  items: EtfComposition[],
  sources: EtfCompositionCache["sources"] = items.map((item) => ({
    symbol: item.etfSymbol,
    name: item.etfName,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    fetchedAt: "2026-10-01T10:00:00.000Z",
    status: "ok" as const
  }))
): EtfCompositionCache {
  return {
    generatedAt: "2026-10-01T10:00:00.000Z",
    sources,
    compositions: items
  };
}

describe("held ETF automatic composition refresh", () => {
  it("only applies bundled compositions for held Taiwan ETFs", () => {
    const result = applyHeldEtfCompositions([], held, cache([
      composition("009816", "2026-10-01"),
      composition("0050", "2026-10-01")
    ]));
    expect(result.matched).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.supported).toBe(1);
    expect(result.sourceIssues).toBe(0);
    expect(result.unsupported).toBe(1);
    expect(result.compositions.map((item) => item.etfSymbol)).toEqual(["009816"]);
  });

  it("preserves a newer local composition instead of rolling it back", () => {
    const current = composition("009816", "2026-10-02", "user_import");
    const result = applyHeldEtfCompositions([current], held, cache([composition("009816", "2026-10-01")]));
    expect(result.updated).toBe(0);
    expect(result.preservedNewer).toBe(1);
    expect(result.compositions[0]?.asOf).toBe("2026-10-02");
  });

  it("replaces same-date manual data with traceable official issuer data", () => {
    const current = composition("009816", "2026-10-01", "user_import");
    const official = composition("009816", "2026-10-01", "official_issuer");
    const result = applyHeldEtfCompositions([current], held, cache([official]));
    expect(result.updated).toBe(1);
    expect(result.compositions[0]?.sourceType).toBe("official_issuer");
  });

  it("leaves unsupported held ETFs untouched and never stores unheld cache entries", () => {
    const existing = composition("00935", "2026-09-30", "user_import");
    const result = applyHeldEtfCompositions([existing], held, cache([composition("0050", "2026-10-01")]));
    expect(result.updated).toBe(0);
    expect(result.matched).toBe(0);
    expect(result.unsupported).toBe(2);
    expect(result.compositions).toEqual([existing]);
  });

  it("distinguishes a supported stale source from an unsupported ETF", () => {
    const stale = composition("009816", "2026-09-30");
    const result = applyHeldEtfCompositions(
      [],
      held,
      cache([stale], [{
        symbol: "009816",
        name: "凱基台灣TOP50",
        sourceName: "凱基投信",
        sourceUrl: "https://example.com",
        fetchedAt: "2026-10-01T10:00:00.000Z",
        status: "stale",
        error: "temporary issuer error"
      }])
    );

    expect(result.matched).toBe(1);
    expect(result.supported).toBe(1);
    expect(result.sourceIssues).toBe(1);
    expect(result.unsupported).toBe(1);
  });
});
