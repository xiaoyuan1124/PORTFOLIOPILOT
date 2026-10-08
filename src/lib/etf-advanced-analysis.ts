import type { TwQuoteCache } from "./market-data";
import type { QuarterlyMarginCache } from "./quarterly-financials";
import type { RevenueHistoryCache } from "./revenue-history";
import type { EtfComposition, EtfConstituent } from "./types";
import type { ValuationCache } from "./valuation-data";

export type EtfProductBand = "low" | "medium" | "high" | "very_high";
export type EtfAttributionExclusionReason =
  | "unsupported_market"
  | "quote_cache_unavailable"
  | "missing_quote"
  | "ambiguous_quote"
  | "invalid_quote"
  | "different_trading_date";

export type WeightedMetric = {
  value: number | null;
  coveredWeightPct: number;
  asOf: string | null;
};

export type EtfAttributionExclusion = {
  symbol: string;
  name: string;
  market: EtfConstituent["market"];
  weightPct: number;
  reason: EtfAttributionExclusionReason;
  quoteDate: string | null;
};

export type EtfAttributionRow = {
  symbol: string;
  name: string;
  market: EtfConstituent["market"];
  weightPct: number;
  changePct: number;
  contributionPctPoints: number;
  quoteDate: string;
};

export type EtfOverlapComparison = {
  etfMarket: EtfComposition["etfMarket"];
  etfSymbol: string;
  etfName: string;
  asOf: string;
  overlapWeightPct: number;
  sharedCount: number;
  topShared: Array<{
    market: EtfConstituent["market"];
    symbol: string;
    name: string;
    selectedWeightPct: number;
    otherWeightPct: number;
    overlapWeightPct: number;
  }>;
};

export type EtfWeightChangeType = "added" | "removed" | "increased" | "decreased" | "unchanged";

export type EtfWeightChangeRow = {
  market: EtfConstituent["market"];
  symbol: string;
  name: string;
  previousWeightPct: number;
  currentWeightPct: number;
  changePctPoints: number;
  changeType: EtfWeightChangeType;
};

export type EtfCompositionChangeSummary = {
  added: number;
  removed: number;
  increased: number;
  decreased: number;
  unchanged: number;
};

export type EtfAdvancedAnalysis = {
  compositionCoveragePct: number;
  constituentCount: number;
  top1WeightPct: number;
  top5WeightPct: number;
  top10WeightPct: number;
  hhi: number;
  effectiveHoldingCount: number;
  topHolding: EtfConstituent | null;
  sectorWeights: Array<{ sector: string; weightPct: number }>;
  previousCompositionAsOf: string | null;
  weightChanges: EtfWeightChangeRow[];
  compositionChangeSummary: EtfCompositionChangeSummary;
  revenueYoY: WeightedMetric;
  grossMargin: WeightedMetric;
  grossMarginTrendCoveredWeightPct: number;
  grossMarginImprovingWeightPct: number;
  grossMarginImprovingSharePct: number | null;
  weightedPe: WeightedMetric;
  weightedPb: WeightedMetric;
  earningsYieldPct: WeightedMetric;
  dividendYieldPct: WeightedMetric;
  overlapComparisons: EtfOverlapComparison[];
  attributionDate: string | null;
  attributionCoveredWeightPct: number;
  attributionUnresolvedImportedWeightPct: number;
  attributionUnimportedWeightPct: number;
  estimatedCoveredReturnPct: number;
  officialEtfDailyReturnPct: number | null;
  officialEtfQuoteDate: string | null;
  attributionResidualPctPoints: number | null;
  attributionRows: EtfAttributionRow[];
  attributionExclusions: EtfAttributionExclusion[];
  momentumAvailable: false;
  momentumUnavailableReason: string;
};

type AdvancedData = {
  quotes?: TwQuoteCache | null;
  valuations?: ValuationCache | null;
  revenueHistory?: RevenueHistoryCache | null;
  quarterlyMargins?: QuarterlyMarginCache | null;
};

function symbol(value: string) {
  return value.trim().toUpperCase();
}

function key(item: Pick<EtfConstituent, "market" | "symbol">) {
  return item.market + ":" + symbol(item.symbol);
}

