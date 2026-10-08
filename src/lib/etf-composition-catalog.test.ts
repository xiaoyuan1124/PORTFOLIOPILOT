import { describe, expect, it } from "vitest";
import { chooseCurrentEtfCompositions } from "./etf-composition-catalog";
import type { EtfComposition } from "./types";

function item(symbol: string, asOf: string, sourceType: EtfComposition["sourceType"] = "official_issuer", weight = 20): EtfComposition {
  return {
    id: `composition:TW:${symbol}`,
    etfMarket: "TW", etfSymbol: symbol,
    etfName: `ETF ${symbol}`, asOf,
    sourceName: "官方來源",
    sourceUrl: "https://example.org/fund",
    sourceType,
    constituents: [{ market: "TW", symbol: "2330", name: "台積電", sector: "半導體", weightPct: weight }]
  };
}

describe("current ETF research and exposure snapshot selection", () => {
  it("supports public official-only ETFs without local holdings or imports", () => {
    const result = chooseCurrentEtfCompositions([item("009816", "2026-10-08"), item("00935", "2026-10-08")]);
    expect(result.map((composition) => composition.etfSymbol)).toEqual(["009816", "00935"]);
  });

  it("replaces old official local data with a newer official bundle without writing to local state", () => {
    const local = [item("009816", "2026-10-01", "official_issuer", 20)];
    const bundled = [item("009816", "2026-10-08", "official_issuer", 40)];
    const result = chooseCurrentEtfCompositions([...local, ...bundled]);
    expect(result).toHaveLength(1);
    expect(result[0]?.constituents[0]?.weightPct).toBe(40);
    expect(local[0]?.constituents[0]?.weightPct).toBe(20);
  });

  it("does not overwrite a newer local user-import date with an older issuer bundle", () => {
    const local = item("009816", "2026-10-10", "user_import", 33);
    const result = chooseCurrentEtfCompositions([local, item("009816", "2026-10-08")]);
    expect(result).toEqual([local]);
  });

  it("prefers the official dated snapshot over a same-day manual import regardless of ordering", () => {
    const manual = item("009816", "2026-10-08", "user_import", 60);
    const official = item("009816", "2026-10-08", "official_issuer", 40);
    expect(chooseCurrentEtfCompositions([manual, official])).toEqual([official]);
    expect(chooseCurrentEtfCompositions([official, manual])).toEqual([official]);
  });

  it("handles duplicate same-source same-day issuer corrections deterministically", () => {
    const old = item("009816", "2026-10-08", "official_issuer", 40);
    const corrected = item("009816", "2026-10-08", "official_issuer", 41);
    expect(chooseCurrentEtfCompositions([old, corrected])).toEqual([corrected]);
  });

  it("does not mix same symbols listed in different markets", () => {
    const tw = item("ETFUS", "2026-10-08");
    const us: EtfComposition = { ...tw, etfMarket: "US" };
    expect(chooseCurrentEtfCompositions([tw, us])).toHaveLength(2);
  });
});
