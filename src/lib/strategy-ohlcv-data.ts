import { z } from "zod";
import type { StrategyCandle } from "./strategy-lab";

const candleRowSchema = z.tuple([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.number().finite().positive(),
  z.number().finite().positive(),
  z.number().finite().positive(),
  z.number().finite().positive(),
  z.number().finite().nonnegative()
]).refine((row) => row[2] >= Math.max(row[1], row[4]) && row[3] <= Math.min(row[1], row[4]), {
  message: "OHLC bounds are invalid"
});
const cacheSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  source: z.object({
    name: z.string().min(1),
    urlTemplate: z.string().url(),
    adjusted: z.literal(false),
    volumeUnit: z.literal("shares")
  }),
  securities: z.record(z.string(), z.object({
    market: z.literal("TWSE"), points: z.array(candleRowSchema)
  })),
  failed: z.array(z.object({
    symbol: z.string(), month: z.string(), reason: z.string()
  }))
});
export type StrategyOhlcvCache = z.infer<typeof cacheSchema>;
export function parseStrategyOhlcv(raw: unknown) {
  return cacheSchema.parse(raw);
}
export function strategyCandlesFromCache(
  cache: StrategyOhlcvCache | null,
  venue: "TWSE" | "TPEx",
  symbol: string
): StrategyCandle[] | null {
  if (venue !== "TWSE") return null;
  const rows = cache?.securities[symbol.trim().toUpperCase()]?.points;
  if (!rows || rows.length === 0) return null;
  return rows.map(([date, open, high, low, close, volume]) => ({ date, open, high, low, close, volume }));
}
export async function loadBundledStrategyOhlcv(): Promise<StrategyOhlcvCache> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const response = await fetch(base + "/data/tw-strategy-ohlcv.json?ts=" + Date.now(), { cache: "no-store" });
  if (!response.ok) throw new Error("官方 OHLCV 資料尚未建立。");
  return parseStrategyOhlcv(await response.json());
}


// Missing months are not treated as valid chronological training history.
// Expose the exact incomplete periods to block technical trade signals.
export function strategyOhlcvMissingMonths(
  cache: StrategyOhlcvCache | null,
  venue: "TWSE" | "TPEx",
  symbol: string
): string[] {
  if (venue !== "TWSE" || !cache) return [];
  return cache.failed.filter((item) => item.symbol === symbol).map((item) => item.month).sort();
}
