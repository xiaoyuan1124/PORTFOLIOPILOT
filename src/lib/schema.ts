import { z } from "zod";

export const ETF_WEIGHT_EPSILON = 1e-6;

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
  priceSource: z.enum(["manual", "TWSE", "TPEx"]).optional(),
  priceAsOf: z.string().optional()
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
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  date: z.string().min(1),
  symbol: z.string(),
  title: z.string().min(1).max(200),
  thesis: z.string(),
  invalidation: z.string()
});

export const activitySchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  type: z.enum(["deposit", "withdrawal", "buy", "sell", "dividend", "fee"]),
  symbol: z.string(),
  amount: z.number().finite().nonnegative(),
  currency: z.enum(["TWD", "USD"]),
  fxRate: z.number().finite().positive(),
  quantity: z.number().finite().nonnegative(),
  price: z.number().finite().nonnegative(),
  note: z.string()
});

export const snapshotSchema = z.object({
  date: z.string().min(1),
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
  usdTwd: z.number().finite().positive()
});

export const backupSchema = z.union([
  z.object({
    version: z.union([z.literal(1), z.literal(2)]),
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
  sector: z.string().trim().min(1).max(120)
});

export const etfCompositionCsvRowSchema = z.object({
  etfMarket: z.enum(["TW", "US"]),
  etfSymbol: z.string().trim().min(1).max(32),
  etfName: z.string().trim().min(1).max(160),
  asOf: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceName: z.string().trim().min(1).max(240),
  sourceUrl: z.string().trim().url(),
  componentMarket: z.enum(["TW", "US"]),
  componentSymbol: z.string().trim().min(1).max(32),
  componentName: z.string().trim().min(1).max(160),
  weightPct: z.coerce.number().finite().positive().max(100),
  sector: z.string().trim().min(1).max(120)
});
