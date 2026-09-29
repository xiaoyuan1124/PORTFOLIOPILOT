import { describe, expect, it } from "vitest";
import {
  etfCompositionsToCsv,
  mergeHoldings,
  parseBackup,
  parseEtfCompositionCsv,
  parseHoldingsCsv,
  serializeBackup
} from "./local-data";
import type { AppState } from "./types";

describe("local data import/export", () => {
  it("round-trips a versioned JSON backup including ETF compositions", () => {
    const state: AppState = {
      dataMode: "personal",
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
      activities: [{
        id: "flow-1",
        date: "2026-09-27",
        time: "09:30",
        type: "deposit",
        symbol: "",
        amount: 1000,
        currency: "TWD",
        fxRate: 1,
        quantity: 0,
        price: 0,
        note: "boundary",
        preFlowValueTwd: 5000
      }],
      snapshots: [{ date: "2026-09-27", total: 10, cost: 8, gain: 2, usdTwd: 31.8 }]
    };
    const serialized = serializeBackup(state);
    expect(JSON.parse(serialized).version).toBe(4);
    expect(parseBackup(serialized)).toEqual(state);
  });

  it("keeps version 2 backups compatible without TWR boundary fields", () => {
    const parsed = parseBackup(JSON.stringify({
      version: 2,
      exportedAt: "2026-09-26T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [{
          id: "legacy-flow",
          date: "2026-09-01",
          type: "deposit",
          symbol: "",
          amount: 1000,
          currency: "TWD",
          fxRate: 1,
          quantity: 0,
          price: 0,
          note: ""
        }],
        snapshots: []
      }
    }));
    expect(parsed.activities[0]?.preFlowValueTwd).toBeUndefined();
    expect(parsed.activities[0]?.time).toBeUndefined();
  });

  it("rejects TWR boundaries attached to internal buy/sell records", () => {
    const backup = {
      version: 3,
      exportedAt: "2026-09-27T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [{
          id: "bad-boundary",
          date: "2026-09-27",
          type: "buy",
          symbol: "2330",
          amount: 1000,
          currency: "TWD",
          fxRate: 1,
          quantity: 1,
          price: 1000,
          note: "",
          preFlowValueTwd: 5000
        }],
        snapshots: []
      }
    };
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/只適用於入金或出金/);
  });

  it("rejects invalid external-flow time values", () => {
    const backup = {
      version: 3,
      exportedAt: "2026-09-27T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [{
          id: "bad-time",
          date: "2026-09-27",
          time: "25:61",
          type: "deposit",
          symbol: "",
          amount: 1000,
          currency: "TWD",
          fxRate: 1,
          quantity: 0,
          price: 0,
          note: "",
          preFlowValueTwd: 5000
        }],
        snapshots: []
      }
    };
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
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

  it("keeps identical symbols separate across accounts", () => {
    const incoming = parseHoldingsCsv([
      "symbol,name,market,type,quantity,price,averageCost,currency,sector,account",
      "2330,台積電,TW,stock,10,1000,900,TWD,半導體,券商A",
      "2330,台積電,TW,stock,5,1000,920,TWD,半導體,券商B"
    ].join("\n"));
    const merged = mergeHoldings([], incoming);
    expect(merged).toHaveLength(2);
    expect(merged.map((row) => row.account)).toEqual(["券商A", "券商B"]);
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
    expect(() => parseEtfCompositionCsv(csv)).toThrow(/110\.00/);
  });

  it("rejects over-100 ETF weights in JSON backups too", () => {
    const backup = {
      version: 2,
      exportedAt: "2026-09-27T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [{
          id: "composition:TW:009999",
          etfMarket: "TW",
          etfSymbol: "009999",
          etfName: "ETF",
          asOf: "2026-09-26",
          sourceName: "Issuer",
          sourceUrl: "https://example.com/etf",
          sourceType: "user_import",
          constituents: [
            { market: "TW", symbol: "2330", name: "台積電", weightPct: 60, sector: "半導體" },
            { market: "TW", symbol: "2317", name: "鴻海", weightPct: 50, sector: "電子" }
          ]
        }],
        journal: [],
        activities: [],
        snapshots: []
      }
    };
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/110\.00/);
  });

  it("accepts tiny floating-point noise around exactly 100%", () => {
    const csv = [
      "etfMarket,etfSymbol,etfName,asOf,sourceName,sourceUrl,componentMarket,componentSymbol,componentName,weightPct,sector",
      "US,ETF,ETF,2026-09-26,Issuer,https://example.com/etf,US,AAA,A,33.3333334,Tech",
      "US,ETF,ETF,2026-09-26,Issuer,https://example.com/etf,US,BBB,B,33.3333334,Tech",
      "US,ETF,ETF,2026-09-26,Issuer,https://example.com/etf,US,CCC,C,33.3333334,Tech"
    ].join("\n");
    expect(parseEtfCompositionCsv(csv)).toHaveLength(1);
  });
});
