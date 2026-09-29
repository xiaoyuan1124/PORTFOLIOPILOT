import type { TwQuoteCache } from "./market-data";
import type { RevenueCache, RevenueRow } from "./revenue-data";
import { buildHoldingLookupCatalog } from "./holding-autofill";
import type { OfficialStrategyResult } from "./strategy-gates";
import type { ValuationCache, ValuationRow } from "./valuation-data";

type QuoteRow = TwQuoteCache["quotes"][number];

export type CompanySnapshot = {
  code: string;
  name: string;
  market: "TWSE" | "TPEx";
  industry: string;
  type: "stock" | "etf";
  quote: QuoteRow | null;
  valuation: ValuationRow | null;
  revenue: RevenueRow | null;
  strategy: OfficialStrategyResult | null;
};

function key(market: "TWSE" | "TPEx", code: string) {
  return `${market}:${code.toUpperCase()}`;
}

export function buildCompanySnapshots({
  quotes,
  revenue,
  valuations,
  strategies
}: {
  quotes: TwQuoteCache;
  revenue: RevenueCache;
  valuations: ValuationCache;
  strategies: OfficialStrategyResult[];
}): CompanySnapshot[] {
  const quoteMap = new Map(quotes.quotes.map((row) => [key(row.market, row.code), row]));
  const revenueMap = new Map(revenue.rows.map((row) => [key(row.market, row.code), row]));
  const valuationMap = new Map(valuations.rows.map((row) => [key(row.market, row.code), row]));
  const strategyMap = new Map(strategies.map((row) => [key(row.market, row.code), row]));

  return buildHoldingLookupCatalog(quotes, revenue)
    .map((security) => {
      const securityKey = key(security.venue, security.code);
      const revenueRow = revenueMap.get(securityKey) ?? null;
      return {
        code: security.code,
        name: security.name,
        market: security.venue,
        industry: security.industry,
        type: security.type,
        quote: quoteMap.get(securityKey) ?? null,
        valuation: valuationMap.get(securityKey) ?? null,
        revenue: revenueRow,
        strategy: security.type === "stock" ? strategyMap.get(securityKey) ?? null : null
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, "en"));
}

export function companySnapshotsForView(
  snapshots: CompanySnapshot[],
  query: string,
  heldCodes: Set<string>,
  heldOnly = false,
  limit = 80
) {
  const needle = query.trim().toLowerCase();
  return snapshots
    .filter((row) => !heldOnly || heldCodes.has(row.code.toUpperCase()))
    .filter((row) => !needle || `${row.code} ${row.name} ${row.industry} ${row.market}`.toLowerCase().includes(needle))
    .sort((a, b) => {
      const heldDifference = Number(heldCodes.has(b.code.toUpperCase())) - Number(heldCodes.has(a.code.toUpperCase()));
      if (heldDifference !== 0) return heldDifference;
      return a.code.localeCompare(b.code, "en");
    })
    .slice(0, limit);
}
