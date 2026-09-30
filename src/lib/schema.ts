import { z } from "zod";

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
  quantity: z.number().finite().nonnegative(),
  price: z.number().finite().nonnegative(),
  averageCost: z.number().finite().nonnegative(),
  currency: z.enum(["TWD", "USD"]),
  sector: z.string().min(1).max(120),
  account: z.string().trim().min(1).max(120).optional(),
  priceSource: z.enum(["manual", "TWSE", "TPEx"]).optional(),
  priceAsOf: dateKeySchema.optional()
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
  amount: z.number().finite().nonnegative(),
  currency: z.enum(["TWD", "USD"]),
  fxRate: z.number().finite().positive(),
  quantity: z.number().finite().nonnegative(),
  price: z.number().finite().nonnegative(),
  note: z.string(),
  account: z.string().trim().min(1).max(120).optional(),
  preFlowValueTwd: z.number().finite().nonnegative().optional()
}).superRefine((activity, ctx) => {
  if (activity.preFlowValueTwd !== undefined && activity.type !== "deposit" && activity.type !== "withdrawal") {
    ctx.addIssue({
      code: "custom",
      path: ["preFlowValueTwd"],
      message: "TWR 邊界估值只適用於入金或出金。"
    });
  }
});

export const snapshotSchema = z.object({
  date: dateKeySchema,
  total: z.number().finite().nonnegative(),
  cost: z.number().finite().nonnegative(),
  gain: z.number().finite(),
  usdTwd: z.number().finite().positive()
});

export const appStateSchema = z.object({
  holdings: z.array(holdingSchema),
  etfCompositions: z.array(etfCompositionSchema).default([]),
  journal: z.array(journalEntrySchema),
  activities: z.array(activitySchema).default([]),
  snapshots: z.array(snapshotSchema).default([]),
  usdTwd: z.number().finite().positive(),
  dataMode: z.enum(["personal", "demo"]).default("personal")
});

export const backupSchema = z.union([
  z.object({
    version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
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
  quantity: z.coerce.number().finite().nonnegative(),
  price: z.coerce.number().finite().nonnegative(),
  averageCost: z.coerce.number().finite().nonnegative(),
  currency: z.enum(["TWD", "USD"]),
  sector: z.string().trim().min(1).max(120),
  account: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).max(120).optional()
  )
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
