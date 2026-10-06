import { z } from "zod";
import type { Holding } from "./types";

const quoteSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  market: z.enum(["TWSE", "TPEx"]),
  close: z.number().finite().nonnegative(),
  change: z.number().finite().nullable().optional(),
  changePct: z.number().finite().nullable().optional(),
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

  let matched = 0;
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

    matched += 1;
    const nextName = holding.name || quote.name;
    const changed =
      holding.price !== quote.close ||
      holding.priceSource !== quote.market ||
      holding.priceAsOf !== quote.date ||
      holding.name !== nextName;

    if (!changed) return holding;

    updated += 1;
    return {
      ...holding,
      name: nextName,
      price: quote.close,
      priceSource: quote.market,
      priceAsOf: quote.date
    };
  });

  return { holdings: next, matched, updated, skippedStale, skippedAmbiguous };
}

export function cacheFreshnessLabel(cache: TwQuoteCache) {
  const newest = [...cache.quotes].map((quote) => quote.date).sort().at(-1);
  return newest ?? cache.generatedAt.slice(0, 10);
}

export function cacheMarketFreshness(cache: TwQuoteCache) {
  const latestFor = (market: "TWSE" | "TPEx") =>
    cache.quotes
      .filter((quote) => quote.market === market)
      .map((quote) => quote.date)
      .sort()
      .at(-1) ?? null;

  return {
    TWSE: latestFor("TWSE"),
    TPEx: latestFor("TPEx")
  };
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
    minute: Number(value("minute") || "0"),
    weekday: value("weekday")
  };
}

export function closingPriceStatusLabel(priceDate: string, now = new Date()) {
  const date = String(priceDate ?? "").trim();
  if (!date) return "尚無官方收盤資料";

  const taipei = taipeiParts(now);
  if (date === taipei.date) return `今日收盤 · ${date}`;

  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(taipei.weekday);
  const minuteOfDay = taipei.hour * 60 + taipei.minute;
  if (weekday && minuteOfDay >= 9 * 60 && minuteOfDay <= 13 * 60 + 30) {
    return `盤中時段 · 最近收盤 ${date}`;
  }

  return `最近收盤 · ${date}`;
}

export function shouldRejectStaleClosingCache(cache: TwQuoteCache, now = new Date()) {
  const latest = cacheFreshnessLabel(cache);
  const taipei = taipeiParts(now);
  const generatedTaipei = taipeiParts(new Date(cache.generatedAt));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(taipei.weekday);
  const minuteOfDay = taipei.hour * 60 + taipei.minute;

  // After the normal closing-data publication window, fail closed when the
  // cache itself has not refreshed today. A same-day refresh with an older
  // official trading date is still allowed (for example a weekday holiday).
  return weekday &&
    minuteOfDay >= 15 * 60 + 30 &&
    generatedTaipei.date < taipei.date &&
    latest < taipei.date;
}
