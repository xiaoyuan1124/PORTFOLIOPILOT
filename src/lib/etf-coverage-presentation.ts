import type { EtfCoverage } from "./etf-lookthrough";

/**
 * The exposure engine intentionally processes every account position. Only
 * presentation should group the same ETF across multiple local accounts.
 * Keep monetary subtotals additive; never mutate or delete the source lots.
 */
export function groupEtfCoverageByFund(rows: EtfCoverage[]): EtfCoverage[] {
  const byFund = new Map<string, EtfCoverage>();
  for (const row of rows) {
    const key = `${row.market}:${row.symbol.trim().toUpperCase()}`;
    const previous = byFund.get(key);
    if (!previous) {
      byFund.set(key, { ...row });
      continue;
    }

    const valueTwd = previous.valueTwd + row.valueTwd;
    const coveredValueTwd = previous.coveredValueTwd + row.coveredValueTwd;
    const unresolvedValueTwd = previous.unresolvedValueTwd + row.unresolvedValueTwd;
    const sameSource = previous.asOf === row.asOf &&
      previous.sourceName === row.sourceName &&
      previous.sourceUrl === row.sourceUrl;

    byFund.set(key, {
      ...previous,
      valueTwd,
      coveredValueTwd,
      unresolvedValueTwd,
      // A mixed/invalid dated composition is not silently presented as one
      // verified issuer snapshot. The allocation amounts still add up.
      asOf: sameSource ? previous.asOf : null,
      sourceName: sameSource ? previous.sourceName : null,
      sourceUrl: sameSource ? previous.sourceUrl : null,
      compositionCoveragePct: valueTwd > 0
        ? (previous.compositionCoveragePct * previous.valueTwd +
            row.compositionCoveragePct * row.valueTwd) / valueTwd
        : 0,
      status: !sameSource || previous.status === "insufficient" || row.status === "insufficient"
        ? "insufficient"
        : previous.status === "partial" || row.status === "partial"
          ? "partial"
          : "covered"
    });
  }
  return [...byFund.values()].sort((a, b) =>
    b.valueTwd - a.valueTwd || a.symbol.localeCompare(b.symbol)
  );
}
