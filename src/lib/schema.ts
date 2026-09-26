import { z } from "zod";

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
  sector: z.string().min(1).max(120)
});

export const journalEntrySchema = z.object({
  id: z.string().min(1),
  date: z.string().min(1),
  symbol: z.string(),
  title: z.string().min(1).max(200),
  thesis: z.string(),
  invalidation: z.string()
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
  journal: z.array(journalEntrySchema),
  snapshots: z.array(snapshotSchema).default([]),
  usdTwd: z.number().finite().positive()
});

export const backupSchema = z.union([
  z.object({
    version: z.literal(1),
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
