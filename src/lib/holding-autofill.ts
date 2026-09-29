import type { AssetType } from "./types";
import type { TwQuoteCache } from "./market-data";
import type { RevenueCache } from "./revenue-data";

export interface HoldingLookupCandidate {
  code: string;
  name: string;
  venue: "TWSE" | "TPEx";
  close: number;
  date: string;
  industry: string;
  type: Exclude<AssetType, "cash">;
}

function key(market: "TWSE" | "TPEx", code: string) {
  return `${market}:${code.toUpperCase()}`;
}

function inferType(code: string, hasRevenue: boolean): Exclude<AssetType, "cash"> {
  if (hasRevenue) return "stock";
  return /^00[0-9A-Z]+$/i.test(code) ? "etf" : "stock";
}

export function buildHoldingLookupCatalog(
  quotes: TwQuoteCache,
  revenue: RevenueCache
): HoldingLookupCandidate[] {
  const revenueByKey = new Map(
    revenue.rows.map((row) => [key(row.market, row.code), row] as const)
  );

  return quotes.quotes
    .map((quote) => {
      const revenueRow = revenueByKey.get(key(quote.market, quote.code));
      const type = inferType(quote.code, Boolean(revenueRow));
      return {
        code: quote.code,
        name: quote.name,
        venue: quote.market,
        close: quote.close,
        date: quote.date,
        industry: revenueRow?.industry?.trim() || (type === "etf" ? "ETF" : "未分類"),
        type
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, "en"));
}

function score(candidate: HoldingLookupCandidate, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return -1;

  const code = candidate.code.toLowerCase();
  const name = candidate.name.toLowerCase();

  if (code === needle) return 1000;
  if (name === needle) return 950;
  if (code.startsWith(needle)) return 800;
  if (name.startsWith(needle)) return 700;
  if (code.includes(needle)) return 500;
  if (name.includes(needle)) return 400;
  return -1;
}

export function searchHoldingLookupCatalog(
  catalog: HoldingLookupCandidate[],
  query: string,
  limit = 6
) {
  return catalog
    .map((candidate) => ({ candidate, score: score(candidate, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.candidate.code.localeCompare(b.candidate.code, "en"))
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

export function findExactHoldingLookupCandidate(
  catalog: HoldingLookupCandidate[],
  field: "symbol" | "name",
  value: string
) {
  const needle = value.trim().toLowerCase();
  if (!needle) return null;

  const matches = catalog.filter((candidate) =>
    field === "symbol"
      ? candidate.code.toLowerCase() === needle
      : candidate.name.toLowerCase() === needle
  );

  return matches.length === 1 ? matches[0] : null;
}
