import type { EtfComposition } from "./types";
import { compareEtfCompositionSnapshots } from "./etf-advanced-analysis";

export type EtfCompositionTimelineEntry = ReturnType<typeof compareEtfCompositionSnapshots> & {
  latest: EtfComposition;
  previous: EtfComposition;
  changedCount: number;
};

function sameFund(a: EtfComposition, b: EtfComposition) {
  return a.etfMarket === b.etfMarket &&
    a.etfSymbol.trim().toUpperCase() === b.etfSymbol.trim().toUpperCase();
}

function official(composition: EtfComposition) {
  return composition.sourceType === "official_issuer" || composition.sourceType === "official_exchange";
}

// The tracker is intentionally official-only: comparing a manual CSV against
// an issuer snapshot can produce false "added/removed" signals for partial CSVs.
// Duplicate same-day snapshots are resolved in favor of the current validated
// composition, then the latest cached official snapshot.
export function buildEtfCompositionTimeline(
  selected: EtfComposition,
  snapshots: EtfComposition[]
): EtfCompositionTimelineEntry[] {
  const sameFundSnapshots = [selected, ...snapshots]
    .filter((item) => sameFund(item, selected) && official(item))
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.asOf) && item.constituents.length > 0);

  const byDate = new Map<string, EtfComposition>();
  // Selected is first; historical cache entries with the same date cannot
  // accidentally replace a user's current official snapshot.
  for (const item of sameFundSnapshots) {
    if (!byDate.has(item.asOf)) byDate.set(item.asOf, item);
  }

  const sorted = [...byDate.values()].sort((a, b) => b.asOf.localeCompare(a.asOf));
  const result: EtfCompositionTimelineEntry[] = [];
  for (let index = 0; index + 1 < sorted.length; index += 1) {
    const latest = sorted[index]!;
    const previous = sorted[index + 1]!;
    const compared = compareEtfCompositionSnapshots(previous, latest);
    result.push({
      ...compared,
      latest,
      previous,
      changedCount: compared.summary.added + compared.summary.removed +
        compared.summary.increased + compared.summary.decreased
    });
  }
  return result;
}

export function etfTimelineFingerprint(entry: EtfCompositionTimelineEntry): string {
  // A same-day issuer revision also reappears as unread if constituent data
  // actually changes; source names or card ordering do not alter this token.
  const changes = entry.rows
    .filter((row) => row.changeType !== "unchanged")
    .map((row) => [
      row.market,
      row.symbol,
      row.previousWeightPct,
      row.currentWeightPct,
      row.changeType
    ]);
  return JSON.stringify([entry.previousAsOf, entry.currentAsOf, changes]);
}
