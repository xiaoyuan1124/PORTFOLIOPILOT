import type { Holding } from "./types";
import type { TwQuoteCache } from "./market-data";
import type { RevenueCache } from "./revenue-data";
import { latestRevenuePeriod } from "./revenue-data";
import { resolveHeldTwSecurityKeys, twSecurityKey } from "./research-holdings";

export type MarketSectorPulse = {
  industry: string;
  companyCount: number;
  sampleCount: number;
  medianChangePct: number;
  upSharePct: number;
  downSharePct: number;
  flatSharePct: number;
  twseCount: number;
  tpexCount: number;
  twseDate: string | null;
  tpexDate: string | null;
};

const GENERIC_INDUSTRIES = new Set(["", "未分類", "其他", "其它"]);

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function latestRevenueRows(cache: RevenueCache) {
  const period = latestRevenuePeriod(cache);
  if (!period) return [];
  return cache.rows.filter((row) => row.period === period);
}

export function buildMarketSectorPulse(
  quotes: TwQuoteCache,
  revenue: RevenueCache,
  options: { minCompanies?: number } = {}
): MarketSectorPulse[] {
  const minCompanies = options.minCompanies ?? 5;
  const revenueRows = latestRevenueRows(revenue);
  const industryByKey = new Map(
    revenueRows
      .map((row) => [twSecurityKey(row.market, row.code), row.industry.trim()] as const)
      .filter(([, industry]) => !GENERIC_INDUSTRIES.has(industry))
  );

  const groups = new Map<string, TwQuoteCache["quotes"]>();
  for (const quote of quotes.quotes) {
    if (quote.changePct === null || quote.changePct === undefined || !Number.isFinite(quote.changePct)) continue;
    const industry = industryByKey.get(twSecurityKey(quote.market, quote.code));
    if (!industry) continue;
    groups.set(industry, [...(groups.get(industry) ?? []), quote]);
  }

  return [...groups.entries()]
    .map(([industry, rows]) => {
      if (rows.length < minCompanies) return null;
      const changes = rows.map((row) => row.changePct).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      if (changes.length < minCompanies) return null;
      const medianChangePct = median(changes);
      if (medianChangePct === null) return null;

      return {
        industry,
        companyCount: rows.length,
        sampleCount: changes.length,
        medianChangePct,
        upSharePct: (changes.filter((value) => value > 0).length / changes.length) * 100,
        downSharePct: (changes.filter((value) => value < 0).length / changes.length) * 100,
        flatSharePct: (changes.filter((value) => value === 0).length / changes.length) * 100,
        twseCount: rows.filter((row) => row.market === "TWSE").length,
        tpexCount: rows.filter((row) => row.market === "TPEx").length,
        twseDate: rows.filter((row) => row.market === "TWSE").map((row) => row.date).sort().at(-1) ?? null,
        tpexDate: rows.filter((row) => row.market === "TPEx").map((row) => row.date).sort().at(-1) ?? null
      } satisfies MarketSectorPulse;
    })
    .filter((row): row is MarketSectorPulse => row !== null)
    .sort((a, b) =>
      b.medianChangePct - a.medianChangePct ||
      b.upSharePct - a.upSharePct ||
      a.industry.localeCompare(b.industry, "zh-Hant")
    );
}

export function heldMarketIndustries(revenue: RevenueCache, holdings: Holding[]) {
  const rows = latestRevenueRows(revenue);
  const heldKeys = resolveHeldTwSecurityKeys(
    holdings,
    rows.map((row) => ({ market: row.market, code: row.code }))
  );

  return new Set(
    rows
      .filter((row) => heldKeys.has(twSecurityKey(row.market, row.code)))
      .map((row) => row.industry.trim())
      .filter((industry) => !GENERIC_INDUSTRIES.has(industry))
  );
}

export function filterMarketSectorPulse(
  rows: MarketSectorPulse[],
  query: string,
  heldIndustries: Set<string>,
  heldOnly: boolean
) {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (heldOnly && !heldIndustries.has(row.industry)) return false;
    if (needle && !row.industry.toLowerCase().includes(needle)) return false;
    return true;
  });
}
