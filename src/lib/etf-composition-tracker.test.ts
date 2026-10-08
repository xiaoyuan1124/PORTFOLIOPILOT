import { describe, expect, it } from "vitest";
import type { EtfComposition } from "./types";
import { buildEtfCompositionTimeline, etfTimelineFingerprint } from "./etf-composition-tracker";

function snapshot(asOf: string, entries: Array<[string, number]>, changes: Partial<EtfComposition> = {}): EtfComposition {
  return {
    id: "composition:TW:009816",
    etfMarket: "TW",
    etfSymbol: "009816",
    etfName: "凱基台灣TOP50",
    asOf,
    sourceName: "凱基投信",
    sourceUrl: "https://example.com/official",
    sourceType: "official_issuer",
    constituents: entries.map(([symbol, weightPct]) => ({
      market: "TW", symbol, name: symbol, sector: "電子", weightPct
    })),
    ...changes
  };
}

const first = snapshot("2026-10-06", [["2330", 40], ["2317", 20], ["2454", 10]]);
const second = snapshot("2026-10-07", [["2330", 41], ["2454", 9], ["3008", 5]]);
const third = snapshot("2026-10-08", [["2330", 42], ["3008", 4], ["2454", 9]]);

describe("official ETF composition change tracking", () => {
  it("builds date-paired newest-first timeline and distinguishes all change types", () => {
    const events = buildEtfCompositionTimeline(third, [first, second, third]);
    expect(events).toHaveLength(2);
    expect(events.map((event) => [event.previousAsOf, event.currentAsOf])).toEqual([
      ["2026-10-07", "2026-10-08"], ["2026-10-06", "2026-10-07"]
    ]);
    expect(events[1]?.summary).toEqual({
      added: 1, removed: 1, increased: 1, decreased: 1, unchanged: 0
    });
    expect(events[1]?.changedCount).toBe(4);
    expect(events[1]?.rows.find((row) => row.symbol === "2317")).toMatchObject({
      changeType: "removed", previousWeightPct: 20, currentWeightPct: 0
    });
  });

  it("does not mix issuer snapshots with imported partial CSVs or other funds", () => {
    const imported = snapshot("2026-10-09", [["2330", 90]], { sourceType: "user_import" });
    const other = snapshot("2026-10-08", [["2330", 5]], { etfSymbol: "00935" });
    const events = buildEtfCompositionTimeline(imported, [first, second, imported, other]);
    expect(events).toHaveLength(1);
    expect(events[0]?.currentAsOf).toBe("2026-10-07");
    expect(events[0]?.summary).toMatchObject({ added: 1, removed: 1 });
  });

  it("handles one date as unavailable, never invents a prior snapshot", () => {
    expect(buildEtfCompositionTimeline(third, [third, third])).toEqual([]);
    expect(buildEtfCompositionTimeline(third, [])).toEqual([]);
  });

  it("deduplicates same-date cache entries and prefers current official data", () => {
    const staleThird = snapshot("2026-10-08", [["2330", 99]]);
    const events = buildEtfCompositionTimeline(third, [staleThird, second, third]);
    expect(events).toHaveLength(1);
    expect(events[0]?.latest.constituents[0]?.weightPct).toBe(42);
  });

  it("does not flag unchanged component weights as constituent changes", () => {
    const next = snapshot("2026-10-09", [["2330", 42], ["3008", 4], ["2454", 9]]);
    const events = buildEtfCompositionTimeline(next, [third]);
    expect(events[0]?.changedCount).toBe(0);
    expect(events[0]?.summary.unchanged).toBe(3);
  });

  it("tracks official same-date corrections with a distinct read fingerprint", () => {
    const base = buildEtfCompositionTimeline(third, [second])[0]!;
    const revised = snapshot("2026-10-08", [["2330", 43], ["3008", 3], ["2454", 9]]);
    const changed = buildEtfCompositionTimeline(revised, [second])[0]!;
    expect(etfTimelineFingerprint(base)).not.toBe(etfTimelineFingerprint(changed));
    expect(etfTimelineFingerprint(base)).toBe(etfTimelineFingerprint(buildEtfCompositionTimeline(third, [second])[0]!));
  });

  it("rejects out-of-order or cross-fund direct snapshot comparisons", async () => {
    const { compareEtfCompositionSnapshots } = await import("./etf-advanced-analysis");
    expect(() => compareEtfCompositionSnapshots(third, second)).toThrow();
    expect(() => compareEtfCompositionSnapshots(second, { ...third, etfSymbol: "00935" })).toThrow();
  });
});
