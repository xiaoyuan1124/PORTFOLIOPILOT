import { describe, expect, it } from "vitest";
import { parseBackup, parseHoldingsCsv, serializeBackup } from "./local-data";
import type { AppState } from "./types";

describe("local data import/export", () => {
  it("round-trips a versioned JSON backup", () => {
    const state: AppState = {
      usdTwd: 31.8,
      holdings: [],
      journal: [],
      activities: [],
      snapshots: [{ date: "2026-09-27", total: 10, cost: 8, gain: 2, usdTwd: 31.8 }]
    };
    expect(parseBackup(serializeBackup(state))).toEqual(state);
  });

  it("accepts legacy backup data without snapshots", () => {
    const parsed = parseBackup(JSON.stringify({
      holdings: [],
      journal: [],
      usdTwd: 31.8
    }));
    expect(parsed.activities).toEqual([]);
    expect(parsed.snapshots).toEqual([]);
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
});
