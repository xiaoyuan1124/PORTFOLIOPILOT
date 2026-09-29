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
  const quoteMap = new Map<string, TwQuoteCache["quotes"]>();
  for (const quote of cache.quotes) {
    const code = quote.code.toUpperCase();
    quoteMap.set(code, [...(quoteMap.get(code) ?? []), quote]);
  }

  let updated = 0;
  let skippedStale = 0;
  let skippedAmbiguous = 0;

  const next = holdings.map((holding) => {
    if (holding.market !== "TW" || holding.type === "cash") return holding;

    const candidates = quoteMap.get(holding.symbol.toUpperCase()) ?? [];
    if (!candidates.length) return holding;

    const preferredVenue =
      holding.priceSource === "TWSE" || holding.priceSource === "TPEx"
        ? holding.priceSource
        : null;
    const quote = preferredVenue
      ? candidates.find((candidate) => candidate.market === preferredVenue)
      : candidates.length === 1
        ? candidates[0]
        : undefined;

    if (!quote) {
      skippedAmbiguous += 1;
      return holding;
    }
    if (quote.close <= 0) return holding;
    if (holding.priceAsOf && quote.date < holding.priceAsOf) {
      skippedStale += 1;
      return holding;
    }

    updated += 1;
    return {
      ...holding,
      name: holding.name || quote.name,
      price: quote.close,
      priceSource: quote.market,
      priceAsOf: quote.date
    };
  });

  return { holdings: next, updated, skippedStale, skippedAmbiguous };
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
  const generatedTaipei = taipeiParts(new Date(cache.generatedAt));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(taipei.weekday);

  // A cache fetched today is allowed even when the latest official trading
  // date is older (for example a weekday market holiday). Only reject a cache
  // that itself has not been refreshed today after the publishing window.
  return weekday &&
    taipei.hour >= 17 &&
    generatedTaipei.date < taipei.date &&
    latest < taipei.date;
}
