import { z } from "zod";

const pointSchema = z.tuple([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.number().finite().positive()
]);

const securitySchema = z.object({
  name: z.string(),
  points: z.array(pointSchema)
});

const bucketSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  market: z.enum(["TWSE", "TPEx"]),
  prefix: z.string().length(2),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  securities: z.record(z.string(), securitySchema)
});

const indexSchema = z.object({
  version: z.literal(1),
  universeVersion: z.number().int().positive().optional(),
  generatedAt: z.string(),
  calendarDays: z.number().int().positive(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  targetEndDate: z.string(),
  markets: z.object({
    TWSE: z.object({ symbols: z.number(), points: z.number(), buckets: z.number() }),
    TPEx: z.object({ symbols: z.number(), points: z.number(), buckets: z.number() })
  }),
  failed: z.array(z.object({
    market: z.enum(["TWSE", "TPEx"]),
    date: z.string(),
    message: z.string()
  }))
});

export type TwPriceHistoryPoint = z.infer<typeof pointSchema>;
export type TwPriceHistorySeries = z.infer<typeof securitySchema> & {
  market: "TWSE" | "TPEx";
  symbol: string;
  generatedAt: string;
  startDate: string | null;
  endDate: string | null;
};
export type TwPriceHistoryIndex = z.infer<typeof indexSchema>;

const bucketPromises = new Map<string, Promise<z.infer<typeof bucketSchema>>>();
const INDEX_PROBE_TTL_MS = 60_000;
let observedHistoryGeneration: string | null = null;
let indexProbe: { checkedAt: number; promise: Promise<TwPriceHistoryIndex> } | null = null;

function prefixForSymbol(symbol: string) {
  const normalized = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (normalized.slice(0, 2) || "__").padEnd(2, "_");
}

function bucketPath(market: "TWSE" | "TPEx", symbol: string) {
  return `${market.toLowerCase()}-${prefixForSymbol(symbol)}.json`;
}

async function loadBucket(market: "TWSE" | "TPEx", symbol: string) {
  const file = bucketPath(market, symbol);
  const existing = bucketPromises.get(file);
  if (existing) return existing;

  const promise = (async () => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const response = await fetch(`${base}/data/tw-price-history/${file}?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("尚未取得此標的的歷史行情快取。");
    return bucketSchema.parse(await response.json());
  })();

  bucketPromises.set(file, promise);
  try {
    return await promise;
  } catch (error) {
    bucketPromises.delete(file);
    throw error;
  }
}

async function fetchTwPriceHistoryIndex(): Promise<TwPriceHistoryIndex> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const response = await fetch(`${base}/data/tw-price-history/index.json?ts=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("尚未建立台股歷史行情快取。");
  return indexSchema.parse(await response.json());
}

function observeHistoryGeneration(index: TwPriceHistoryIndex) {
  if (observedHistoryGeneration && observedHistoryGeneration !== index.generatedAt) {
    bucketPromises.clear();
  }
  observedHistoryGeneration = index.generatedAt;
  return index;
}

export async function loadTwPriceHistoryIndex(): Promise<TwPriceHistoryIndex> {
  return observeHistoryGeneration(await fetchTwPriceHistoryIndex());
}

async function refreshHistoryGeneration() {
  const now = Date.now();
  if (indexProbe && now - indexProbe.checkedAt < INDEX_PROBE_TTL_MS) {
    try {
      await indexProbe.promise;
    } catch {
      // Best effort only: an offline service-worker bucket may still be available.
    }
    return;
  }

  const promise = loadTwPriceHistoryIndex();
  indexProbe = { checkedAt: now, promise };
  try {
    await promise;
  } catch {
    // Keep the rejected probe for the TTL so repeated offline reads do not hammer the network.
  }
}

export async function loadTwPriceHistory(
  market: "TWSE" | "TPEx",
  symbol: string
): Promise<TwPriceHistorySeries> {
  const normalized = symbol.trim().toUpperCase();
  await refreshHistoryGeneration();
  const bucket = await loadBucket(market, normalized);
  const security = bucket.securities[normalized];
  if (!security) throw new Error("歷史行情快取中尚未找到這個標的。");

  return {
    market,
    symbol: normalized,
    name: security.name,
    points: security.points,
    generatedAt: bucket.generatedAt,
    startDate: bucket.startDate,
    endDate: bucket.endDate
  };
}
