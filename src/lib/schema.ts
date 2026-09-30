import { z } from "zod";
import { isExternalActivityType, isTradeActivityType, normalizeActivitySecurityFields } from "./activity-data";

export const ETF_WEIGHT_EPSILON = 1e-6;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDateKey(value: string) {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === (month ?? 1) - 1 &&
    date.getUTCDate() === day;
}

export const dateKeySchema = z.string().trim()
  .regex(DATE_KEY_PATTERN, "日期必須使用 YYYY-MM-DD 格式。")
  .refine(isCalendarDateKey, "日期不是有效的曆日。");

export const holdingSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1).max(32),
  name: z.string().min(1).max(160),
  market: z.enum(["TW", "US"]),
  type: z.enum(["stock", "etf", "cash"]),
  quantity: z.number().finite().positive("持股數量必須大於 0。"),
  price: z.number().finite().positive("目前價格／現金餘額必須大於 0。"),
  averageCost: z.number().finite().nonnegative(),
  currency: z.enum(["TWD", "USD"]),
  sector: z.string().min(1).max(120),
  account: z.string().trim().min(1).max(120).optional(),
  priceSource: z.enum(["manual", "TWSE", "TPEx"]).optional(),
  priceAsOf: dateKeySchema.optional()
}).superRefine((holding, ctx) => {
  if (holding.type !== "cash" && holding.averageCost <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["averageCost"],
      message: "股票／ETF 平均成本必須大於 0。"
    });
  }

  if ((holding.market === "TW" && holding.currency !== "TWD") ||
      (holding.market === "US" && holding.currency !== "USD")) {
    ctx.addIssue({
      code: "custom",
      path: ["currency"],
      message: "持股市場與幣別不一致，可能造成資產換匯錯誤。"
    });
  }

  if (holding.type === "cash" && (holding.priceSource !== undefined || holding.priceAsOf !== undefined)) {
    ctx.addIssue({
      code: "custom",
      path: ["priceSource"],
      message: "現金不可附帶證券市場價格來源或資料日。"
    });
  }

  if ((holding.priceSource === "TWSE" || holding.priceSource === "TPEx") && holding.market !== "TW") {
    ctx.addIssue({
      code: "custom",
      path: ["priceSource"],
      message: "TWSE／TPEx 價格來源只能套用於台灣持股。"
    });
  }

  if ((holding.priceSource === "TWSE" || holding.priceSource === "TPEx") && !holding.priceAsOf) {
    ctx.addIssue({
      code: "custom",
      path: ["priceAsOf"],
      message: "官方價格來源必須同時保留資料日。"
    });
  }

  if (holding.priceAsOf && !holding.priceSource) {
    ctx.addIssue({
      code: "custom",
      path: ["priceSource"],
      message: "價格資料日不可缺少對應來源。"
    });
  }
});

export const etfConstituentSchema = z.object({
  market: z.enum(["TW", "US"]),
  symbol: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  weightPct: z.number().finite().positive().max(100),
  sector: z.string().trim().min(1).max(120)
});

export const etfCompositionSchema = z.object({
  id: z.string().min(1),
  etfMarket: z.enum(["TW", "US"]),
  etfSymbol: z.string().trim().min(1).max(32),
  etfName: z.string().trim().min(1).max(160),
  asOf: dateKeySchema,
  sourceName: z.string().trim().min(1).max(240),
  sourceUrl: z.string().url(),
  sourceType: z.enum(["user_import", "official_issuer", "official_exchange"]),
  constituents: z.array(etfConstituentSchema).min(1)
}).superRefine((composition, ctx) => {
  const totalWeight = composition.constituents.reduce((sum, item) => sum + item.weightPct, 0);
  if (totalWeight > 100 + ETF_WEIGHT_EPSILON) {
    ctx.addIssue({
      code: "custom",
      path: ["constituents"],
      message: `成分權重合計為 ${totalWeight.toFixed(2)}%，不可超過 100%。`
    });
  }
});

export const journalEntrySchema = z.object({
  id: z.string().min(1),
  date: dateKeySchema,
  symbol: z.string(),
  title: z.string().min(1).max(200),
  thesis: z.string(),
  invalidation: z.string()
});

export const activitySchema = z.object({
  id: z.string().min(1),
  date: dateKeySchema,
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  type: z.enum(["deposit", "withdrawal", "buy", "sell", "dividend", "fee"]),
  symbol: z.string(),
  amount: z.number().finite().positive("交易／現金流金額必須大於 0。"),
  currency: z.enum(["TWD", "USD"]),
  fxRate: z.number().finite().positive(),
  quantity: z.number().finite().nonnegative(),
  price: z.number().finite().nonnegative(),
  note: z.string(),
  account: z.string().trim().min(1).max(120).optional(),
  preFlowValueTwd: z.number().finite().nonnegative().optional()
}).superRefine((activity, ctx) => {
  if (isTradeActivityType(activity.type) && !activity.symbol.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["symbol"],
      message: "買進／賣出紀錄必須包含股票代號。"
    });
  }

  if (activity.preFlowValueTwd !== undefined && !isExternalActivityType(activity.type)) {
    ctx.addIssue({
      code: "custom",
      path: ["preFlowValueTwd"],
      message: "TWR 邊界估值只適用於入金或出金。"
    });
  }
}).transform((activity) => {
  const normalized = {
    ...activity,
    fxRate: activity.currency === "TWD" ? 1 : activity.fxRate,
    ...normalizeActivitySecurityFields(activity.type, activity.symbol, activity.quantity, activity.price)
  };

  if (!isExternalActivityType(activity.type)) {
    delete normalized.time;
    delete normalized.preFlowValueTwd;
  }

  return normalized;
});