function aggregate(composition: EtfComposition) {
  const map = new Map<string, EtfConstituent>();
  for (const raw of composition.constituents) {
    const item: EtfConstituent = {
      ...raw,
      symbol: symbol(raw.symbol),
      name: raw.name.trim(),
      sector: raw.sector.trim(),
      weightPct: Number.isFinite(raw.weightPct) ? raw.weightPct : 0
    };
    const current = map.get(key(item));
    if (current) {
      current.weightPct += item.weightPct;
      if (!current.name) current.name = item.name;
      if (!current.sector) current.sector = item.sector;
    } else {
      map.set(key(item), item);
    }
  }
  return [...map.values()].sort((a, b) => b.weightPct - a.weightPct);
}

function latest(values: string[]) {
  return [...values].sort().at(-1) ?? null;
}

function uniqueByCode<T extends { code: string }>(rows: T[], code: string) {
  const matches = rows.filter((row) => symbol(row.code) === symbol(code));
  return matches.length === 1 ? matches[0] ?? null : null;
}

function weighted(rows: Array<{ weightPct: number; value: number }>, asOf: string | null): WeightedMetric {
  const coveredWeightPct = rows.reduce((sum, row) => sum + row.weightPct, 0);
  if (coveredWeightPct <= 0) return { value: null, coveredWeightPct: 0, asOf };
  return {
    value: rows.reduce((sum, row) => sum + row.weightPct * row.value, 0) / coveredWeightPct,
    coveredWeightPct,
    asOf
  };
}

function quoteMatch(cache: TwQuoteCache | null | undefined, code: string) {
  if (!cache) return { status: "quote_cache_unavailable" as const, quote: null };
  const matches = cache.quotes.filter((row) => symbol(row.code) === symbol(code));
  if (!matches.length) return { status: "missing_quote" as const, quote: null };
  if (matches.length > 1) return { status: "ambiguous_quote" as const, quote: null };
  const quote = matches[0]!;
  if (
    quote.close <= 0 ||
    quote.changePct === null ||
    quote.changePct === undefined ||
    !Number.isFinite(quote.changePct)
  ) return { status: "invalid_quote" as const, quote: null };
  return { status: "ok" as const, quote };
}

function classifyWeightChange(previousWeightPct: number, currentWeightPct: number): EtfWeightChangeType {
  const epsilon = 1e-9;
  if (previousWeightPct <= epsilon && currentWeightPct > epsilon) return "added";
  if (previousWeightPct > epsilon && currentWeightPct <= epsilon) return "removed";
  const delta = currentWeightPct - previousWeightPct;
  if (delta > epsilon) return "increased";
  if (delta < -epsilon) return "decreased";
  return "unchanged";
}

// Shared by deep-analysis and the local composition change timeline. Treat
// missing constituents as missing entries (0% in a pair), not a price forecast.
export function compareEtfCompositionSnapshots(previous: EtfComposition, selected: EtfComposition) {
  if (
    previous.etfMarket !== selected.etfMarket ||
    symbol(previous.etfSymbol) !== symbol(selected.etfSymbol) ||
    previous.asOf >= selected.asOf
  ) {
    throw new Error("ETF 成份比較必須是同一檔 ETF 的不同且遞增資料日。");
  }
  const currentMap = new Map(aggregate(selected).map((item) => [key(item), item]));
  const previousMap = new Map(aggregate(previous).map((item) => [key(item), item]));
  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);
  const rows = [...keys].map((itemKey) => {
    const current = currentMap.get(itemKey);
    const prior = previousMap.get(itemKey);
    const representative = current ?? prior!;
    const currentWeightPct = current?.weightPct ?? 0;
    const previousWeightPct = prior?.weightPct ?? 0;
    return {
      market: representative.market,
      symbol: representative.symbol,
      name: representative.name,
      previousWeightPct,
      currentWeightPct,
      changePctPoints: currentWeightPct - previousWeightPct,
      changeType: classifyWeightChange(previousWeightPct, currentWeightPct)
    };
  }).sort((a, b) => Math.abs(b.changePctPoints) - Math.abs(a.changePctPoints));

  const emptySummary: EtfCompositionChangeSummary = {
    added: 0,
    removed: 0,
    increased: 0,
    decreased: 0,
    unchanged: 0
  };
  const summary = rows.reduce<EtfCompositionChangeSummary>((result, row) => {
    result[row.changeType] += 1;
    return result;
  }, { ...emptySummary });

  return { previousAsOf: previous.asOf, currentAsOf: selected.asOf, rows, summary };
}

