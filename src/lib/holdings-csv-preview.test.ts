import { describe, expect, it } from "vitest";
import type { AppState, Holding } from "./types";
import { emptyState, demoState } from "./demo-data";
import { commitHoldingsImport, createHoldingsImportUndo, previewHoldingsImport, undoHoldingsImport } from "./holdings-csv-preview";

function holding(symbol: string, quantity: number, patch: Partial<Holding> = {}): Holding {
  return {
    id: `row-${symbol}`,
    market: "TW",
    symbol,
    name: symbol,
    type: "stock",
    quantity,
    price: 100,
    averageCost: 80,
    sector: "半導體",
    currency: "TWD",
    account: "券商A",
    ...patch
  };
}
function state(holdings: Holding[]): AppState {
  return { ...emptyState, holdings };
}

describe("holdings/broker CSV import preview and safe undo", () => {
  it("previews added, overwritten and identical rows with account-aware grouping and no mutation", () => {
    const current = state([holding("2330", 10), holding("2317", 8)]);
    const original = JSON.stringify(current);
    const preview = previewHoldingsImport(current, "holdings", "positions.csv", [
      holding("2330", 20, { id: "new-csv-id" }),
      holding("2317", 8, { id: "different-csv-id" }),
      holding("2330", 5, { id: "account-b", account: "券商B" })
    ]);
    expect(preview).toMatchObject({
      importedCount: 3, newCount: 1, replacedCount: 1,
      unchangedCount: 1, beforeCount: 2, afterCount: 3
    });
    expect(preview.changes.map((row) => row.kind)).toEqual(["replace", "unchanged", "new"]);
    expect(JSON.stringify(current)).toBe(original);
    const committed = commitHoldingsImport(current, preview);
    expect(committed.holdings.find((h) => h.account === "券商A" && h.symbol === "2330")).toMatchObject({
      id: "row-2330", quantity: 20
    });
    expect(committed.holdings.find((h) => h.account === "券商B")).toMatchObject({ quantity: 5 });
  });

  it("requires fresh preview when records change while user is reviewing", () => {
    const current = state([holding("2330", 10)]);
    const preview = previewHoldingsImport(current, "broker", "broker.csv", [holding("2330", 12)]);
    expect(() => commitHoldingsImport(state([holding("2330", 15)]), preview)).toThrow(/重新選擇 CSV/);
  });

  it("undoes an import but preserves latest generated snapshots", () => {
    const current: AppState = { ...state([holding("2330", 10)]), journal: [{ id: "j1", date: "2026-10-08", symbol: "2330", title: "A", thesis: "", invalidation: "" }] };
    const incoming = [holding("2330", 20), holding("2317", 8)];
    const preview = previewHoldingsImport(current, "holdings", "holdings.csv", incoming);
    const after = commitHoldingsImport(current, preview);
    const checkpoint = createHoldingsImportUndo(current, after, preview);
    const withNewSnapshot = { ...after, snapshots: [{ date: "2026-10-09", total: 5000, cost: 4000, gain: 1000, usdTwd: after.usdTwd }] };
    const restored = undoHoldingsImport(withNewSnapshot, checkpoint);
    expect(restored.holdings).toEqual(current.holdings);
    expect(restored.journal).toEqual(current.journal);
    expect(restored.snapshots).toEqual(withNewSnapshot.snapshots);
    expect(after.holdings).toHaveLength(2);
  });

  it("blocks undo after later buy/sell, other holdings edit, FX or journal changes", () => {
    const before = state([holding("2330", 10)]);
    const preview = previewHoldingsImport(before, "holdings", "holdings.csv", [holding("2330", 20)]);
    const after = commitHoldingsImport(before, preview);
    const undo = createHoldingsImportUndo(before, after, preview);
    expect(() => undoHoldingsImport({ ...after, holdings: [holding("2330", 30)] }, undo)).toThrow(/無法安全/);
    expect(() => undoHoldingsImport({ ...after, usdTwd: 40 }, undo)).toThrow(/無法安全/);
    expect(() => undoHoldingsImport({ ...after, activities: [{
      id: "t", date: "2026-10-09", type: "deposit", symbol: "", amount: 100,
      currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: ""
    }] }, undo)).toThrow(/無法安全/);
    expect(() => undoHoldingsImport({ ...after, journal: [{ id: "j", date: "2026-10-08", title: "test", thesis: "", symbol: "", invalidation: "" }] }, undo)).toThrow(/無法安全/);
  });

  it("rejects repeated identities and empty CSV without a partial write", () => {
    const before = state([holding("2330", 10)]);
    expect(() => previewHoldingsImport(before, "holdings", "blank.csv", [])).toThrow(/沒有可匯入/);
    expect(() => previewHoldingsImport(before, "holdings", "dup.csv", [
      holding("2330", 10), holding("2330", 12)
    ])).toThrow(/重複部位/);
  });

  it("replaces demo-only holdings and can restore the original demo state", () => {
    const preview = previewHoldingsImport(demoState, "holdings", "mine.csv", [holding("2330", 2)]);
    const after = commitHoldingsImport(demoState, preview);
    expect(after.dataMode).toBe("personal");
    expect(after.holdings).toHaveLength(1);
    expect(after.activities).toHaveLength(0);
    const undo = createHoldingsImportUndo(demoState, after, preview);
    const restored = undoHoldingsImport(after, undo);
    expect(restored.dataMode).toBe("demo");
    expect(restored.holdings).toEqual(demoState.holdings);
  });
});
