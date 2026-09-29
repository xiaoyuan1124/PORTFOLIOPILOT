import type { RevenueCache, RevenueRow } from "./revenue-data";
import { latestRevenuePeriod } from "./revenue-data";

export type RevenueSectorPulse = {
  industry: string;
  period: string;
  companyCount: number;
  yoyCount: number;
  medianYoyPct: number;
  positiveYoySharePct: number;
  over20YoySharePct: number;
  medianMomPct: number | null;
  twseCount: number;
  tpexCount: number;
};

const GENERIC_INDUSTRIES = new Set(["", "未分類", "其他", "其它"]);

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function normalizedIndustry(row: RevenueRow) {
  return row.industry.trim();
}

export function buildRevenueSectorPulse(
  cache: RevenueCache,
  options: { minYoyCompanies?: number } = {}
): RevenueSectorPulse[] {
  const period = latestRevenuePeriod(cache);
  if (!period) return [];
  const minYoyCompanies = options.minYoyCompanies ?? 5;
  const groups = new Map<string, RevenueRow[]>();

  for (const row of cache.rows) {
    if (row.period !== period) continue;
    const industry = normalizedIndustry(row);
    if (GENERIC_INDUSTRIES.has(industry)) continue;
    const current = groups.get(industry) ?? [];
    current.push(row);
    groups.set(industry, current);
  }

  return [...groups.entries()]
    .map(([industry, rows]) => {
      const yoyValues = rows.flatMap((row) => row.yoyPct === null ? [] : [row.yoyPct]);
      if (yoyValues.length < minYoyCompanies) return null;
      const momValues = rows.flatMap((row) => row.momPct === null ? [] : [row.momPct]);
      const medianYoyPct = median(yoyValues);
      if (medianYoyPct === null) return null;

      return {
        industry,
        period,
        companyCount: rows.length,
        yoyCount: yoyValues.length,
        medianYoyPct,
        positiveYoySharePct: (yoyValues.filter((value) => value > 0).length / yoyValues.length) * 100,
        over20YoySharePct: (yoyValues.filter((value) => value > 20).length / yoyValues.length) * 100,
        medianMomPct: median(momValues),
        twseCount: rows.filter((row) => row.market === "TWSE").length,
        tpexCount: rows.filter((row) => row.market === "TPEx").length
      } satisfies RevenueSectorPulse;
    })
    .filter((row): row is RevenueSectorPulse => row !== null)
    .sort((a, b) => b.medianYoyPct - a.medianYoyPct || b.positiveYoySharePct - a.positiveYoySharePct || a.industry.localeCompare(b.industry, "zh-Hant"));
}

export function heldRevenueIndustries(cache: RevenueCache, heldCodes: Set<string>) {
  const period = latestRevenuePeriod(cache);
  if (!period || !heldCodes.size) return new Set<string>();
  return new Set(
    cache.rows
      .filter((row) => row.period === period && heldCodes.has(row.code.toUpperCase()))
      .map((row) => normalizedIndustry(row))
      .filter((industry) => !GENERIC_INDUSTRIES.has(industry))
  );
}

export function filterRevenueSectorPulse(
  rows: RevenueSectorPulse[],
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