function weightChanges(selected: EtfComposition, all: EtfComposition[]) {
  const previous = all
    .filter((item) =>
      item.etfMarket === selected.etfMarket &&
      symbol(item.etfSymbol) === symbol(selected.etfSymbol) &&
      item.asOf < selected.asOf
    )
    .sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
  if (!previous) {
    return {
      asOf: null as string | null,
      rows: [] as EtfWeightChangeRow[],
      summary: { added: 0, removed: 0, increased: 0, decreased: 0, unchanged: 0 }
    };
  }
  const compared = compareEtfCompositionSnapshots(previous, selected);
  return { asOf: compared.previousAsOf, rows: compared.rows, summary: compared.summary };
}

export function compareEtfOverlap(selected: EtfComposition, other: EtfComposition): EtfOverlapComparison {
  const selectedMap = new Map(aggregate(selected).map((item) => [key(item), item]));
  const otherMap = new Map(aggregate(other).map((item) => [key(item), item]));
  const shared: EtfOverlapComparison["topShared"] = [];

  for (const [itemKey, selectedItem] of selectedMap) {
    const otherItem = otherMap.get(itemKey);
    if (!otherItem) continue;
    shared.push({
      market: selectedItem.market,
      symbol: selectedItem.symbol,
      name: selectedItem.name || otherItem.name,
      selectedWeightPct: selectedItem.weightPct,
      otherWeightPct: otherItem.weightPct,
      overlapWeightPct: Math.min(selectedItem.weightPct, otherItem.weightPct)
    });
  }
  shared.sort((a, b) => b.overlapWeightPct - a.overlapWeightPct);

  return {
    etfMarket: other.etfMarket,
    etfSymbol: symbol(other.etfSymbol),
    etfName: other.etfName,
    asOf: other.asOf,
    overlapWeightPct: shared.reduce((sum, row) => sum + row.overlapWeightPct, 0),
    sharedCount: shared.length,
    topShared: shared.slice(0, 8)
  };
}

