import { describe, expect, it } from "vitest";
import {
  etfCompositionsToCsv,
  parseBackup,
  parseEtfCompositionCsv,
  parseHoldingsCsv,
  serializeBackup
} from "./local-data";
import type { AppState } from "./types";

describe("local data import/export", () => {
  it("round-trips a versioned JSON backup including ETF compositions", () => {
    const state: AppState = {
      usdTwd: 31.8,
      holdings: [],
      etfCompositions: [{
        id: "composition:US:ETF",
        etfMarket: "US",
        etfSymbol: "ETF",
        etfName: "Test ETF",
        asOf: "2026-09-26",
        sourceName: "Issuer",
        sourceUrl: "https://example.com/etf",
        sourceType: "user_import",
        constituents: [{ market: "US", symbol: "AAA", name: "A", weightPct: 50, sector: "Tech" }]
      }],
      journal: [],
      activities: [],
      snapshots: [{ date: "2026-09-27", total: 10, cost: 8, gain: 2, usdTwd: 31.8 }]
    };
    expect(parseBackup(serializeBackup(state))).toEqual(state);
  });

  it("accepts legacy backup data without snapshots or ETF compositions", () => {
    const parsed = parseBackup(JSON.stringify({
      holdings: [],
      journal: [],
      usdTwd: 31.8
    }));
    expect(parsed.activities).toEqual([]);
    expect(parsed.snapshots).toEqual([]);
    expect(parsed.etfCompositions).toEqual([]);
  });

  it("parses holdings CSV and coerces numeric columns", () => {
    const csv = [
      "symbol,name,market,type,quantity,price,averageCost,currency,sector",
      "2330,台積電,TW,stock,10,1000,900,TWD,半導體"
    ].join("\n");
    const rows = parseHoldingsCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe(10);
    expect(rows[0]?.symbol).toBe("2330");
  });

  it("rejects invalid market values", () => {
    const csv = [
      "symbol,name,market,type,quantity,price,averageCost,currency,sector",
      "2330,台積電,JP,stock,10,1000,900,TWD,半導體"
    ].join("\n");
    expect(() => parseHoldingsCsv(csv)).toThrow();
  });

  it("groups ETF component rows and preserves source/date provenance", () => {
    const csv = [
      "etfMarket,etfSymbol,etfName,asOf,sourceName,sourceUrl,componentMarket,componentSymbol,componentName,weightPct,sector",
      "US,qqqm,QQQM,2026-09-26,Invesco,https://example.com/qqqm,US,nvda,NVIDIA,8.5,Semiconductors",
      "US,qqqm,QQQM,2026-09-26,Invesco,https://example.com/qqqm,US,msft,Microsoft,6.0,Software"
    ].join("\n");
    const rows = parseEtfCompositionCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.etfSymbol).toBe("QQQM");
    expect(rows[0]?.constituents.map((item) => item.symbol)).toEqual(["NVDA", "MSFT"]);
    expect(rows[0]?.sourceType).toBe("user_import");
    expect(parseEtfCompositionCsv(etfCompositionsToCsv(rows))).toEqual(rows);
  });

  it("rejects ETF composition weights over 100% instead of normalizing them", () => {
    const csv = [
      "etfMarket,etfSymbol,etfName,asOf,sourceName,sourceUrl,componentMarket,componentSymbol,componentName,weightPct,sector",
      "TW,009999,ETF,2026-09-26,Issuer,https://example.com/etf,TW,2330,台積電,60,半導體",
      "TW,009999,ETF,2026-09-26,Issuer,https://example.com/etf,TW,2317,鴻海,50,電子"
    ].join("\n");
    expect(() => parseEtfCompositionCsv(csv)).toThrow(/100\.5/);
  });
});
