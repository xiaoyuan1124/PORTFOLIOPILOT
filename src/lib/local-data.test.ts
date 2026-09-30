import { describe, expect, it } from "vitest";
import {
  applyHoldingCorrections,
  etfCompositionsToCsv,
  holdingIdentityKey,
  holdingMergeConflictCount,
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
        preFlowValueTwd: 5000,
        preFlowValueSource: "manual"
      }],
      allocationTargets: [{ key: "US:ETF", label: "ETF", targetPct: 100 }],
      snapshots: [{ date: "2026-09-27", total: 10, cost: 8, gain: 2, usdTwd: 31.8 }]
    };
    const serialized = serializeBackup(state);
    expect(JSON.parse(serialized).version).toBe(10);
    expect(parseBackup(serialized)).toEqual(state);
  });

  it("keeps version 9 backups readable without boundary provenance", () => {
    const parsed = parseBackup(JSON.stringify({
      version: 9,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        dataMode: "personal",
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [{
          id: "legacy-flow",
          date: "2026-09-30",
          time: "09:30",
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
        snapshots: [],
        allocationTargets: []
      }
    }));

    expect(parsed.activities[0]?.preFlowValueTwd).toBe(5000);
    expect(parsed.activities[0]?.preFlowValueSource).toBeUndefined();
  });

  it("rejects forged system TWR provenance without a linked cash event", () => {
    expect(() => parseBackup(JSON.stringify({
      version: 10,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        dataMode: "personal",
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [{
          id: "forged-system-flow",
          date: "2026-09-30",
          time: "09:30",
          type: "deposit",
          symbol: "",
          amount: 1000,
          currency: "TWD",
          fxRate: 1,
          quantity: 0,
          price: 0,
          note: "",
          preFlowValueTwd: 5000,
          preFlowValueSource: "system_current_state"
        }],
        snapshots: [],
        allocationTargets: []
      }
    }))).toThrow(/已連動現金帳戶/);
  });

  it("round-trips V6 managed trade inventory metadata", () => {
    const before = {
      id: "h1",
      symbol: "2330",
      name: "台積電",
      market: "TW" as const,
      type: "stock" as const,
      quantity: 10,
      price: 1000,
      averageCost: 900,
      currency: "TWD" as const,
      sector: "半導體",
      account: "券商A"
    };
    const after = { ...before, quantity: 8 };

    const state: AppState = {
      dataMode: "personal",
      usdTwd: 31.8,
      holdings: [after],
      etfCompositions: [],
      journal: [],
      snapshots: [],
      allocationTargets: [],
      activities: [{
        id: "managed-sell",
        date: "2026-09-30",
        type: "sell",
        symbol: "2330",
        amount: 1980,
        currency: "TWD",
        fxRate: 1,
        quantity: 2,
        price: 1000,
        note: "",
        account: "券商A",
        inventoryImpact: {
          kind: "trade",
          holdingId: "h1",
          before,
          after,
          fee: 10,
          tax: 10,
          realizedPnl: 180,
          method: "average_cost"
        }
      }]
    };

    const serialized = serializeBackup(state);
    expect(JSON.parse(serialized).version).toBe(10);
    expect(parseBackup(serialized)).toEqual(state);
  });

  it("round-trips V7 corporate share-adjustment metadata", () => {
    const before = {
      id: "h1",
      symbol: "2330",
      name: "台積電",
      market: "TW" as const,
      type: "stock" as const,
      quantity: 10,
      price: 1000,
      averageCost: 900,
      currency: "TWD" as const,
      sector: "半導體",
      account: "券商A"
    };
    const after = { ...before, quantity: 20, averageCost: 450 };

    const state: AppState = {
      dataMode: "personal",
      usdTwd: 31.8,
      holdings: [after],
      etfCompositions: [],
      journal: [],
      snapshots: [],
      allocationTargets: [],
      activities: [{
        id: "split",
        date: "2026-09-30",
        type: "corporate_action",
        symbol: "2330",
        amount: 0,
        currency: "TWD",
        fxRate: 1,
        quantity: 0,
        price: 0,
        note: "1拆2",
        account: "券商A",
        inventoryImpact: {
          kind: "corporate_action",
          holdingId: "h1",
          before,
          after,
          action: "share_adjustment",
          ratio: 2
        }
      }]
    };

    const serialized = serializeBackup(state);
    expect(JSON.parse(serialized).version).toBe(10);
    expect(parseBackup(serialized)).toEqual(state);
  });

  it("round-trips V8 cash-linked activity metadata", () => {
    const before = {
      id: "cash",
      symbol: "CASH-TWD",
      name: "TWD 現金",
      market: "TW" as const,
      type: "cash" as const,
      quantity: 1,
      price: 5000,
      averageCost: 5000,
      currency: "TWD" as const,
      sector: "現金",
      account: "券商現金"
    };
    const after = { ...before, price: 5100, averageCost: 5100 };

    const state: AppState = {
      dataMode: "personal",
      usdTwd: 31.8,
      holdings: [after],
      etfCompositions: [],
      journal: [],
      snapshots: [],
      allocationTargets: [],
      activities: [{
        id: "dividend",
        date: "2026-09-30",
        type: "dividend",
        symbol: "2330",
        amount: 100,
        currency: "TWD",
        fxRate: 1,
        quantity: 0,
        price: 0,
        note: "",
        account: "券商現金",
        cashImpact: {
          cashHoldingId: "cash",
          before,
          after,
          delta: 100,
          reason: "dividend"
        }
      }]
    };

    const serialized = serializeBackup(state);
    expect(JSON.parse(serialized).version).toBe(10);
    expect(parseBackup(serialized)).toEqual(state);
  });

  it("rejects tampered V8 cash snapshots whose arithmetic does not match delta", () => {
    const before = {
      id: "cash",
      symbol: "CASH-TWD",
      name: "TWD 現金",
      market: "TW",
      type: "cash",
      quantity: 1,
      price: 5000,
      averageCost: 5000,
      currency: "TWD",
      sector: "現金",
      account: "券商現金"
    };
    const backup = {
      version: 8,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        dataMode: "personal",
        usdTwd: 31.8,
        holdings: [{ ...before, price: 5050, averageCost: 5050 }],
        etfCompositions: [],
        journal: [],
        snapshots: [],
        allocationTargets: [],
        activities: [{
          id: "bad-cash",
          date: "2026-09-30",
          type: "dividend",
          symbol: "2330",
          amount: 100,
          currency: "TWD",
          fxRate: 1,
          quantity: 0,
          price: 0,
          note: "",
          account: "券商現金",
          cashImpact: {
            cashHoldingId: "cash",
            before,
            after: { ...before, price: 5050, averageCost: 5050 },
            delta: 100,
            reason: "dividend"
          }
        }]
      }
    };

    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/after 快照/);
  });

  it("round-trips V9 opening-buy metadata with null before snapshot", () => {
    const cashBefore = {
      id: "cash",
      symbol: "CASH-TWD",
      name: "TWD 現金",
      market: "TW" as const,
      type: "cash" as const,
      quantity: 1,
      price: 5000,
      averageCost: 5000,
      currency: "TWD" as const,
      sector: "現金",
      account: "券商A"
    };
    const cashAfter = { ...cashBefore, price: 4000, averageCost: 4000 };
    const position = {
      id: "new-position",
      symbol: "2330",
      name: "台積電",
      market: "TW" as const,
      type: "stock" as const,
      quantity: 1,
      price: 1000,
      averageCost: 1000,
      currency: "TWD" as const,
      sector: "半導體",
      account: "券商A"
    };

    const state: AppState = {
      dataMode: "personal",
      usdTwd: 31.8,
      holdings: [cashAfter, position],
      etfCompositions: [],
      journal: [],
      snapshots: [],
      allocationTargets: [],
      activities: [{
        id: "open",
        date: "2026-09-30",
        type: "buy",
        symbol: "2330",
        amount: 1000,
        currency: "TWD",
        fxRate: 1,
        quantity: 1,
        price: 1000,
        note: "",
        account: "券商A",
        inventoryImpact: {
          kind: "trade",
          holdingId: "new-position",
          before: null,
          after: position,
          fee: 0,
          tax: 0,
          realizedPnl: 0,
          method: "average_cost"
        },
        cashImpact: {
          cashHoldingId: "cash",
          before: cashBefore,
          after: cashAfter,
          delta: -1000,
          reason: "trade"
        }
      }]
    };

    const serialized = serializeBackup(state);
    expect(JSON.parse(serialized).version).toBe(10);
    expect(parseBackup(serialized)).toEqual(state);
  });

  it("keeps version 4 backups compatible by defaulting allocation targets to empty", () => {
    const parsed = parseBackup(JSON.stringify({
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [],
        snapshots: []
      }
    }));

    expect(parsed.allocationTargets).toEqual([]);
  });

  it("rejects allocation target sets that do not total 100 percent", () => {
    expect(() => parseBackup(JSON.stringify({
      version: 5,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [],
        snapshots: [],
        allocationTargets: [
          { key: "TW:2330", label: "台積電", targetPct: 60 },
          { key: "US:QQQM", label: "QQQM", targetPct: 30 }
        ]
      }
    }))).toThrow(/合計必須為 100%/);
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

  it("rejects malformed activity date keys in JSON backups", () => {
    const backup = {
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [{
          id: "bad-date",
          date: "09/30/2026",
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
    };

    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/YYYY-MM-DD/);
  });

  it("rejects impossible calendar dates instead of sorting them as valid data", () => {
    const backup = {
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [],
        snapshots: [{
          date: "2026-02-31",
          total: 100,
          cost: 90,
          gain: 10,
          usdTwd: 31.8
        }]
      }
    };

    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/有效的曆日/);
  });

  it("rejects invalid official price as-of dates in backups", () => {
    const backup = {
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [{
          id: "tw",
          symbol: "2330",
          name: "台積電",
          market: "TW",
          type: "stock",
          quantity: 1,
          price: 1000,
          averageCost: 900,
          currency: "TWD",
          sector: "半導體",
          priceSource: "TWSE",
          priceAsOf: "2026-13-01"
        }],
        etfCompositions: [],
        journal: [],
        activities: [],
        snapshots: []
      }
    };

    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/有效的曆日/);
  });

  it("normalizes stale activity fields when importing legacy backups", () => {
    const parsed = parseBackup(JSON.stringify({
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [
          {
            id: "legacy-deposit",
            date: "2026-09-30",
            time: "09:00",
            type: "deposit",
            symbol: "2330",
            amount: 1000,
            currency: "TWD",
            fxRate: 1,
            quantity: 3,
            price: 1000,
            note: ""
          },
          {
            id: "legacy-dividend",
            date: "2026-09-30",
            time: "10:00",
            type: "dividend",
            symbol: " qqqm ",
            amount: 10,
            currency: "USD",
            fxRate: 31.8,
            quantity: 99,
            price: 999,
            note: ""
          }
        ],
        snapshots: []
      }
    }));

    expect(parsed.activities[0]).toMatchObject({ symbol: "", quantity: 0, price: 0, time: "09:00" });
    expect(parsed.activities[1]).toMatchObject({ symbol: "QQQM", quantity: 0, price: 0 });
    expect(parsed.activities[1]?.time).toBeUndefined();
  });

  it("rejects imported buy or sell activity without a security symbol", () => {
    const backup = {
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [{
          id: "bad-buy",
          date: "2026-09-30",
          type: "buy",
          symbol: "   ",
          amount: 1000,
          currency: "TWD",
          fxRate: 1,
          quantity: 1,
          price: 1000,
          note: ""
        }],
        snapshots: []
      }
    };

    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/必須包含股票代號/);
  });

  it("rejects duplicate holding identity in JSON backups", () => {
    const holding = {
      id: "holding-a",
      symbol: "2330",
      name: "台積電",
      market: "TW",
      type: "stock",
      quantity: 1,
      price: 1000,
      averageCost: 900,
      currency: "TWD",
      sector: "半導體",
      account: "券商A"
    };

    const backup = {
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [
          holding,
          { ...holding, id: "holding-b", symbol: " 2330 ", account: "券商A" }
        ],
        etfCompositions: [],
        journal: [],
        activities: [],
        snapshots: []
      }
    };

    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/不可重複建立持股/);
  });

  it("rejects duplicate record IDs that could make delete or rendering ambiguous", () => {
    const backup = {
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [
          {
            id: "same-id",
            date: "2026-09-29",
            type: "deposit",
            symbol: "",
            amount: 1000,
            currency: "TWD",
            fxRate: 1,
            quantity: 0,
            price: 0,
            note: ""
          },
          {
            id: "same-id",
            date: "2026-09-30",
            type: "withdrawal",
            symbol: "",
            amount: 100,
            currency: "TWD",
            fxRate: 1,
            quantity: 0,
            price: 0,
            note: ""
          }
        ],
        snapshots: []
      }
    };

    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/重複 ID/);
  });

  it("rejects duplicate snapshot dates instead of creating an ambiguous time series", () => {
    const backup = {
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [],
        snapshots: [
          { date: "2026-09-30", total: 100, cost: 90, gain: 10, usdTwd: 31.8 },
          { date: "2026-09-30", total: 110, cost: 90, gain: 20, usdTwd: 31.8 }
        ]
      }
    };

    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/同一天只能有一筆淨值快照/);
  });

  it("rejects duplicate ETF identities in JSON backups", () => {
    const composition = {
      id: "composition-a",
      etfMarket: "TW",
      etfSymbol: "0050",
      etfName: "元大台灣50",
      asOf: "2026-09-30",
      sourceName: "Issuer",
      sourceUrl: "https://example.com/0050",
      sourceType: "official_issuer",
      constituents: [
        { market: "TW", symbol: "2330", name: "台積電", weightPct: 50, sector: "半導體" }
      ]
    };

    const backup = {
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [
          composition,
          { ...composition, id: "composition-b", etfSymbol: " 0050 " }
        ],
        journal: [],
        activities: [],
        snapshots: []
      }
    };

    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/只能保留一份成分資料/);
  });

  it("rejects zero-amount imported activities before they can pollute performance completeness", () => {
    const backup = {
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [{
          id: "zero-flow",
          date: "2026-09-30",
          type: "deposit",
          symbol: "",
          amount: 0,
          currency: "TWD",
          fxRate: 1,
          quantity: 0,
          price: 0,
          note: ""
        }],
        snapshots: []
      }
    };

    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/金額必須大於 0/);
  });

  it("normalizes imported TWD activity FX to one", () => {
    const parsed = parseBackup(JSON.stringify({
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [{
          id: "twd-flow",
          date: "2026-09-30",
          type: "deposit",
          symbol: "",
          amount: 1000,
          currency: "TWD",
          fxRate: 31.8,
          quantity: 0,
          price: 0,
          note: ""
        }],
        snapshots: []
      }
    }));

    expect(parsed.activities[0]?.fxRate).toBe(1);
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

  it("rejects zero-valued investment fields in JSON backups", () => {
    const baseHolding = {
      id: "tw",
      symbol: "2330",
      name: "台積電",
      market: "TW",
      type: "stock",
      quantity: 1,
      price: 1000,
      averageCost: 900,
      currency: "TWD",
      sector: "半導體"
    };

    for (const patch of [
      { quantity: 0 },
      { price: 0 },
      { averageCost: 0 }
    ]) {
      const backup = {
        version: 4,
        exportedAt: "2026-09-30T00:00:00.000Z",
        state: {
          usdTwd: 31.8,
          holdings: [{ ...baseHolding, ...patch }],
          etfCompositions: [],
          journal: [],
          activities: [],
          snapshots: []
        }
      };

      expect(() => parseBackup(JSON.stringify(backup))).toThrow();
    }
  });

  it("rejects zero stock values in holdings CSV instead of treating missing data as zero", () => {
    const csv = [
      "symbol,name,market,type,quantity,price,averageCost,currency,sector",
      "2330,台積電,TW,stock,10,0,900,TWD,半導體"
    ].join("\n");

    expect(() => parseHoldingsCsv(csv)).toThrow(/必須大於 0/);
  });

  it("allows a persistent zero cash balance in JSON backups", () => {
    const parsed = parseBackup(JSON.stringify({
      version: 8,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        dataMode: "personal",
        usdTwd: 31.8,
        holdings: [{
          id: "cash-zero",
          symbol: "CASH-TWD",
          name: "TWD 現金",
          market: "TW",
          type: "cash",
          quantity: 1,
          price: 0,
          averageCost: 0,
          currency: "TWD",
          sector: "現金",
          account: "券商A"
        }],
        etfCompositions: [],
        journal: [],
        activities: [],
        snapshots: [],
        allocationTargets: []
      }
    }));

    expect(parsed.holdings[0]).toMatchObject({
      id: "cash-zero",
      type: "cash",
      price: 0,
      averageCost: 0
    });
  });

  it("allows a persistent zero cash balance in imported holdings", () => {
    const csv = [
      "symbol,name,market,type,quantity,price,averageCost,currency,sector",
      "CASH-TWD,TWD 現金,TW,cash,1,0,0,TWD,現金"
    ].join("\n");

    const rows = parseHoldingsCsv(csv);
    expect(rows[0]).toMatchObject({
      type: "cash",
      quantity: 1,
      price: 0,
      averageCost: 0
    });
  });

  it("rejects market/currency mismatches that would corrupt TWD valuation", () => {
    const baseHolding = {
      id: "tw",
      symbol: "2330",
      name: "台積電",
      market: "TW",
      type: "stock",
      quantity: 1,
      price: 1000,
      averageCost: 900,
      currency: "USD",
      sector: "半導體"
    };

    const backup = {
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [baseHolding],
        etfCompositions: [],
        journal: [],
        activities: [],
        snapshots: []
      }
    };

    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/市場與幣別不一致/);
    expect(() => parseHoldingsCsv([
      "symbol,name,market,type,quantity,price,averageCost,currency,sector",
      "QQQM,QQQM,US,etf,1,250,200,TWD,ETF"
    ].join("\n"))).toThrow(/市場與幣別不一致/);
  });

  it("rejects incomplete or impossible official price provenance", () => {
    const base = {
      id: "tw",
      symbol: "2330",
      name: "台積電",
      market: "TW",
      type: "stock",
      quantity: 1,
      price: 1000,
      averageCost: 900,
      currency: "TWD",
      sector: "半導體"
    };

    const build = (holding: Record<string, unknown>) => ({
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [holding],
        etfCompositions: [],
        journal: [],
        activities: [],
        snapshots: []
      }
    });

    expect(() => parseBackup(JSON.stringify(build({ ...base, priceSource: "TWSE" })))).toThrow(/必須同時保留資料日/);
    expect(() => parseBackup(JSON.stringify(build({ ...base, priceAsOf: "2026-09-30" })))).toThrow(/不可缺少對應來源/);
    expect(() => parseBackup(JSON.stringify(build({
      ...base,
      market: "US",
      currency: "USD",
      symbol: "QQQM",
      name: "QQQM",
      priceSource: "TWSE",
      priceAsOf: "2026-09-30"
    })))).toThrow(/只能套用於台灣持股/);
  });

  it("rejects stale security provenance attached to cash", () => {
    const backup = {
      version: 4,
      exportedAt: "2026-09-30T00:00:00.000Z",
      state: {
        usdTwd: 31.8,
        holdings: [{
          id: "cash",
          symbol: "CASH-TWD",
          name: "TWD 現金",
          market: "TW",
          type: "cash",
          quantity: 1,
          price: 10000,
          averageCost: 10000,
          currency: "TWD",
          sector: "現金",
          priceSource: "TWSE",
          priceAsOf: "2026-09-30"
        }],
        etfCompositions: [],
        journal: [],
        activities: [],
        snapshots: []
      }
    };

    expect(() => parseBackup(JSON.stringify(backup))).toThrow(/現金不可附帶/);
  });

  it("applies batch holding corrections without changing identity fields", () => {
    const existing = [
      {
        id: "tw",
        symbol: "2330",
        name: "台積電",
        market: "TW" as const,
        type: "stock" as const,
        quantity: 10,
        price: 1000,
        averageCost: 900,
        currency: "TWD" as const,
        sector: "半導體",
        account: "券商A",
        priceSource: "TWSE" as const,
        priceAsOf: "2026-09-30"
      },
      {
        id: "cash",
        symbol: "CASH-TWD",
        name: "TWD 現金",
        market: "TW" as const,
        type: "cash" as const,
        quantity: 1,
        price: 50000,
        averageCost: 50000,
        currency: "TWD" as const,
        sector: "現金",
        account: "券商A"
      }
    ];

    const corrected = applyHoldingCorrections(existing, [
      { id: "tw", quantity: 12, price: 1000, averageCost: 910 },
      { id: "cash", quantity: 99, price: 42000, averageCost: 1 }
    ]);

    expect(corrected[0]).toMatchObject({
      id: "tw",
      symbol: "2330",
      account: "券商A",
      quantity: 12,
      price: 1000,
      averageCost: 910,
      priceSource: "TWSE",
      priceAsOf: "2026-09-30"
    });
    expect(corrected[1]).toMatchObject({
      id: "cash",
      symbol: "CASH-TWD",
      quantity: 1,
      price: 42000,
      averageCost: 42000
    });
  });

  it("allows quick reconciliation to set cash balance to zero without deleting identity", () => {
    const existing = [{
      id: "cash",
      symbol: "CASH-TWD",
      name: "TWD 現金",
      market: "TW" as const,
      type: "cash" as const,
      quantity: 1,
      price: 1000,
      averageCost: 1000,
      currency: "TWD" as const,
      sector: "現金",
      account: "券商A"
    }];

    const corrected = applyHoldingCorrections(existing, [{
      id: "cash",
      quantity: 99,
      price: 0,
      averageCost: 999
    }]);

    expect(corrected).toEqual([{
      ...existing[0],
      quantity: 1,
      price: 0,
      averageCost: 0,
      priceSource: undefined,
      priceAsOf: undefined
    }]);
  });

  it("marks a manually corrected current price as manual and clears stale official date", () => {
    const corrected = applyHoldingCorrections([{
      id: "tw",
      symbol: "2330",
      name: "台積電",
      market: "TW",
      type: "stock",
      quantity: 10,
      price: 1000,
      averageCost: 900,
      currency: "TWD",
      sector: "半導體",
      priceSource: "TWSE",
      priceAsOf: "2026-09-30"
    }], [{
      id: "tw",
      quantity: 10,
      price: 1010,
      averageCost: 900
    }]);

    expect(corrected[0]?.priceSource).toBe("manual");
    expect(corrected[0]?.priceAsOf).toBeUndefined();
  });

  it("fails closed on invalid or stale batch correction rows", () => {
    const existing = [{
      id: "tw",
      symbol: "2330",
      name: "台積電",
      market: "TW" as const,
      type: "stock" as const,
      quantity: 10,
      price: 1000,
      averageCost: 900,
      currency: "TWD" as const,
      sector: "半導體"
    }];

    expect(() => applyHoldingCorrections(existing, [
      { id: "tw", quantity: 0, price: 1000, averageCost: 900 }
    ])).toThrow(/都必須大於 0/);

    expect(() => applyHoldingCorrections(existing, [
      { id: "missing", quantity: 1, price: 1, averageCost: 1 }
    ])).toThrow(/已不存在/);
  });

  it("uses market + normalized symbol + account as the holding identity", () => {
    expect(holdingIdentityKey({
      market: "TW",
      symbol: " 2330 ",
      account: "券商A"
    })).toBe("TW:2330:券商a");

    expect(holdingIdentityKey({
      market: "TW",
      symbol: "2330",
      account: "券商B"
    })).not.toBe(holdingIdentityKey({
      market: "TW",
      symbol: "2330",
      account: "券商A"
    }));
  });

  it("rejects duplicate holding identities inside one CSV file", () => {
    const csv = [
      "symbol,name,market,type,quantity,price,averageCost,currency,sector,account",
      "2330,台積電,TW,stock,10,1000,900,TWD,半導體,券商A",
      "2330,台積電,TW,stock,5,1010,920,TWD,半導體,券商A"
    ].join("\n");

    expect(() => parseHoldingsCsv(csv)).toThrow(/CSV 內有重複持股/);
  });

  it("counts existing holdings that CSV merge would overwrite", () => {
    const existing = [{
      id: "existing",
      symbol: "2330",
      name: "台積電",
      market: "TW" as const,
      type: "stock" as const,
      quantity: 10,
      price: 1000,
      averageCost: 900,
      currency: "TWD" as const,
      sector: "半導體",
      account: "券商A"
    }];

    const incoming = parseHoldingsCsv([
      "symbol,name,market,type,quantity,price,averageCost,currency,sector,account",
      "2330,台積電,TW,stock,12,1010,910,TWD,半導體,券商A",
      "2317,鴻海,TW,stock,5,220,200,TWD,電子,券商A"
    ].join("\n"));

    expect(holdingMergeConflictCount(existing, incoming)).toBe(1);
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
