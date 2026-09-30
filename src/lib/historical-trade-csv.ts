import Papa from "papaparse";
import type { AppState, Market } from "./types";
import { recordHistoricalTrade, type HistoricalTradeInput } from "./historical-trade";

const HEADER_ALIASES = {
  date: ["date", "tradedate", "transactiondate", "日期", "成交日期", "交易日期", "委託日期"],
  type: ["type", "side", "action", "買賣", "買賣別", "交易別", "交易類別", "成交類別"],
  market: ["market", "venue", "exchange", "市場", "市場別", "交易市場"],
  currency: ["currency", "ccy", "幣別", "交易幣別"],
  symbol: ["symbol", "ticker", "code", "代號", "股票代號", "證券代號", "商品代號", "標的代號"],
  quantity: ["quantity", "qty", "shares", "數量", "股數", "成交股數", "成交數量"],
  price: ["price", "executionprice", "成交價", "成交價格", "價格"],
  fee: ["fee", "commission", "手續費", "交易手續費", "成交手續費"],
  tax: ["tax", "transactiontax", "交易稅", "證交稅", "成交稅", "其他稅費"],
  fxRate: ["fxrate", "usd/twd", "usdtwd", "匯率", "成交匯率", "換匯匯率"],
  account: ["account", "accountno", "帳戶", "帳號", "證券帳號", "交易帳號", "券商帳戶"],
  tradeId: ["tradeid", "transactionid", "dealid", "成交序號", "成交編號", "交易序號", "交易編號"]
} as const;

type CanonicalField = keyof typeof HEADER_ALIASES;

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-／/()（）［］\[\]：:.]/g, "");
}

const aliasMap = new Map<string, CanonicalField>();
for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[CanonicalField, readonly string[]]>) {
  for (const alias of aliases) aliasMap.set(normalizeHeader(alias), field);
}

function canonicalHeader(header: string) {
  return aliasMap.get(normalizeHeader(header)) ?? null;
}

function rowValue(row: Record<string, unknown>, headerByField: Map<CanonicalField, string>, field: CanonicalField) {
  const header = headerByField.get(field);
  return header ? row[header] : undefined;
}

function requiredHeader(headerByField: Map<CanonicalField, string>, field: CanonicalField, label: string) {
  if (!headerByField.has(field)) {
    throw new Error(`歷史成交 CSV 缺少「${label}」欄位。`);
  }
}

function rawText(value: unknown) {
  return String(value ?? "").trim();
}

