import { z } from "zod";
import type { Holding } from "./types";
import { twSecurityKey } from "./research-holdings";

const materialEventRowSchema = z.object({
  market: z.enum(["TWSE", "TPEx"]),
  code: z.string().min(1),
  name: z.string(),
  publishedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  publishedTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  factDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  rule: z.string(),
  subject: z.string().min(1),
  detail: z.string()
});

const materialEventCacheSchema = z.object({
  generatedAt: z.string(),
  retentionDays: z.number().int().positive(),
  sources: z.array(z.object({
    name: z.string(),
    market: z.enum(["TWSE", "TPEx"]),
    url: z.string(),
    fetchedAt: z.string(),
    rowCount: z.number().int().nonnegative()
  })),
  rows: z.array(materialEventRowSchema)
});

export type MaterialEventRow = z.infer<typeof materialEventRowSchema>;
export type MaterialEventCache = z.infer<typeof materialEventCacheSchema>;

export async function loadBundledMaterialEvents(): Promise<MaterialEventCache> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const response = await fetch(`${base}/data/tw-material-events.json?ts=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("尚未取得官方重大訊息資料快取。");
  }

  return materialEventCacheSchema.parse(await response.json());
}

export function materialEventsForHoldings(
  cache: MaterialEventCache,
  holdings: Holding[],
  limit = 80
) {
  const heldKeys = new Set(
    holdings.flatMap((holding) => {
      if (
        holding.market !== "TW" ||
        holding.type === "cash" ||
        (holding.priceSource !== "TWSE" && holding.priceSource !== "TPEx")
      ) return [];
      return [twSecurityKey(holding.priceSource, holding.symbol)];
    })
  );

  return cache.rows
    .filter((row) => heldKeys.has(twSecurityKey(row.market, row.code)))
    .sort((a, b) =>
      b.publishedDate.localeCompare(a.publishedDate) ||
      b.publishedTime.localeCompare(a.publishedTime) ||
      a.code.localeCompare(b.code, "en")
    )
    .slice(0, limit);
}

export function materialEventSource(cache: MaterialEventCache, market: MaterialEventRow["market"]) {
  return cache.sources.find((source) => source.market === market) ?? null;
}

export function latestMaterialEventDate(cache: MaterialEventCache) {
  return cache.rows.map((row) => row.publishedDate).sort().at(-1) ?? null;
}
