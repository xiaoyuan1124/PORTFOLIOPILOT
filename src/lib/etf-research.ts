import { holdingValueTwd } from "./calc";
import type { EtfComposition, Holding } from "./types";
import type { TwQuoteCache } from "./market-data";

export type EtfDailyAttributionRow = {
  symbol: string;
  name: string;
  sector: string;
  weightPct: number;
  venue: "TWSE" | "TPEx";
  date: string;
  changePct: number;
  contributionPctPoints: number;
  estimatedHoldingImpactTwd: number;
};

export type EtfSectorWeight = {
  sector: string;
  weightPct: number;
};

export type EtfResearchResult = {
  compositionCoveragePct: number;
  constituentCount: number;
  top1WeightPct: number;
  top5WeightPct: number;
  top10WeightPct: number;
  hhi: number;
  effectiveHoldingCount: number;
  sectorWeights: EtfSectorWeight[];
  topSector: EtfSectorWeight | null;
  directPortfolioOverlapWeightPct: number;
  directPortfolioOverlapSymbols: string[];
  heldEtfValueTwd: number;
  attributionDate: string | null;
  attributionCoveredWeightPct: number;
  attributionUnresolvedWeightPct: number;
  estimatedEtfReturnPct: number;
  rows: EtfDailyAttributionRow[];
};

function key(market: "TW" | "US", symbol: string) {
  return `${market}:${symbol.trim().toUpperCase()}`;
}

function uniqueQuoteFor(symbol: string, cache: TwQuoteCache) {
  const code = symbol.trim().toUpperCase();
  const rows = cache.quotes.filter((quote) => quote.code.trim().toUpperCase() === code);
  if (rows.length !== 1) return null;
  const quote = rows[0];
  if (
    !quote ||
    quote.close <= 0 ||
    quote.changePct === null ||
    quote.changePct === undefined ||
    !Number.isFinite(quote.changePct)
  ) return null;
  return quote;
}

export function analyzeEtf(
  composition: EtfComposition,
  holdings: Holding[],
  quotes: TwQuoteCache,
  usdTwd: number
): EtfResearchResult {
  const constituents = [...composition.constituents].sort((a, b) => b.weightPct - a.weightPct);
  const compositionCoveragePct = constituents.reduce((sum, item) => sum + item.weightPct, 0);
  const sumTop = (count: number) => constituents.slice(0, count).reduce((sum, item) => sum + item.weightPct, 0);
  const hhi = constituents.reduce((sum, item) => sum + item.weightPct ** 2, 0);
  const effectiveHoldingCount = hhi > 0 ? 10000 / hhi : 0;

  const sectorMap = new Map<string, number>();
  for (const item of constituents) {
    const sector = item.sector.trim() || "未分類";
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + item.weightPct);
  }
  const sectorWeights = [...sectorMap.entries()]
    .map(([sector, weightPct]) => ({ sector, weightPct }))
    .sort((a, b) => b.weightPct - a.weightPct);

  const directHoldingKeys = new Set(
    holdings
      .filter((holding) => holding.type === "stock")
      .map((holding) => key(holding.market, holding.symbol))
  );
  const overlap = constituents.filter((item) => directHoldingKeys.has(key(item.market, item.symbol)));

  const heldEtfValueTwd = holdings
    .filter(
      (holding) =>
        holding.type === "etf" &&
        holding.market === composition.etfMarket &&
        holding.symbol.trim().toUpperCase() === composition.etfSymbol.trim().toUpperCase()
    )
    .reduce((sum, holding) => sum + holdingValueTwd(holding, usdTwd), 0);

  const matched = constituents.flatMap((item) => {
    if (item.market !== "TW") return [];
    const quote = uniqueQuoteFor(item.symbol, quotes);
    if (!quote) return [];
    return [{ item, quote }];
  });

  const attributionDate = matched.map(({ quote }) => quote.date).sort().at(-1) ?? null;
  const rows: EtfDailyAttributionRow[] = attributionDate
    ? matched
        .filter(({ quote }) => quote.date === attributionDate)
        .map(({ item, quote }) => {
          const contributionPctPoints = item.weightPct * (quote.changePct ?? 0) / 100;
          return {
            symbol: item.symbol.trim().toUpperCase(),
            name: item.name,
            sector: item.sector,
            weightPct: item.weightPct,
            venue: quote.market,
            date: quote.date,
            changePct: quote.changePct ?? 0,
            contributionPctPoints,
            estimatedHoldingImpactTwd: heldEtfValueTwd * contributionPctPoints / 100
          };
        })
        .sort((a, b) => Math.abs(b.contributionPctPoints) - Math.abs(a.contributionPctPoints))
    : [];

  const attributionCoveredWeightPct = rows.reduce((sum, row) => sum + row.weightPct, 0);
  const estimatedEtfReturnPct = rows.reduce((sum, row) => sum + row.contributionPctPoints, 0);

  return {
    compositionCoveragePct,
    constituentCount: constituents.length,
    top1WeightPct: sumTop(1),
    top5WeightPct: sumTop(5),
    top10WeightPct: sumTop(10),
    hhi,
    effectiveHoldingCount,
    sectorWeights,
    topSector: sectorWeights[0] ?? null,
    directPortfolioOverlapWeightPct: overlap.reduce((sum, item) => sum + item.weightPct, 0),
    directPortfolioOverlapSymbols: overlap.map((item) => item.symbol.trim().toUpperCase()),
    heldEtfValueTwd,
    attributionDate,
    attributionCoveredWeightPct,
    attributionUnresolvedWeightPct: Math.max(compositionCoveragePct - attributionCoveredWeightPct, 0),
    estimatedEtfReturnPct,
    rows
  };
}
