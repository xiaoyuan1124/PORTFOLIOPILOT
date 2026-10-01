import type { EtfComposition } from "./types";
import type { ValuationCache } from "./valuation-data";
import type { RevenueHistoryCache } from "./revenue-history";
import type { QuarterlyMarginCache } from "./quarterly-financials";

export type WeightedEtfMetric = {
  value: number | null;
  coveredWeightPct: number;
  constituentCount: number;
  asOf: string | null;
};

export type EtfFundamentalAnalysis = {
  weightedPe: WeightedEtfMetric;
  weightedPb: WeightedEtfMetric;
  weightedEarningsYieldPct: WeightedEtfMetric;
  weightedRevenueYoyPct: WeightedEtfMetric;
  weightedGrossMarginPct: WeightedEtfMetric;
  grossMarginImprovingWeightPct: number | null;
  grossMarginTrendCoveragePct: number;
  grossMarginTrendConstituentCount: number;
};

export type EtfOverlapResult = {
  otherKey: string;
  otherSymbol: string;
  otherName: string;
  commonConstituentCount: number;
  overlapWeightPct: number;
  primaryCoveragePct: number;
  otherCoveragePct: number;
  common: Array<{
    market: "TW" | "US";
    symbol: string;
    name: string;
    primaryWeightPct: number;
    otherWeightPct: number;
    overlapWeightPct: number;
  }>;
};

function code(value: string) {
  return value.trim().toUpperCase();
}

function compositionCoverage(composition: EtfComposition) {
  return composition.constituents.reduce((sum, item) => sum + item.weightPct, 0);
}

function uniqueVenueRows<T extends { code: string; market: "TWSE" | "TPEx" }>(rows: T[], symbol: string) {
  const matches = rows.filter((row) => code(row.code) === code(symbol));
  if (!matches.length) return [];
  const venues = new Set(matches.map((row) => row.market));
  return venues.size === 1 ? matches : [];
}

function metric(items: Array<{ weightPct: number; value: number; asOf: string }>): WeightedEtfMetric {
  const coveredWeightPct = items.reduce((sum, item) => sum + item.weightPct, 0);
  if (coveredWeightPct <= 0) {
    return { value: null, coveredWeightPct: 0, constituentCount: 0, asOf: null };
  }
  return {
    value: items.reduce((sum, item) => sum + item.weightPct * item.value, 0) / coveredWeightPct,
    coveredWeightPct,
    constituentCount: items.length,
    asOf: items.map((item) => item.asOf).sort().at(-1) ?? null
  };
}

export function analyzeEtfFundamentals(
  composition: EtfComposition,
  valuations: ValuationCache,
  revenueHistory: RevenueHistoryCache,
  quarterlyMargins: QuarterlyMarginCache
): EtfFundamentalAnalysis {
  const peItems: Array<{ weightPct: number; value: number; asOf: string }> = [];
  const pbItems: Array<{ weightPct: number; value: number; asOf: string }> = [];
  const earningsYieldItems: Array<{ weightPct: number; value: number; asOf: string }> = [];
  const revenueItems: Array<{ weightPct: number; value: number; asOf: string }> = [];
  const grossMarginItems: Array<{ weightPct: number; value: number; asOf: string }> = [];
  let grossMarginTrendCoveragePct = 0;
  let grossMarginImprovingWeightPct = 0;
  let grossMarginTrendConstituentCount = 0;

  for (const constituent of composition.constituents) {
    if (constituent.market !== "TW") continue;

    const valuationRows = uniqueVenueRows(valuations.rows, constituent.symbol)
      .sort((a, b) => a.date.localeCompare(b.date));
    const valuation = valuationRows.at(-1);
    if (valuation?.pe !== null && valuation?.pe !== undefined && valuation.pe > 0) {
      peItems.push({ weightPct: constituent.weightPct, value: valuation.pe, asOf: valuation.date });
      earningsYieldItems.push({
        weightPct: constituent.weightPct,
        value: 100 / valuation.pe,
        asOf: valuation.date
      });
    }
    if (valuation?.pb !== null && valuation?.pb !== undefined && valuation.pb > 0) {
      pbItems.push({ weightPct: constituent.weightPct, value: valuation.pb, asOf: valuation.date });
    }

    const revenueRows = uniqueVenueRows(revenueHistory.rows, constituent.symbol)
      .filter((row) => row.yoyPct !== null)
      .sort((a, b) => a.period.localeCompare(b.period));
    const latestRevenue = revenueRows.at(-1);
    if (latestRevenue?.yoyPct !== null && latestRevenue?.yoyPct !== undefined) {
      revenueItems.push({
        weightPct: constituent.weightPct,
        value: latestRevenue.yoyPct,
        asOf: latestRevenue.period
      });
    }

    const marginRows = uniqueVenueRows(quarterlyMargins.rows, constituent.symbol)
      .sort((a, b) => a.period.localeCompare(b.period));
    const latestMargin = marginRows.at(-1);
    if (latestMargin) {
      grossMarginItems.push({
        weightPct: constituent.weightPct,
        value: latestMargin.grossMarginPct,
        asOf: latestMargin.period
      });
    }
    const previousMargin = marginRows.at(-2);
    if (latestMargin && previousMargin) {
      grossMarginTrendCoveragePct += constituent.weightPct;
      grossMarginTrendConstituentCount += 1;
      if (latestMargin.grossMarginPct > previousMargin.grossMarginPct) {
        grossMarginImprovingWeightPct += constituent.weightPct;
      }
    }
  }

  return {
    weightedPe: metric(peItems),
    weightedPb: metric(pbItems),
    weightedEarningsYieldPct: metric(earningsYieldItems),
    weightedRevenueYoyPct: metric(revenueItems),
    weightedGrossMarginPct: metric(grossMarginItems),
    grossMarginImprovingWeightPct:
      grossMarginTrendCoveragePct > 0
        ? grossMarginImprovingWeightPct
        : null,
    grossMarginTrendCoveragePct,
    grossMarginTrendConstituentCount
  };
}

export function compareEtfOverlaps(
  primary: EtfComposition,
  allCompositions: EtfComposition[]
): EtfOverlapResult[] {
  const primaryKey = `${primary.etfMarket}:${code(primary.etfSymbol)}`;
  const primaryMap = new Map(
    primary.constituents.map((item) => [
      `${item.market}:${code(item.symbol)}`,
      item
    ])
  );

  return allCompositions
    .filter((other) => `${other.etfMarket}:${code(other.etfSymbol)}` !== primaryKey)
    .map((other) => {
      const common = other.constituents.flatMap((item) => {
        const match = primaryMap.get(`${item.market}:${code(item.symbol)}`);
        if (!match) return [];
        return [{
          market: item.market,
          symbol: code(item.symbol),
          name: match.name || item.name,
          primaryWeightPct: match.weightPct,
          otherWeightPct: item.weightPct,
          overlapWeightPct: Math.min(match.weightPct, item.weightPct)
        }];
      }).sort((a, b) => b.overlapWeightPct - a.overlapWeightPct);

      return {
        otherKey: `${other.etfMarket}:${code(other.etfSymbol)}`,
        otherSymbol: code(other.etfSymbol),
        otherName: other.etfName,
        commonConstituentCount: common.length,
        overlapWeightPct: common.reduce((sum, item) => sum + item.overlapWeightPct, 0),
        primaryCoveragePct: compositionCoverage(primary),
        otherCoveragePct: compositionCoverage(other),
        common
      };
    })
    .sort((a, b) => b.overlapWeightPct - a.overlapWeightPct);
}
