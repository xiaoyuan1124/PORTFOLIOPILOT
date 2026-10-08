import type { EtfComposition } from "./types";

function compositionKey(item: EtfComposition) {
  return `${item.etfMarket}:${item.etfSymbol.trim().toUpperCase()}`;
}

function isOfficial(item: EtfComposition) {
  return item.sourceType === "official_issuer" || item.sourceType === "official_exchange";
}

/**
 * Pick a single deterministic composition per ETF. The caller passes data
 * in increasing priority on exact ties (local first, freshly fetched official
 * bundles last). Never roll back a newer locally imported snapshot.
 *
 * This is read-only; no portfolio holdings or local storage are changed.
 */
export function chooseCurrentEtfCompositions(items: EtfComposition[]): EtfComposition[] {
  const result = new Map<string, EtfComposition>();

  for (const item of items) {
    const key = compositionKey(item);
    const previous = result.get(key);
    if (!previous) {
      result.set(key, item);
      continue;
    }
    if (item.asOf < previous.asOf) continue;
    if (item.asOf === previous.asOf && isOfficial(previous) && !isOfficial(item)) continue;
    // Newer as-of wins. For identical dates, official issuer data wins over
    // manual CSV and the last same-provenance entry wins to accept corrections.
    result.set(key, item);
  }

  return [...result.values()];
}
