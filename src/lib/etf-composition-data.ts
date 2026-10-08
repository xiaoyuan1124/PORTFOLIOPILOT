import { z } from "zod";
import { etfCompositionSchema } from "./schema";
import type { EtfComposition, Holding } from "./types";
import { isOfflineBundleResponse } from "./bundled-data-status";
import { decodeHtmlEntities } from "./html-entities";

const sourceSchema = z.object({
  symbol: z.string().min(1),
  name: z.string().min(1),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url(),
  fetchedAt: z.string(),
  status: z.enum(["ok", "stale", "error"]),
  error: z.string().optional()
});

const cacheSchema = z.object({
  generatedAt: z.string(),
  sources: z.array(sourceSchema),
  compositions: z.array(etfCompositionSchema),
  history: z.array(etfCompositionSchema).default([])
});

export type EtfCompositionCache = z.infer<typeof cacheSchema> & { offlineFallback?: boolean };

// Use this for old local-first portfolios as well as newly fetched issuer
// caches. It is display/data hygiene only: dates and weights are untouched.
export function normalizeEtfCompositionNames(item: EtfComposition): EtfComposition {
  return {
    ...item,
    etfName: decodeHtmlEntities(item.etfName),
    sourceName: decodeHtmlEntities(item.sourceName),
    constituents: item.constituents.map((constituent) => ({
      ...constituent,
      name: decodeHtmlEntities(constituent.name),
      sector: decodeHtmlEntities(constituent.sector)
    }))
  };
}

export function parseEtfCompositionCache(value: unknown): EtfCompositionCache {
  const parsed = cacheSchema.parse(value);
  // Correct current and historical snapshots even if an older service worker
  // returns a previously encoded official JSON bundle.
  return {
    ...parsed,
    sources: parsed.sources.map((source) => ({
      ...source,
      name: decodeHtmlEntities(source.name),
      sourceName: decodeHtmlEntities(source.sourceName)
    })),
    compositions: parsed.compositions.map(normalizeEtfCompositionNames),
    history: parsed.history.map(normalizeEtfCompositionNames)
  };
}

function key(market: "TW" | "US", symbol: string) {
  return `${market}:${symbol.trim().toUpperCase()}`;
}

function sameComposition(a: EtfComposition, b: EtfComposition) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function loadBundledEtfCompositions(): Promise<EtfCompositionCache> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const response = await fetch(`${base}/data/tw-etf-compositions.json?ts=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("尚未取得官方 ETF 成份資料快取。");
  }

  const parsed = parseEtfCompositionCache(await response.json());
  return isOfflineBundleResponse(response.headers)
    ? { ...parsed, offlineFallback: true }
    : parsed;
}

export function applyHeldEtfCompositions(
  existing: EtfComposition[],
  holdings: Holding[],
  cache: EtfCompositionCache
) {
  const heldKeys = new Set(
    holdings
      .filter((holding) => holding.market === "TW" && holding.type === "etf")
      .map((holding) => key("TW", holding.symbol))
  );

  const supportedKeys = new Set(
    cache.sources.map((source) => key("TW", source.symbol))
  );
  const sourceIssueKeys = new Set(
    cache.sources
      .filter((source) => source.status !== "ok")
      .map((source) => key("TW", source.symbol))
  );

  const incomingByKey = new Map<string, EtfComposition>();
  for (const composition of cache.compositions) {
    const compositionKey = key(composition.etfMarket, composition.etfSymbol);
    if (!heldKeys.has(compositionKey)) continue;
    const current = incomingByKey.get(compositionKey);
    if (!current || composition.asOf > current.asOf) incomingByKey.set(compositionKey, composition);
  }

  const nextByKey = new Map(existing.map((composition) => [
    key(composition.etfMarket, composition.etfSymbol),
    composition
  ]));

  let matched = 0;
  let updated = 0;
  let unchanged = 0;
  let preservedNewer = 0;

  for (const heldKey of heldKeys) {
    const incoming = incomingByKey.get(heldKey);
    if (!incoming) continue;
    matched += 1;

    const current = nextByKey.get(heldKey);
    if (current && current.asOf > incoming.asOf) {
      preservedNewer += 1;
      continue;
    }

    if (current && sameComposition(current, incoming)) {
      unchanged += 1;
      continue;
    }

    nextByKey.set(heldKey, incoming);
    updated += 1;
  }

  // Expose the exact held symbols for actionable, local-only diagnostics.
  // A missing issuer mapping is not the same as a failed official-source fetch.
  const held = [...heldKeys];
  const unsupportedSymbols = held
    .filter((heldKey) => !supportedKeys.has(heldKey))
    .map((heldKey) => heldKey.slice(3))
    .sort();
  const sourceIssueSymbols = held
    .filter((heldKey) => sourceIssueKeys.has(heldKey))
    .map((heldKey) => heldKey.slice(3))
    .sort();

  return {
    compositions: [...nextByKey.values()],
    heldTwEtfCount: heldKeys.size,
    matched,
    updated,
    unchanged,
    preservedNewer,
    supported: held.filter((heldKey) => supportedKeys.has(heldKey)).length,
    sourceIssues: sourceIssueSymbols.length,
    unsupported: unsupportedSymbols.length,
    unsupportedSymbols,
    sourceIssueSymbols
  };
}
