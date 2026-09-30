import Papa from "papaparse";
import type { Holding } from "./types";
import type { HoldingLookupCandidate } from "./holding-autofill";
import { holdingSchema } from "./schema";

const HEADER_ALIASES = {
  symbol: ["symbol", "code", "代號", "股票代號", "證券代號", "商品代號", "標的代號"],
  name: ["name", "名稱", "股票名稱", "證券名稱", "商品名稱"],
  quantity: ["quantity", "qty", "數量", "股數", "持股數", "持有股數", "庫存股數", "持有數量", "庫存數量"],
  averageCost: ["averagecost", "avgcost", "avgprice", "平均成本", "成本均價", "庫存均價", "持有成本", "成本價"],
  account: ["account", "帳戶", "帳號", "證券帳號", "交易帳號", "券商帳戶"],
  venue: ["venue", "exchange", "市場", "市場別", "交易市場", "上市櫃", "掛牌市場"]
} as const;

type CanonicalField = keyof typeof HEADER_ALIASES;

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-／/()（）［］\[\]：:]/g, "");
}

const aliasMap = new Map<string, CanonicalField>();
for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[CanonicalField, readonly string[]]>) {
  for (const alias of aliases) aliasMap.set(normalizeHeader(alias), field);
}

function canonicalHeader(header: string) {
  return aliasMap.get(normalizeHeader(header)) ?? null;
}

function parsePositiveNumber(value: unknown, label: string, rowNumber: number) {
  const raw = String(value ?? "")
    .trim()
    .replace(/[,，]/g, "")
    .replace(/^(?:NT\$|TWD\$?|\$)/i, "");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`券商 CSV 第 ${rowNumber} 列的「${label}」必須是大於 0 的數字。`);
  }
  return parsed;
}

function normalizeSymbol(value: unknown, rowNumber: number) {
  const symbol = String(value ?? "")
    .trim()
    .replace(/^'+/, "")
    .toUpperCase();

  if (!symbol || !/^[0-9A-Z]+$/.test(symbol)) {
    throw new Error(`券商 CSV 第 ${rowNumber} 列的證券代號無法辨識：${symbol || "空白"}。`);
  }
  return symbol;
}

function normalizeVenue(value: unknown, rowNumber: number): "TWSE" | "TPEx" | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/[\s_\-／/()（）]/g, "");

  if (["twse", "tse", "sii", "上市", "集中市場", "上市公司"].includes(normalized)) return "TWSE";
  if (["tpex", "otc", "上櫃", "櫃買", "店頭市場", "上櫃公司"].includes(normalized)) return "TPEx";

  throw new Error(`券商 CSV 第 ${rowNumber} 列的市場欄位無法辨識：${raw}。請使用上市／上櫃、TWSE／TPEx，或移除該欄讓系統以官方資料唯一匹配。`);
}

function rowValue(row: Record<string, unknown>, headerByField: Map<CanonicalField, string>, field: CanonicalField) {
  const header = headerByField.get(field);
  return header ? row[header] : undefined;
}

function requiredHeader(headerByField: Map<CanonicalField, string>, field: CanonicalField, label: string) {
  if (!headerByField.has(field)) {
    throw new Error(`券商庫存 CSV 缺少「${label}」欄位。支援常見中文欄名；至少需要證券代號、持有股數與平均成本。`);
  }
}

function candidateForRow(
  catalog: HoldingLookupCandidate[],
  symbol: string,
  venue: "TWSE" | "TPEx" | null,
  rowNumber: number
) {
  const matches = catalog.filter((candidate) => candidate.code.trim().toUpperCase() === symbol);
  const candidate = venue
    ? matches.find((item) => item.venue === venue)
    : matches.length === 1
      ? matches[0]
      : undefined;

  if (!candidate) {
    if (matches.length > 1 && !venue) {
      throw new Error(`券商 CSV 第 ${rowNumber} 列的 ${symbol} 同時出現在不同市場，請在 CSV 加上市場欄（上市／上櫃）後再匯入。`);
    }
    throw new Error(`券商 CSV 第 ${rowNumber} 列的 ${symbol} 無法在目前 TWSE／TPEx 官方標的快取中唯一確認，因此未匯入。`);
  }
  if (!Number.isFinite(candidate.close) || candidate.close <= 0) {
    throw new Error(`券商 CSV 第 ${rowNumber} 列的 ${symbol} 目前沒有可用的官方收盤價，因此未匯入。`);
  }
  return candidate;
}

export function parseTaiwanBrokerInventoryCsv(
  text: string,
  fallbackAccount: string,
  catalog: HoldingLookupCandidate[]
): Holding[] {
  const accountFallback = fallbackAccount.trim();
  if (!accountFallback) {
    throw new Error("請先填寫這份券商庫存要匯入的預設帳戶名稱。");
  }

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().replace(/^\uFEFF/, "")
  });

  if (parsed.errors.length) {
    throw new Error(`券商 CSV 解析失敗：${parsed.errors[0]?.message ?? "格式錯誤"}`);
  }

  const headers = parsed.meta.fields ?? [];
  const headerByField = new Map<CanonicalField, string>();
  for (const header of headers) {
    const field = canonicalHeader(header);
    if (field && !headerByField.has(field)) headerByField.set(field, header);
  }

  requiredHeader(headerByField, "symbol", "證券代號");
  requiredHeader(headerByField, "quantity", "持有股數");
  requiredHeader(headerByField, "averageCost", "平均成本");

  const nowKey = Date.now();
  const holdings = parsed.data.map((row, index) => {
    const rowNumber = index + 2;
    const symbol = normalizeSymbol(rowValue(row, headerByField, "symbol"), rowNumber);
    const quantity = parsePositiveNumber(rowValue(row, headerByField, "quantity"), "持有股數", rowNumber);
    const averageCost = parsePositiveNumber(rowValue(row, headerByField, "averageCost"), "平均成本", rowNumber);
    const venue = normalizeVenue(rowValue(row, headerByField, "venue"), rowNumber);
    const candidate = candidateForRow(catalog, symbol, venue, rowNumber);
    const account = String(rowValue(row, headerByField, "account") ?? "").trim() || accountFallback;

    const holding = holdingSchema.parse({
      id: `broker-${nowKey}-${index}`,
      symbol: candidate.code.toUpperCase(),
      name: candidate.name,
      market: "TW",
      type: candidate.type,
      quantity,
      price: candidate.close,
      averageCost,
      currency: "TWD",
      sector: candidate.industry,
      account,
      priceSource: candidate.venue,
      priceAsOf: candidate.date
    });

    return holding;
  });

  if (!holdings.length) {
    throw new Error("券商庫存 CSV 沒有可匯入的資料列。");
  }

  const seen = new Set<string>();
  for (const holding of holdings) {
    const key = `${holding.market}:${holding.symbol.toUpperCase()}:${(holding.account ?? "").trim().toLowerCase()}`;
    if (seen.has(key)) {
      throw new Error(`券商 CSV 內有重複持股：${holding.symbol}／${holding.account}。請先合併成單一庫存列。`);
    }
    seen.add(key);
  }

  return holdings;
}
