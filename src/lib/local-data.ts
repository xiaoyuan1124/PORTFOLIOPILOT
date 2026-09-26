import Papa from "papaparse";
import type { AppState, Holding } from "./types";
import { appStateSchema, backupSchema, holdingCsvRowSchema } from "./schema";

export function downloadText(filename: string, text: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function serializeBackup(state: AppState) {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    state: appStateSchema.parse(state)
  }, null, 2);
}

export function parseBackup(text: string): AppState {
  return backupSchema.parse(JSON.parse(text));
}

export function holdingsToCsv(holdings: Holding[]) {
  return Papa.unparse(holdings.map((holding) => ({
    symbol: holding.symbol,
    name: holding.name,
    market: holding.market,
    type: holding.type,
    quantity: holding.quantity,
    price: holding.price,
    averageCost: holding.averageCost,
    currency: holding.currency,
    sector: holding.sector
  })));
}

export function csvTemplate() {
  return Papa.unparse([{
    symbol: "2330",
    name: "台積電",
    market: "TW",
    type: "stock",
    quantity: 10,
    price: 1000,
    averageCost: 900,
    currency: "TWD",
    sector: "半導體"
  }]);
}

export function parseHoldingsCsv(text: string): Holding[] {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().replace(/^\uFEFF/, "")
  });

  if (parsed.errors.length) {
    throw new Error(`CSV 解析失敗：${parsed.errors[0]?.message ?? "格式錯誤"}`);
  }

  return parsed.data.map((row, index) => {
    const result = holdingCsvRowSchema.safeParse(row);
    if (!result.success) {
      throw new Error(`CSV 第 ${index + 2} 列格式不正確：${result.error.issues[0]?.message ?? "欄位錯誤"}`);
    }

    return {
      id: `csv-${Date.now()}-${index}`,
      ...result.data,
      symbol: result.data.symbol.toUpperCase()
    };
  });
}

export function mergeHoldings(existing: Holding[], incoming: Holding[]) {
  const map = new Map(existing.map((holding) => [`${holding.market}:${holding.symbol.toUpperCase()}`, holding]));
  for (const holding of incoming) {
    const key = `${holding.market}:${holding.symbol.toUpperCase()}`;
    const previous = map.get(key);
    map.set(key, previous ? { ...holding, id: previous.id } : holding);
  }
  return [...map.values()];
}