function parseNumber(value: unknown, label: string, rowNumber: number, allowZero: boolean) {
  const raw = rawText(value)
    .replace(/[,，]/g, "")
    .replace(/^(?:NT\$|TWD\$?|USD\$?|US\$|\$)/i, "");
  if (!raw) {
    throw new Error(`歷史成交 CSV 第 ${rowNumber} 列的「${label}」不可空白。`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || (allowZero ? parsed < 0 : parsed <= 0)) {
    throw new Error(`歷史成交 CSV 第 ${rowNumber} 列的「${label}」必須是${allowZero ? "大於或等於 0" : "大於 0"}的數字。`);
  }
  return parsed;
}

function normalizeSymbol(value: unknown, rowNumber: number) {
  const symbol = rawText(value)
    .replace(/^'+/, "")
    .toUpperCase();
  if (!symbol || !/^[0-9A-Z.]+$/.test(symbol)) {
    throw new Error(`歷史成交 CSV 第 ${rowNumber} 列的證券代號無法辨識：${symbol || "空白"}。`);
  }
  return symbol;
}

function validDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function dateKey(year: number, month: number, day: number, rowNumber: number) {
  if (!validDateParts(year, month, day)) {
    throw new Error(`歷史成交 CSV 第 ${rowNumber} 列的日期不存在。`);
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeTradeDate(value: unknown, rowNumber: number) {
  const raw = rawText(value)
    .replace(/年/g, "/")
    .replace(/月/g, "/")
    .replace(/日/g, "")
    .trim();

  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return dateKey(Number(compact[1]), Number(compact[2]), Number(compact[3]), rowNumber);
  }

  const separated = raw.match(/^(\d{2,4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!separated) {
    throw new Error(`歷史成交 CSV 第 ${rowNumber} 列的日期無法辨識：${raw || "空白"}。`);
  }

  let year = Number(separated[1]);
  const month = Number(separated[2]);
  const day = Number(separated[3]);
  if (year < 1911) year += 1911;
  return dateKey(year, month, day, rowNumber);
}

function normalizeTradeType(value: unknown, rowNumber: number): "buy" | "sell" {
  const normalized = rawText(value)
    .toLowerCase()
    .replace(/[\s_\-／/()（）]/g, "");

  const buys = new Set(["buy", "b", "買", "買進", "買入", "現股買進", "現股買入", "定期定額買進"]);
  const sells = new Set(["sell", "s", "賣", "賣出", "賣掉", "現股賣出"]);
  if (buys.has(normalized)) return "buy";
  if (sells.has(normalized)) return "sell";
  throw new Error(`歷史成交 CSV 第 ${rowNumber} 列的買賣別無法辨識：${rawText(value) || "空白"}。`);
}

function normalizeMarketToken(value: unknown, rowNumber: number): Market | null {
  const raw = rawText(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/[\s_\-／/()（）]/g, "");
  if (["tw", "taiwan", "台股", "台灣", "twse", "tpex", "tse", "otc", "上市", "上櫃"].includes(normalized)) return "TW";
  if (["us", "usa", "美股", "美國", "nasdaq", "nyse", "amex"].includes(normalized)) return "US";
  throw new Error(`歷史成交 CSV 第 ${rowNumber} 列的市場無法辨識：${raw}。`);
}

function normalizeCurrencyMarket(value: unknown, rowNumber: number): Market | null {
  const raw = rawText(value);
  if (!raw) return null;
  const normalized = raw.toUpperCase().replace(/[\s_\-]/g, "");
  if (["TWD", "NTD", "NT"].includes(normalized)) return "TW";
  if (["USD", "US"].includes(normalized)) return "US";
  throw new Error(`歷史成交 CSV 第 ${rowNumber} 列的幣別無法辨識：${raw}。`);
}

function resolveMarket(
  row: Record<string, unknown>,
  headerByField: Map<CanonicalField, string>,
  fallbackMarket: Market | null,
  rowNumber: number
) {
  const market = normalizeMarketToken(rowValue(row, headerByField, "market"), rowNumber);
  const currencyMarket = normalizeCurrencyMarket(rowValue(row, headerByField, "currency"), rowNumber);
  if (market && currencyMarket && market !== currencyMarket) {
    throw new Error(`歷史成交 CSV 第 ${rowNumber} 列的市場與幣別互相矛盾。`);
  }
  const resolved = market ?? currencyMarket ?? fallbackMarket;
  if (!resolved) {
    throw new Error(`歷史成交 CSV 第 ${rowNumber} 列缺少可確認的市場；請在 CSV 提供市場／幣別，或先選擇預設市場。`);
  }
  return resolved;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function historicalTradeCsvTemplate() {
  return Papa.unparse([
    {
      date: "2026-09-29",
      type: "buy",
      market: "TW",
      symbol: "2330",
      quantity: 10,
      price: 1000,
      fee: 20,
      tax: 0,
      fxRate: 1,
      account: "台股證券",
      tradeId: "optional-001"
    },
    {
      date: "2026-09-28",
      type: "sell",
      market: "US",
      symbol: "QQQM",
      quantity: 2,
      price: 250,
      fee: 1,
      tax: 0,
      fxRate: 31.5,
      account: "美股券商",
      tradeId: "optional-002"
    }
  ]);
}

export function parseHistoricalTradeCsv(
  text: string,
  fallbackAccount: string,
  fallbackMarket: Market | null
): HistoricalTradeInput[] {
  const accountFallback = fallbackAccount.trim();

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().replace(/^\uFEFF/, "")
  });

  if (parsed.errors.length) {
    throw new Error(`歷史成交 CSV 解析失敗：${parsed.errors[0]?.message ?? "格式錯誤"}`);
  }

  const headers = parsed.meta.fields ?? [];
  const headerByField = new Map<CanonicalField, string>();
  for (const header of headers) {
    const field = canonicalHeader(header);
    if (field && !headerByField.has(field)) headerByField.set(field, header);
  }

  requiredHeader(headerByField, "date", "成交日期");
  requiredHeader(headerByField, "type", "買賣別");
  requiredHeader(headerByField, "symbol", "證券代號");
  requiredHeader(headerByField, "quantity", "成交股數");
  requiredHeader(headerByField, "price", "成交價");
  requiredHeader(headerByField, "fee", "手續費");
  requiredHeader(headerByField, "tax", "交易稅");

  if (!parsed.data.length) {
    throw new Error("歷史成交 CSV 沒有可匯入的資料列。");
  }

  const occurrenceByContent = new Map<string, number>();
  const seenTradeIds = new Set<string>();

  return parsed.data.map((row, index) => {
    const rowNumber = index + 2;
    const date = normalizeTradeDate(rowValue(row, headerByField, "date"), rowNumber);
    const type = normalizeTradeType(rowValue(row, headerByField, "type"), rowNumber);
    const market = resolveMarket(row, headerByField, fallbackMarket, rowNumber);
    const symbol = normalizeSymbol(rowValue(row, headerByField, "symbol"), rowNumber);
    const quantity = parseNumber(rowValue(row, headerByField, "quantity"), "成交股數", rowNumber, false);
    const price = parseNumber(rowValue(row, headerByField, "price"), "成交價", rowNumber, false);
    const fee = parseNumber(rowValue(row, headerByField, "fee"), "手續費", rowNumber, true);
    const tax = parseNumber(rowValue(row, headerByField, "tax"), "交易稅", rowNumber, true);
    const account = rawText(rowValue(row, headerByField, "account")) || accountFallback;
    if (!account) {
      throw new Error(`歷史成交 CSV 第 ${rowNumber} 列沒有帳戶；請在 CSV 提供帳戶欄，或先填寫預設帳戶。`);
    }
    const fxRate = market === "TW"
      ? 1
      : parseNumber(rowValue(row, headerByField, "fxRate"), "交易當日 USD/TWD 匯率", rowNumber, false);
    const tradeId = rawText(rowValue(row, headerByField, "tradeId"));

    let importFingerprint: string;
    if (tradeId) {
      const tradeIdKey = `${market}|${account.toLowerCase()}|${tradeId.toLowerCase()}`;
      if (seenTradeIds.has(tradeIdKey)) {
        throw new Error(`歷史成交 CSV 第 ${rowNumber} 列的成交序號重複：${tradeId}。`);
      }
      seenTradeIds.add(tradeIdKey);
      importFingerprint = `csv-id-${stableHash(tradeIdKey)}`;
    } else {
      const contentKey = [
        date,
        type,
        market,
        symbol,
        account.toLowerCase(),
        quantity,
        price,
        fee,
        tax,
        fxRate
      ].join("|");
      const occurrence = (occurrenceByContent.get(contentKey) ?? 0) + 1;
      occurrenceByContent.set(contentKey, occurrence);
      importFingerprint = `csv-row-${stableHash(contentKey)}-${occurrence}`;
    }

    return {
      id: `historical-${importFingerprint}`,
      date,
      type,
      market,
      symbol,
      account,
      quantity,
      price,
      fee,
      tax,
      fxRate,
      note: "",
      importFingerprint
    };
  });
}

export function importHistoricalTradeCsv(
  state: AppState,
  text: string,
  fallbackAccount: string,
  fallbackMarket: Market | null
) {
  const inputs = parseHistoricalTradeCsv(text, fallbackAccount, fallbackMarket);
  let next = state;
  for (const input of inputs) {
    next = recordHistoricalTrade(next, input);
  }
  return {
    state: next,
    importedCount: inputs.length
  };
}
