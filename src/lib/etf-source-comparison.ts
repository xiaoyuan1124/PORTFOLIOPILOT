import type { CompanyExposure, LookThroughContribution } from "./etf-lookthrough";

export type EtfCompanySource = LookThroughContribution & {
  sourceKey: string;
  etfValueSharePct: number;
};

function sourceKey(row: LookThroughContribution) {
  return `${row.etfMarket}:${row.etfSymbol.trim().toUpperCase()}`;
}

/**
 * Group the contributions for one underlying company by the ETF that caused
 * the exposure. An ETF may have multiple lots/accounts, so simply counting
 * the raw contribution rows would report false cross-ETF overlap.
 *
 * The value share is relative to the identifiable ETF-implied exposure, not
 * the whole portfolio (unresolved ETF holdings are never treated as zero).
 */
export function compareCompanyEtfSources(exposure: CompanyExposure) {
  const byEtf = new Map<string, EtfCompanySource>();
  for (const contribution of exposure.contributions) {
    const key = sourceKey(contribution);
    const existing = byEtf.get(key);
    if (existing) {
      byEtf.set(key, { ...existing, valueTwd: existing.valueTwd + contribution.valueTwd });
    } else {
      byEtf.set(key, { ...contribution, sourceKey: key, etfValueSharePct: 0 });
    }
  }

  const etfTotalValueTwd = [...byEtf.values()].reduce((sum, row) => sum + row.valueTwd, 0);
  const funds = [...byEtf.values()]
    .map((row) => ({
      ...row,
      etfValueSharePct: etfTotalValueTwd > 0 ? row.valueTwd / etfTotalValueTwd * 100 : 0
    }))
    .sort((a, b) => b.valueTwd - a.valueTwd || a.sourceKey.localeCompare(b.sourceKey));

  return {
    companyKey: `${exposure.market}:${exposure.symbol}`,
    funds,
    distinctEtfCount: funds.length,
    etfTotalValueTwd,
    directValueTwd: exposure.directValueTwd,
    totalIdentifiedValueTwd: exposure.directValueTwd + etfTotalValueTwd
  };
}
