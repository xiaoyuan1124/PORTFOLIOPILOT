import { z } from "zod";
import type { Holding } from "./types";

const quoteSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  market: z.enum(["TWSE", "TPEx"]),
  close: z.number().finite().nonnegative(),
  date: z.string().min(1)
});

const cacheSchema = z.object({
  generatedAt: z.string(),
  sources: z.array(z.object({
    name: z.string(),
    url: z.string(),
    fetchedAt: z.string()
  })),
  quotes: z.array(quoteSchema)
});

export type TwQuoteCache = z.infer<typeof cacheSchema>;

export async function loadBundledTwQuotes(): Promise<TwQuoteCache> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const response = await fetch(`${base}/data/tw-quotes.json?ts=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("尚未取得官方台股資料快取。");
  }

  return cacheSchema.parse(await response.json());
}

export function applyTwQuotes(holdings: Holding[], cache: TwQuoteCache) {
  const quoteMap = new Map(cache.quotes.map((quote) => [quote.code.toUpperCase(), quote]));
  let updated = 0;

  const next = holdings.map((holding) => {
    if (holding.market !== "TW" || holding.type === "cash") return holding;

    const quote = quoteMap.get(holding.symbol.toUpperCase());
    if (!quote || quote.close <= 0) return holding;

    updated += 1;
    return {
      ...holding,
      name: holding.name || quote.name,
      price: quote.close,
      priceSource: quote.market,
      priceAsOf: quote.date
    };
  });

  return { holdings: next, updated };
}

export function cacheFreshnessLabel(cache: TwQuoteCache) {
  const newest = [...cache.quotes].map((quote) => quote.date).sort().at(-1);
  return newest ?? cache.generatedAt.slice(0, 10);
}

function taipeiParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: Number(value("hour")),
    weekday: value("weekday")
  };
}

export function shouldRejectStaleClosingCache(cache: TwQuoteCache, now = new Date()) {
  const latest = cacheFreshnessLabel(cache);
  const taipei = taipeiParts(now);
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(taipei.weekday);

  // Before the Taiwan market's end-of-day publishing window, the previous
  // trading day's close is expected. After 17:00 on a weekday, do not let
  // an older static cache overwrite a user's current values.
  return weekday && taipei.hour >= 17 && latest < taipei.date;
}
