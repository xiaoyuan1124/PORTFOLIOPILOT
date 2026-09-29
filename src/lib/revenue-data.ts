import { z } from "zod";
import { twSecurityKey } from "./research-holdings";

const revenueRowSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  market: z.enum(["TWSE", "TPEx"]),
  industry: z.string(),
  period: z.string().min(1),
  revenue: z.number().finite(),
  lastYearRevenue: z.number().finite().nullable(),
  momPct: z.number().finite().nullable(),
  yoyPct: z.number().finite().nullable(),
  cumulativeRevenue: z.number().finite().nullable(),
  cumulativeYoyPct: z.number().finite().nullable()
});

const revenueCacheSchema = z.object({
  generatedAt: z.string(),
  sources: z.array(z.object({
    name: z.string(),
    url: z.string(),
    fetchedAt: z.string()
  })),
  rows: z.array(revenueRowSchema)
});

export type RevenueRow = z.infer<typeof revenueRowSchema>;
export type RevenueCache = z.infer<typeof revenueCacheSchema>;

export async function loadBundledRevenue(): Promise<RevenueCache> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const response = await fetch(`${base}/data/tw-revenue.json?ts=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("尚未取得官方月營收資料快取。");
  }

  return revenueCacheSchema.parse(await response.json());
}

export function revenueRowsForView(
  cache: RevenueCache,
  query: string,
  heldKeys: Set<string>,
  limit = 80
) {
  const needle = query.trim().toLowerCase();
  const rows = cache.rows.filter((row) => {
    if (needle) {
      return `${row.code} ${row.name} ${row.industry}`.toLowerCase().includes(needle);
    }
    return heldKeys.has(twSecurityKey(row.market, row.code));
  });

  return [...rows]
    .sort((a, b) => {
      const aHeld = heldKeys.has(twSecurityKey(a.market, a.code)) ? 1 : 0;
      const bHeld = heldKeys.has(twSecurityKey(b.market, b.code)) ? 1 : 0;
      if (aHeld !== bHeld) return bHeld - aHeld;
      return (b.yoyPct ?? -Infinity) - (a.yoyPct ?? -Infinity);
    })
    .slice(0, limit);
}

export function latestRevenuePeriod(cache: RevenueCache) {
  return cache.rows.map((row) => row.period).sort().at(-1) ?? null;
}
