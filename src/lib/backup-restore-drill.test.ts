import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoState, emptyState } from "./demo-data";
import { parseBackup, serializeBackup } from "./local-data";
import { encodeNativeStateEnvelope, decodeNativeStateEnvelope } from "./durable-storage";
import { loadInitialState, resetState, saveState, serializeStoredState } from "./storage";
import type { AppState } from "./types";

class MemoryLocalStorage {
  private readonly entries = new Map<string, string>();
  getItem(key: string) { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string) { this.entries.set(key, value); }
  removeItem(key: string) { this.entries.delete(key); }
}

const sample: AppState = {
  ...demoState,
  dataMode: "personal",
  watchlist: [{
    id: "watch-TWSE-2330",
    market: "TW",
    venue: "TWSE",
    symbol: "2330",
    name: "台積電",
    type: "stock",
    industry: "半導體",
    addedAt: "2026-10-06"
  }],
  etfCompositions: [{
    id: "composition:TW:009816",
    etfMarket: "TW",
    etfSymbol: "009816",
    etfName: "凱基台灣TOP50",
    asOf: "2026-10-07",
    sourceName: "測試用官方資料",
    sourceUrl: "https://example.com/etf",
    sourceType: "official_issuer",
    constituents: [{
      market: "TW",
      symbol: "2330",
      name: "台積電",
      weightPct: 30,
      sector: "半導體"
    }]
  }],
  allocationTargets: [
    { key: "TW:2330", label: "台積電", targetPct: 40 },
    { key: "TW:009816", label: "凱基台灣TOP50", targetPct: 60 }
  ]
};

describe("P0 local backup / wipe / restore drill", () => {
  let localStorage: MemoryLocalStorage;
  beforeEach(() => {
    localStorage = new MemoryLocalStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage }
    });
  });
  afterEach(() => { Reflect.deleteProperty(globalThis, "window"); });

  it("restores every supported state collection after clearing a test device", () => {
    saveState(sample);
    const backup = serializeBackup(loadInitialState().state);
    expect(JSON.parse(backup).version).toBe(18);

    resetState();
    expect(loadInitialState().state).toEqual(emptyState);

    const restored = parseBackup(backup);
    saveState(restored);
    const loaded = loadInitialState();

    expect(loaded.invalidStoredState).toBe(false);
    expect(loaded.state).toEqual(sample);
    expect(loaded.state.holdings).toHaveLength(5);
    expect(loaded.state.etfCompositions).toHaveLength(1);
    expect(loaded.state.watchlist).toHaveLength(1);
    expect(loaded.state.activities).toHaveLength(3);
    expect(loaded.state.journal).toHaveLength(1);
    expect(loaded.state.snapshots).toHaveLength(5);
    expect(loaded.state.allocationTargets).toHaveLength(2);
    expect(loaded.state.usdTwd).toBe(31.8);
  });

  it("retains TWR boundary fields and supports the Native durable envelope", () => {
    const snapshot: AppState = {
      ...sample,
      activities: [
        ...sample.activities,
        {
          id: "twr-boundary",
          date: "2026-10-07",
          time: "10:10",
          type: "deposit",
          symbol: "",
          amount: 1000,
          currency: "TWD",
          fxRate: 1,
          quantity: 0,
          price: 0,
          note: "TWR boundary",
          account: "台股證券",
          preFlowValueTwd: 99999,
          preFlowValueSource: "manual"
        }
      ]
    };
    const restored = parseBackup(serializeBackup(snapshot));
    const native = decodeNativeStateEnvelope(encodeNativeStateEnvelope(restored, 37));
    expect(native.state).toEqual(restored);
    expect(native.state.activities.at(-1)?.preFlowValueTwd).toBe(99999);
    expect(native.state.activities.at(-1)?.preFlowValueSource).toBe("manual");
    expect(native.revision).toBe(37);
  });

  it("does not overwrite current local data when a backup is invalid", () => {
    saveState(sample);
    const unsafe = JSON.parse(serializeBackup(sample)) as {
      version: number;
      state: AppState;
    };
    unsafe.state.holdings[0] = { ...unsafe.state.holdings[0]!, quantity: -10 };
    const original = serializeStoredState(loadInitialState().state);
    expect(() => parseBackup(JSON.stringify(unsafe))).toThrow();
    expect(serializeStoredState(loadInitialState().state)).toBe(original);

    unsafe.version = 99;
    expect(() => parseBackup(JSON.stringify(unsafe))).toThrow();
    expect(serializeStoredState(loadInitialState().state)).toBe(original);
  });
});
