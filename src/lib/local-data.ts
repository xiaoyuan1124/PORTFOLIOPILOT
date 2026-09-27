import Papa from "papaparse";
import type { AppState, EtfComposition, Holding } from "./types";
import {
  appStateSchema,
  backupSchema,
  ETF_WEIGHT_EPSILON,
  etfCompositionCsvRowSchema,
  etfCompositionSchema,
  holdingCsvRowSchema
} from "./schema";

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
    version: 3,
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

export function etfCompositionCsvTemplate() {
  return [
    "etfMarket,etfSymbol,etfName,asOf,sourceName,sourceUrl,componentMarket,componentSymbol,componentName,weightPct,sector"
  ].join("\n");
}

export function etfCompositionsToCsv(compositions: EtfComposition[]) {
  return Papa.unparse(compositions.flatMap((composition) =>
    composition.constituents.map((component) => ({
      etfMarket: composition.etfMarket,
      etfSymbol: composition.etfSymbol,
      etfName: composition.etfName,
      asOf: composition.asOf,
      sourceName: composition.sourceName,
      sourceUrl: composition.sourceUrl,
      componentMarket: component.market,
      componentSymbol: component.symbol,
      componentName: component.name,
      weightPct: component.weightPct,
      sector: component.sector
    }))
  ));
}

export function parseEtfCompositionCsv(text: string): EtfComposition[] {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().replace(/^\uFEFF/, "")
  });

  if (parsed.errors.length) {
    throw new Error(`ETF 成分 CSV 解析失敗：${parsed.errors[0]?.message ?? "格式錯誤"}`);
  }

  const groups = new Map<string, {
    metadata: {
      etfMarket: "TW" | "US";
      etfSymbol: string;
      etfName: string;
      asOf: string;
      sourceName: string;
      sourceUrl: string;
    };
    components: Map<string, {
      market: "TW" | "US";
      symbol: string;
      name: string;
      weightPct: number;
      sector: string;
    }>;
  }>();

  parsed.data.forEach((row, index) => {
    const result = etfCompositionCsvRowSchema.safeParse(row);
    if (!result.success) {
      throw new Error(`ETF 成分 CSV 第 ${index + 2} 列格式不正確：${result.error.issues[0]?.message ?? "欄位錯誤"}`);
    }

    const data = result.data;
    const etfSymbol = data.etfSymbol.toUpperCase();
    const componentSymbol = data.componentSymbol.toUpperCase();
    const groupKey = `${data.etfMarket}:${etfSymbol}`;
    const current = groups.get(groupKey);
    const metadata = {
      etfMarket: data.etfMarket,
      etfSymbol,
      etfName: data.etfName,
      asOf: data.asOf,
      sourceName: data.sourceName,
      sourceUrl: data.sourceUrl
    };

    if (current) {
      const comparable = current.metadata;
      if (
        comparable.etfName !== metadata.etfName ||
        comparable.asOf !== metadata.asOf ||
        comparable.sourceName !== metadata.sourceName ||
        comparable.sourceUrl !== metadata.sourceUrl
      ) {
        throw new Error(`ETF ${etfSymbol} 的名稱、資料日或來源在 CSV 中不一致。`);
      }
    }

    const group = current ?? { metadata, components: new Map() };
    const componentKey = `${data.componentMarket}:${componentSymbol}`;
    const previous = group.components.get(componentKey);
    group.components.set(componentKey, {
      market: data.componentMarket,
      symbol: componentSymbol,
      name: data.componentName,
      weightPct: (previous?.weightPct ?? 0) + data.weightPct,
      sector: data.sector
    });
    groups.set(groupKey, group);
  });

  return [...groups.entries()].map(([groupKey, group]) => {
    const constituents = [...group.components.values()];
    const coveragePct = constituents.reduce((sum, component) => sum + component.weightPct, 0);
    if (coveragePct > 100 + ETF_WEIGHT_EPSILON) {
      throw new Error(`ETF ${group.metadata.etfSymbol} 的成分權重合計為 ${coveragePct.toFixed(2)}%，超過可接受的 100%。`);
    }

    return etfCompositionSchema.parse({
      id: `composition:${groupKey}`,
      ...group.metadata,
      sourceType: "user_import",
      constituents
    });
  });
}

export function mergeEtfCompositions(existing: EtfComposition[], incoming: EtfComposition[]) {
  const map = new Map(existing.map((composition) => [
    `${composition.etfMarket}:${composition.etfSymbol.toUpperCase()}`,
    composition
  ]));

  for (const composition of incoming) {
    map.set(`${composition.etfMarket}:${composition.etfSymbol.toUpperCase()}`, composition);
  }

  return [...map.values()];
}
