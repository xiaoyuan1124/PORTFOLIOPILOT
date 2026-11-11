import { z } from "zod";
import { fetchPublishedMarketCache } from "./market-data";

const sourceSchema = z.object({
  name: z.enum(["TWSE", "TPEx"]),
  url: z.string().url(),
  fetchedAt: z.string().min(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rowCount: z.number().int().nonnegative()
});

const valuationRowSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  market: z.enum(["TWSE", "TPEx"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pe: z.number().finite().nonnegative().nullable(),
  pb: z.number().finite().nonnegative().nullable(),
  dividendYield: z.number().finite().nonnegative().nullable()
});

const valuationCacheSchema = z.object({
  generatedAt: z.string().min(1),
  sources: z.array(sourceSchema),
  rows: z.array(valuationRowSchema)
});

export type ValuationRow = z.infer<typeof valuationRowSchema>;
export type ValuationCache = z.infer<typeof valuationCacheSchema>;

export async function loadBundledValuations(): Promise<ValuationCache> {
  const { response } = await fetchPublishedMarketCache("tw-valuations.json");
  if (!response.ok) throw new Error("尚未取得官方台股估值快取。");
  return valuationCacheSchema.parse(await response.json());
}

export function valuationSource(cache: ValuationCache, market: ValuationRow["market"]) {
  return cache.sources.find((source) => source.name === market) ?? null;
}