export const snapshotSchema = z.object({
  date: dateKeySchema,
  total: z.number().finite().nonnegative(),
  cost: z.number().finite().nonnegative(),
  gain: z.number().finite(),
  usdTwd: z.number().finite().positive()
});

export const allocationTargetSchema = z.object({
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  targetPct: z.number().finite().positive("目標配置必須大於 0。").max(100)
});

function duplicateIndexes<T>(items: T[], keyOf: (item: T) => string) {
  const seen = new Set<string>();
  const duplicates: number[] = [];

  items.forEach((item, index) => {
    const key = keyOf(item);
    if (seen.has(key)) duplicates.push(index);
    else seen.add(key);
  });

  return duplicates;
}

function normalizedAccountKey(account?: string) {
  return (account?.trim() || "預設帳戶").toLowerCase();
}

export const appStateSchema = z.object({
  holdings: z.array(holdingSchema),
  etfCompositions: z.array(etfCompositionSchema).default([]),
  journal: z.array(journalEntrySchema),
  activities: z.array(activitySchema).default([]),
  snapshots: z.array(snapshotSchema).default([]),
  allocationTargets: z.array(allocationTargetSchema).default([]),
  usdTwd: z.number().finite().positive(),
  dataMode: z.enum(["personal", "demo"]).default("personal")
}).superRefine((state, ctx) => {
  for (const index of duplicateIndexes(
    state.holdings,
    (holding) => `${holding.market}:${holding.symbol.trim().toUpperCase()}:${normalizedAccountKey(holding.account)}`
  )) {
    ctx.addIssue({
      code: "custom",
      path: ["holdings", index],
      message: "同一市場、代號與帳戶不可重複建立持股。"
    });
  }

  for (const index of duplicateIndexes(state.holdings, (item) => item.id)) {
    ctx.addIssue({
      code: "custom",
      path: ["holdings", index, "id"],
      message: "同一類型資料不可使用重複 ID。"
    });
  }

  for (const index of duplicateIndexes(state.etfCompositions, (item) => item.id)) {
    ctx.addIssue({
      code: "custom",
      path: ["etfCompositions", index, "id"],
      message: "同一類型資料不可使用重複 ID。"
    });
  }

  for (const index of duplicateIndexes(state.journal, (item) => item.id)) {
    ctx.addIssue({
      code: "custom",
      path: ["journal", index, "id"],
      message: "同一類型資料不可使用重複 ID。"
    });
  }

  for (const index of duplicateIndexes(state.activities, (item) => item.id)) {
    ctx.addIssue({
      code: "custom",
      path: ["activities", index, "id"],
      message: "同一類型資料不可使用重複 ID。"
    });
  }

  for (const index of duplicateIndexes(
    state.etfCompositions,
    (composition) => `${composition.etfMarket}:${composition.etfSymbol.trim().toUpperCase()}`
  )) {
    ctx.addIssue({
      code: "custom",
      path: ["etfCompositions", index],
      message: "同一市場與 ETF 代號只能保留一份成分資料。"
    });
  }

  for (const index of duplicateIndexes(state.snapshots, (snapshot) => snapshot.date)) {
    ctx.addIssue({
      code: "custom",
      path: ["snapshots", index, "date"],
      message: "同一天只能有一筆淨值快照。"
    });
  }

  for (const index of duplicateIndexes(state.allocationTargets, (target) => target.key.toLowerCase())) {
    ctx.addIssue({
      code: "custom",
      path: ["allocationTargets", index, "key"],
      message: "同一個配置目標不可重複。"
    });
  }

  if (state.allocationTargets.length) {
    const total = state.allocationTargets.reduce((sum, target) => sum + target.targetPct, 0);
    if (Math.abs(total - 100) > 0.05) {
      ctx.addIssue({
        code: "custom",
        path: ["allocationTargets"],
        message: "配置目標合計必須為 100%。"
      });
    }
  }
});

export const backupSchema = z.union([
  z.object({
    version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    exportedAt: z.string(),
    state: appStateSchema
  }).transform((value) => value.state),
  appStateSchema
]);

export const holdingCsvRowSchema = z.object({
  symbol: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  market: z.enum(["TW", "US"]),
  type: z.enum(["stock", "etf", "cash"]),
  quantity: z.coerce.number().finite().positive("持股數量必須大於 0。"),
  price: z.coerce.number().finite().positive("目前價格／現金餘額必須大於 0。"),
  averageCost: z.coerce.number().finite().nonnegative(),
  currency: z.enum(["TWD", "USD"]),
  sector: z.string().trim().min(1).max(120),
  account: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).max(120).optional()
  )
}).superRefine((holding, ctx) => {
  if (holding.type !== "cash" && holding.averageCost <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["averageCost"],
      message: "股票／ETF 平均成本必須大於 0。"
    });
  }

  if ((holding.market === "TW" && holding.currency !== "TWD") ||
      (holding.market === "US" && holding.currency !== "USD")) {
    ctx.addIssue({
      code: "custom",
      path: ["currency"],
      message: "持股市場與幣別不一致，可能造成資產換匯錯誤。"
    });
  }
});

export const etfCompositionCsvRowSchema = z.object({
  etfMarket: z.enum(["TW", "US"]),
  etfSymbol: z.string().trim().min(1).max(32),
  etfName: z.string().trim().min(1).max(160),
  asOf: dateKeySchema,
  sourceName: z.string().trim().min(1).max(240),
  sourceUrl: z.string().trim().url(),
  componentMarket: z.enum(["TW", "US"]),
  componentSymbol: z.string().trim().min(1).max(32),
  componentName: z.string().trim().min(1).max(160),
  weightPct: z.coerce.number().finite().positive().max(100),
  sector: z.string().trim().min(1).max(120)
});
