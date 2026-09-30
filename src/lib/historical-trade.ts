import type { AppState, Market, PortfolioActivity } from "./types";
import { localDateKey } from "./calc";
import { accountName } from "./local-data";

export type HistoricalTradeInput = {
  id: string;
  date: string;
  type: "buy" | "sell";
  market: Market;
  symbol: string;
  account: string;
  quantity: number;
  price: number;
  fee: number;
  tax: number;
  fxRate: number;
  note: string;
  importFingerprint?: string;
  importBatchId?: string;
  importFileName?: string;
};

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}必須大於 0。`);
  }
}

function assertNonnegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label}不可小於 0。`);
  }
}

export function recordHistoricalTrade(
  state: AppState,
  input: HistoricalTradeInput
): AppState {
  const today = localDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error("歷史買賣日期格式必須為 YYYY-MM-DD。");
  }
  if (input.date >= today) {
    throw new Error("歷史買賣補登只接受今天以前的日期；今天實際發生的交易請使用持股連動買進／賣出。");
  }
  if (
    input.importFingerprint &&
    state.activities.some((activity) =>
      activity.historicalTrade?.importFingerprint === input.importFingerprint
    )
  ) {
    throw new Error("這筆 CSV 歷史交易已經匯入過，為避免重複計入已停止匯入。");
  }
  if (input.importBatchId && !input.importFingerprint) {
    throw new Error("CSV 批次識別不可缺少逐筆 fingerprint。");
  }
  if (input.importFileName && !input.importFingerprint) {
    throw new Error("CSV 來源檔名不可缺少逐筆 fingerprint。");
  }
  if (state.activities.some((activity) => activity.id === input.id)) {
    throw new Error("交易紀錄 ID 已存在，請重新建立這筆補登。");
  }

  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) throw new Error("歷史買賣必須包含股票／ETF 代號。");
  assertPositive(input.quantity, "成交數量");
  assertPositive(input.price, "成交價");
  assertNonnegative(input.fee, "手續費");
  assertNonnegative(input.tax, "交易稅");
  assertPositive(input.fxRate, "歷史匯率");

  const currency = input.market === "TW" ? "TWD" as const : "USD" as const;
  const fxRate = currency === "TWD" ? 1 : input.fxRate;
  const gross = input.quantity * input.price;
  const amount = input.type === "buy"
    ? gross + input.fee + input.tax
    : gross - input.fee - input.tax;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("歷史賣出淨收入必須大於 0，請檢查成交價、手續費與交易稅。");
  }

  const activity: PortfolioActivity = {
    id: input.id,
    date: input.date,
    type: input.type,
    symbol,
    amount,
    currency,
    fxRate,
    quantity: input.quantity,
    price: input.price,
    note: input.note.trim(),
    account: accountName(input.account),
    historicalTrade: {
      mode: "ledger_only",
      market: input.market,
      fee: input.fee,
      tax: input.tax,
      ...(input.importFingerprint
        ? {
            importSource: "csv" as const,
            importFingerprint: input.importFingerprint,
            ...(input.importBatchId ? { importBatchId: input.importBatchId } : {}),
            ...(input.importFileName ? { importFileName: input.importFileName } : {})
          }
        : {})
    }
  };

  return {
    ...state,
    activities: [...state.activities, activity]
  };
}
