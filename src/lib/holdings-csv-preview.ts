import type { AppState, Holding } from "./types";
import { accountName, holdingIdentityKey, mergeHoldings } from "./local-data";
import { emptyState } from "./demo-data";

export type HoldingsImportChange = {
  key: string;
  label: string;
  account: string;
  kind: "new" | "replace" | "unchanged";
  beforeQuantity: number | null;
  afterQuantity: number;
  beforePrice: number | null;
  afterPrice: number;
  beforeAverageCost: number | null;
  afterAverageCost: number;
};

export type HoldingsCsvImportPreview = {
  source: "holdings" | "broker";
  fileName: string;
  importedCount: number;
  newCount: number;
  replacedCount: number;
  unchangedCount: number;
  beforeCount: number;
  afterCount: number;
  changes: HoldingsImportChange[];
  incoming: Holding[];
  beforeSignature: string;
};

/** Excludes derived daily snapshots (the shell regenerates today's value). */
export function csvImportStateSignature(state: AppState) {
  const { snapshots: _derivedSnapshots, ...stable } = state;
  void _derivedSnapshots;
  return JSON.stringify(stable);
}

function sameHoldingDetails(a: Holding, b: Holding) {
  // CSV can intentionally replace a stale official price with a manual
  // correction. Provenance, sector and cash classification are material.
  return a.symbol === b.symbol &&
    a.name === b.name &&
    a.market === b.market &&
    a.type === b.type &&
    a.quantity === b.quantity &&
    a.price === b.price &&
    a.averageCost === b.averageCost &&
    a.currency === b.currency &&
    a.sector === b.sector &&
    accountName(a.account) === accountName(b.account) &&
    a.priceSource === b.priceSource &&
    a.priceAsOf === b.priceAsOf;
}

export function previewHoldingsImport(
  state: AppState,
  source: HoldingsCsvImportPreview["source"],
  fileName: string,
  incoming: Holding[]
): HoldingsCsvImportPreview {
  if (!incoming.length) throw new Error("CSV 沒有可匯入的有效持股。");
  const base = state.dataMode === "demo" ? [] : state.holdings;
  const existing = new Map(base.map((holding) => [holdingIdentityKey(holding), holding]));
  const seen = new Set<string>();
  const changes = incoming.map((holding) => {
    const key = holdingIdentityKey(holding);
    if (seen.has(key)) throw new Error(`CSV 有重複部位 ${holding.symbol}／${accountName(holding.account)}，請先合併資料列。`);
    seen.add(key);
    const previous = existing.get(key);
    const kind: HoldingsImportChange["kind"] = !previous
      ? "new"
      : sameHoldingDetails(previous, holding) ? "unchanged" : "replace";
    return {
      key,
      label: `${holding.symbol} · ${holding.name}`,
      account: accountName(holding.account),
      kind,
      beforeQuantity: previous?.quantity ?? null,
      afterQuantity: holding.quantity,
      beforePrice: previous?.price ?? null,
      afterPrice: holding.price,
      beforeAverageCost: previous?.averageCost ?? null,
      afterAverageCost: holding.averageCost
    };
  });
  return {
    source,
    fileName,
    importedCount: incoming.length,
    newCount: changes.filter((row) => row.kind === "new").length,
    replacedCount: changes.filter((row) => row.kind === "replace").length,
    unchangedCount: changes.filter((row) => row.kind === "unchanged").length,
    beforeCount: base.length,
    afterCount: mergeHoldings(base, incoming).length,
    incoming,
    changes,
    beforeSignature: csvImportStateSignature(state)
  };
}

export function commitHoldingsImport(state: AppState, preview: HoldingsCsvImportPreview): AppState {
  if (csvImportStateSignature(state) !== preview.beforeSignature) {
    throw new Error("預覽後本機資料已有變動，為避免覆蓋較新的修改，請重新選擇 CSV 並檢查預覽。");
  }
  const base = state.dataMode === "demo" ? emptyState : state;
  // Normal merge preserves existing IDs for replaced rows; other app state
  // (transactions, journal, FX, watchlist, targets) remains untouched.
  return {
    ...base,
    dataMode: "personal",
    holdings: mergeHoldings(base.holdings, preview.incoming)
  };
}

export type HoldingsImportUndo = {
  fileName: string;
  source: HoldingsCsvImportPreview["source"];
  before: AppState;
  importedCount: number;
  afterSignature: string;
};

export function createHoldingsImportUndo(
  before: AppState,
  after: AppState,
  preview: HoldingsCsvImportPreview
): HoldingsImportUndo {
  return {
    fileName: preview.fileName,
    source: preview.source,
    before,
    importedCount: preview.importedCount,
    afterSignature: csvImportStateSignature(after)
  };
}

/**
 * Fail closed if anything besides derived snapshot history changed since
 * the CSV import. Undo must never silently revert a trade, cash flow or
 * subsequent edit from a different screen.
 */
export function undoHoldingsImport(current: AppState, checkpoint: HoldingsImportUndo): AppState {
  if (csvImportStateSignature(current) !== checkpoint.afterSignature) {
    throw new Error("匯入後已有其他資料變動，無法安全一鍵撤銷。請先匯出目前 JSON，再用匯入前備份人工比對還原。");
  }
  return {
    ...checkpoint.before,
    // Preserve interim historical snapshots; the shell recalculates today's
    // snapshot for the restored portfolio after the write.
    snapshots: current.snapshots
  };
}
