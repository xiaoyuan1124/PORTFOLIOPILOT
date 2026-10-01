export const ETF_COMPOSITION_HISTORY_LIMIT_PER_FUND = 120;

function normalizedSymbol(value) {
  return String(value ?? "").trim().toUpperCase();
}

function fundKey(composition) {
  return `${composition?.etfMarket ?? ""}:${normalizedSymbol(composition?.etfSymbol)}`;
}

function snapshotKey(composition) {
  return `${fundKey(composition)}:${composition?.asOf ?? ""}`;
}

function isUsableSnapshot(composition) {
  return Boolean(
    composition &&
    (composition.etfMarket === "TW" || composition.etfMarket === "US") &&
    normalizedSymbol(composition.etfSymbol) &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(composition.asOf ?? "")) &&
    Array.isArray(composition.constituents) &&
    composition.constituents.length
  );
}

export function mergeEtfCompositionHistory(
  previousHistory = [],
  latestCompositions = [],
  limitPerFund = ETF_COMPOSITION_HISTORY_LIMIT_PER_FUND
) {
  const safeLimit = Number.isInteger(limitPerFund) && limitPerFund > 0
    ? limitPerFund
    : ETF_COMPOSITION_HISTORY_LIMIT_PER_FUND;
  const bySnapshot = new Map();

  for (const composition of [...previousHistory, ...latestCompositions]) {
    if (!isUsableSnapshot(composition)) continue;
    bySnapshot.set(snapshotKey(composition), composition);
  }

  const byFund = new Map();
  for (const composition of bySnapshot.values()) {
    const key = fundKey(composition);
    const rows = byFund.get(key) ?? [];
    rows.push(composition);
    byFund.set(key, rows);
  }

  return [...byFund.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, rows]) =>
      rows
        .sort((a, b) => String(b.asOf).localeCompare(String(a.asOf)))
        .slice(0, safeLimit)
    );
}
