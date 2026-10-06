import { describe, expect, it } from "vitest";
import type { AppState } from "./types";
import { parseBackup, serializeBackup } from "./local-data";

describe("watchlist backup compatibility", () => {
  it("round-trips V18 watchlist data", () => {
    const state: AppState = {
      dataMode: "personal",
      usdTwd: 31.8,
      holdings: [],
      etfCompositions: [],
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
      journal: [],
      activities: [],
      snapshots: [],
      allocationTargets: []
    };

    const serialized = serializeBackup(state);
    expect(JSON.parse(serialized).version).toBe(18);
    expect(parseBackup(serialized)).toEqual(state);
  });

  it("defaults legacy backups to an empty watchlist", () => {
    const parsed = parseBackup(JSON.stringify({
      version: 17,
      exportedAt: "2026-10-06T00:00:00.000Z",
      state: {
        dataMode: "personal",
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        journal: [],
        activities: [],
        snapshots: [],
        allocationTargets: []
      }
    }));

    expect(parsed.watchlist).toEqual([]);
  });

  it("rejects duplicate venue and symbol entries", () => {
    expect(() => parseBackup(JSON.stringify({
      version: 18,
      exportedAt: "2026-10-06T00:00:00.000Z",
      state: {
        dataMode: "personal",
        usdTwd: 31.8,
        holdings: [],
        etfCompositions: [],
        watchlist: [
          {
            id: "a",
            market: "TW",
            venue: "TWSE",
            symbol: "2330",
            name: "台積電",
            type: "stock",
            industry: "半導體",
            addedAt: "2026-10-06"
          },
          {
            id: "b",
            market: "TW",
            venue: "TWSE",
            symbol: "2330",
            name: "台積電",
            type: "stock",
            industry: "半導體",
            addedAt: "2026-10-06"
          }
        ],
        journal: [],
        activities: [],
        snapshots: [],
        allocationTargets: []
      }
    }))).toThrow(/不可重複加入自選清單/);
  });
});