export function analyzeEtfAdvanced(
  selected: EtfComposition,
  allCompositions: EtfComposition[],
  data: AdvancedData = {}
): EtfAdvancedAnalysis {
  const constituents = aggregate(selected);
  const compositionCoveragePct = constituents.reduce((sum, item) => sum + item.weightPct, 0);
  const sumTop = (count: number) => constituents.slice(0, count).reduce((sum, item) => sum + item.weightPct, 0);
  const hhi = constituents.reduce((sum, item) => sum + item.weightPct ** 2, 0);
  const sectors = new Map<string, number>();
  for (const item of constituents) {
    const sector = item.sector || "未分類";
    sectors.set(sector, (sectors.get(sector) ?? 0) + item.weightPct);
  }
  const sectorWeights = [...sectors.entries()]
    .map(([sector, weightPct]) => ({ sector, weightPct }))
    .sort((a, b) => b.weightPct - a.weightPct);

  const historical = weightChanges(selected, allCompositions);

  const revenuePeriod = data.revenueHistory ? latest(data.revenueHistory.periods) : null;
  const revenueRows = revenuePeriod && data.revenueHistory
    ? data.revenueHistory.rows.filter((row) => row.period === revenuePeriod)
    : [];
  const revenueWeighted: Array<{ weightPct: number; value: number }> = [];
  for (const item of constituents) {
    if (item.market !== "TW") continue;
    const row = uniqueByCode(revenueRows, item.symbol);
    if (row?.yoyPct === null || row?.yoyPct === undefined || !Number.isFinite(row.yoyPct)) continue;
    revenueWeighted.push({ weightPct: item.weightPct, value: row.yoyPct });
  }

  const marginPeriod = data.quarterlyMargins ? latest(data.quarterlyMargins.periods) : null;
  const previousMarginPeriod = data.quarterlyMargins && marginPeriod
    ? [...data.quarterlyMargins.periods].sort().filter((period) => period < marginPeriod).at(-1) ?? null
    : null;
  const marginRows = marginPeriod && data.quarterlyMargins
    ? data.quarterlyMargins.rows.filter((row) => row.period === marginPeriod)
    : [];
  const previousMarginRows = previousMarginPeriod && data.quarterlyMargins
    ? data.quarterlyMargins.rows.filter((row) => row.period === previousMarginPeriod)
    : [];
  const marginWeighted: Array<{ weightPct: number; value: number }> = [];
  let grossMarginTrendCoveredWeightPct = 0;
  let grossMarginImprovingWeightPct = 0;
  for (const item of constituents) {
    if (item.market !== "TW") continue;
    const current = uniqueByCode(marginRows, item.symbol);
    if (current && Number.isFinite(current.grossMarginPct)) {
      marginWeighted.push({ weightPct: item.weightPct, value: current.grossMarginPct });
    }
    const previous = previousMarginPeriod ? uniqueByCode(previousMarginRows, item.symbol) : null;
    if (!current || !previous) continue;
    grossMarginTrendCoveredWeightPct += item.weightPct;
    if (current.grossMarginPct > previous.grossMarginPct) grossMarginImprovingWeightPct += item.weightPct;
  }

  const valuationDate = data.valuations ? latest(data.valuations.rows.map((row) => row.date)) : null;
  const valuationRows = valuationDate && data.valuations
    ? data.valuations.rows.filter((row) => row.date === valuationDate)
    : [];
  const peRows: Array<{ weightPct: number; value: number }> = [];
  const pbRows: Array<{ weightPct: number; value: number }> = [];
  const eyRows: Array<{ weightPct: number; value: number }> = [];
  const dyRows: Array<{ weightPct: number; value: number }> = [];
  for (const item of constituents) {
    if (item.market !== "TW") continue;
    const row = uniqueByCode(valuationRows, item.symbol);
    if (!row) continue;
    if (row.pe !== null && row.pe > 0 && Number.isFinite(row.pe)) {
      peRows.push({ weightPct: item.weightPct, value: row.pe });
      eyRows.push({ weightPct: item.weightPct, value: 100 / row.pe });
    }
    if (row.pb !== null && row.pb >= 0 && Number.isFinite(row.pb)) {
      pbRows.push({ weightPct: item.weightPct, value: row.pb });
    }
    if (row.dividendYield !== null && row.dividendYield >= 0 && Number.isFinite(row.dividendYield)) {
      dyRows.push({ weightPct: item.weightPct, value: row.dividendYield });
    }
  }

  const overlapMap = new Map<string, EtfOverlapComparison>();
  for (const other of allCompositions) {
    if (other.etfMarket === selected.etfMarket && symbol(other.etfSymbol) === symbol(selected.etfSymbol)) continue;
    const comparison = compareEtfOverlap(selected, other);
    const otherKey = comparison.etfMarket + ":" + comparison.etfSymbol;
    const current = overlapMap.get(otherKey);
    if (!current || comparison.asOf > current.asOf) overlapMap.set(otherKey, comparison);
  }
  const overlapComparisons = [...overlapMap.values()].sort((a, b) => b.overlapWeightPct - a.overlapWeightPct);

  const quoteStates = constituents.map((item) => ({
    item,
    match: item.market === "TW"
      ? quoteMatch(data.quotes, item.symbol)
      : { status: "unsupported_market" as const, quote: null }
  }));
  const attributionDate = latest(quoteStates.flatMap(({ match }) =>
    match.status === "ok" && match.quote ? [match.quote.date] : []
  ));
  let attributionCoveredWeightPct = 0;
  let estimatedCoveredReturnPct = 0;
  const attributionRows: EtfAttributionRow[] = [];
  const attributionExclusions: EtfAttributionExclusion[] = [];

  for (const { item, match } of quoteStates) {
    if (match.status === "ok" && match.quote && attributionDate && match.quote.date === attributionDate) {
      const changePct = match.quote.changePct ?? 0;
      const contributionPctPoints = item.weightPct * changePct / 100;
      attributionCoveredWeightPct += item.weightPct;
      estimatedCoveredReturnPct += contributionPctPoints;
      attributionRows.push({
        symbol: item.symbol,
        name: item.name,
        market: item.market,
        weightPct: item.weightPct,
        changePct,
        contributionPctPoints,
        quoteDate: match.quote.date
      });
      continue;
    }
    const reason: EtfAttributionExclusionReason =
      match.status === "ok" ? "different_trading_date" : match.status;
    attributionExclusions.push({
      symbol: item.symbol,
      name: item.name,
      market: item.market,
      weightPct: item.weightPct,
      reason,
      quoteDate: match.status === "ok" && match.quote ? match.quote.date : null
    });
  }
  attributionRows.sort((a, b) =>
    b.contributionPctPoints - a.contributionPctPoints ||
    b.weightPct - a.weightPct ||
    a.symbol.localeCompare(b.symbol)
  );
  attributionExclusions.sort((a, b) => b.weightPct - a.weightPct);

  const etfMatch = selected.etfMarket === "TW"
    ? quoteMatch(data.quotes, selected.etfSymbol)
    : { status: "unsupported_market" as const, quote: null };
  const officialEtfQuoteDate = etfMatch.status === "ok" && etfMatch.quote ? etfMatch.quote.date : null;
  const officialEtfDailyReturnPct =
    etfMatch.status === "ok" &&
    etfMatch.quote &&
    attributionDate &&
    etfMatch.quote.date === attributionDate
      ? etfMatch.quote.changePct ?? null
      : null;

  return {
    compositionCoveragePct,
    constituentCount: constituents.length,
    top1WeightPct: sumTop(1),
    top5WeightPct: sumTop(5),
    top10WeightPct: sumTop(10),
    hhi,
    effectiveHoldingCount: hhi > 0 ? 10000 / hhi : 0,
    topHolding: constituents[0] ?? null,
    sectorWeights,
    previousCompositionAsOf: historical.asOf,
    weightChanges: historical.rows,
    compositionChangeSummary: historical.summary,
    revenueYoY: weighted(revenueWeighted, revenuePeriod),
    grossMargin: weighted(marginWeighted, marginPeriod),
    grossMarginTrendCoveredWeightPct,
    grossMarginImprovingWeightPct,
    grossMarginImprovingSharePct:
      grossMarginTrendCoveredWeightPct > 0
        ? grossMarginImprovingWeightPct / grossMarginTrendCoveredWeightPct * 100
        : null,
    weightedPe: weighted(peRows, valuationDate),
    weightedPb: weighted(pbRows, valuationDate),
    earningsYieldPct: weighted(eyRows, valuationDate),
    dividendYieldPct: weighted(dyRows, valuationDate),
    overlapComparisons,
    attributionDate,
    attributionCoveredWeightPct,
    attributionUnresolvedImportedWeightPct: Math.max(compositionCoveragePct - attributionCoveredWeightPct, 0),
    attributionUnimportedWeightPct: Math.max(100 - compositionCoveragePct, 0),
    estimatedCoveredReturnPct,
    officialEtfDailyReturnPct,
    officialEtfQuoteDate,
    attributionResidualPctPoints:
      officialEtfDailyReturnPct === null ? null : officialEtfDailyReturnPct - estimatedCoveredReturnPct,
    attributionRows,
    attributionExclusions,
    momentumAvailable: false,
    momentumUnavailableReason:
      "目前 bundled 官方資料只有最新收盤快取，尚無 ETF 1M / 3M / 6M / 1Y 可重建歷史價格序列；因此不以單日漲跌冒充動能、相對強弱或最大回撤。"
  };
}

export function singleHoldingProductBand(weightPct: number): EtfProductBand {
  if (weightPct < 10) return "low";
  if (weightPct < 20) return "medium";
  if (weightPct <= 30) return "high";
  return "very_high";
}

export function top10ProductBand(weightPct: number): Exclude<EtfProductBand, "very_high"> {
  if (weightPct < 40) return "low";
  if (weightPct <= 60) return "medium";
  return "high";
}

export function sectorProductBand(weightPct: number): Exclude<EtfProductBand, "very_high"> {
  if (weightPct < 30) return "low";
  if (weightPct <= 50) return "medium";
  return "high";
}

export function overlapProductBand(weightPct: number): Exclude<EtfProductBand, "very_high"> {
  if (weightPct < 40) return "low";
  if (weightPct <= 70) return "medium";
  return "high";
}
