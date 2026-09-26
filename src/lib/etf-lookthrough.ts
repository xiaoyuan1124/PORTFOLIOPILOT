import { holdingValueTwd, portfolioSummary } from "./calc";
import type { EtfComposition, Holding, Market } from "./types";

export type LookThroughContribution = {
  etfMarket: Market;
  etfSymbol: string;
  etfName: string;
  valueTwd: number;
  weightPct: number;
  asOf: string;
  sourceName: string;
  sourceUrl: string;
};

export type CompanyExposure = {
  market: Market;
  symbol: string;
  name: string;
  sector: string;
  directValueTwd: number;
  implicitValueTwd: number;
  totalValueTwd: number;
  portfolioPct: number;
  contributions: LookThroughContribution[];
};

export type EtfCoverage = {
  market: Market;
  symbol: string;
  name: string;
  valueTwd: number;
  status: "covered" | "partial" | "insufficient";
  compositionCoveragePct: number;
  coveredValueTwd: number;
  unresolvedValueTwd: number;
  asOf: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
};

export type LookThroughResult = {
  portfolioValueTwd: number;
  etfValueTwd: number;
  coveredEtfValueTwd: number;
  unresolvedEtfValueTwd: number;
  etfCoveragePct: number;
  exposures: CompanyExposure[];
  etfs: EtfCoverage[];
};

function positionKey(market: Market, symbol: string) {
  return `${market}:${symbol.toUpperCase()}`;
}

function compositionCoveragePct(composition: EtfComposition) {
  return composition.constituents.reduce((sum, item) => sum + item.weightPct, 0);
}

export function calculateEtfLookThrough(
  holdings: Holding[],
  compositions: EtfComposition[],
  usdTwd: number
): LookThroughResult {
  const portfolioValueTwd = portfolioSummary(holdings, usdTwd).total;
  const compositionByEtf = new Map(
    compositions.map((composition) => [
      positionKey(composition.etfMarket, composition.etfSymbol),
      composition
    ])
  );
  const exposureByCompany = new Map<string, Omit<CompanyExposure, "portfolioPct">>();
  const etfs: EtfCoverage[] = [];
  let etfValueTwd = 0;
  let coveredEtfValueTwd = 0;
  let unresolvedEtfValueTwd = 0;

  function addExposure({
    market,
    symbol,
    name,
    sector,
    directValueTwd = 0,
    implicitValueTwd = 0,
    contribution
  }: {
    market: Market;
    symbol: string;
    name: string;
    sector: string;
    directValueTwd?: number;
    implicitValueTwd?: number;
    contribution?: LookThroughContribution;
  }) {
    const key = positionKey(market, symbol);
    const current = exposureByCompany.get(key) ?? {
      market,
      symbol: symbol.toUpperCase(),
      name,
      sector,
      directValueTwd: 0,
      implicitValueTwd: 0,
      totalValueTwd: 0,
      contributions: []
    };
    current.directValueTwd += directValueTwd;
    current.implicitValueTwd += implicitValueTwd;
    current.totalValueTwd = current.directValueTwd + current.implicitValueTwd;
    if (!current.name && name) current.name = name;
    if ((!current.sector || current.sector === "未分類") && sector) current.sector = sector;
    if (contribution) current.contributions.push(contribution);
    exposureByCompany.set(key, current);
  }

  for (const holding of holdings) {
    const valueTwd = holdingValueTwd(holding, usdTwd);
    if (holding.type === "cash") continue;

    if (holding.type === "stock") {
      addExposure({
        market: holding.market,
        symbol: holding.symbol,
        name: holding.name,
        sector: holding.sector,
        directValueTwd: valueTwd
      });
      continue;
    }

    etfValueTwd += valueTwd;
    const composition = compositionByEtf.get(positionKey(holding.market, holding.symbol));
    if (!composition) {
      unresolvedEtfValueTwd += valueTwd;
      etfs.push({
        market: holding.market,
        symbol: holding.symbol.toUpperCase(),
        name: holding.name,
        valueTwd,
        status: "insufficient",
        compositionCoveragePct: 0,
        coveredValueTwd: 0,
        unresolvedValueTwd: valueTwd,
        asOf: null,
        sourceName: null,
        sourceUrl: null
      });
      continue;
    }

    const rawCoveragePct = compositionCoveragePct(composition);
    const coveragePct = Math.min(rawCoveragePct, 100);
    const coveredValue = valueTwd * (coveragePct / 100);
    const unresolvedValue = Math.max(valueTwd - coveredValue, 0);
    coveredEtfValueTwd += coveredValue;
    unresolvedEtfValueTwd += unresolvedValue;

    for (const component of composition.constituents) {
      const implicitValueTwd = valueTwd * (component.weightPct / 100);
      addExposure({
        market: component.market,
        symbol: component.symbol,
        name: component.name,
        sector: component.sector,
        implicitValueTwd,
        contribution: {
          etfMarket: holding.market,
          etfSymbol: holding.symbol.toUpperCase(),
          etfName: holding.name,
          valueTwd: implicitValueTwd,
          weightPct: component.weightPct,
          asOf: composition.asOf,
          sourceName: composition.sourceName,
          sourceUrl: composition.sourceUrl
        }
      });
    }

    etfs.push({
      market: holding.market,
      symbol: holding.symbol.toUpperCase(),
      name: holding.name,
      valueTwd,
      status: coveragePct >= 99.5 ? "covered" : "partial",
      compositionCoveragePct: rawCoveragePct,
      coveredValueTwd: coveredValue,
      unresolvedValueTwd: unresolvedValue,
      asOf: composition.asOf,
      sourceName: composition.sourceName,
      sourceUrl: composition.sourceUrl
    });
  }

  return {
    portfolioValueTwd,
    etfValueTwd,
    coveredEtfValueTwd,
    unresolvedEtfValueTwd,
    etfCoveragePct: etfValueTwd > 0 ? (coveredEtfValueTwd / etfValueTwd) * 100 : 0,
    exposures: [...exposureByCompany.values()]
      .map((exposure) => ({
        ...exposure,
        portfolioPct: portfolioValueTwd > 0 ? (exposure.totalValueTwd / portfolioValueTwd) * 100 : 0
      }))
      .sort((a, b) => b.totalValueTwd - a.totalValueTwd),
    etfs: etfs.sort((a, b) => b.valueTwd - a.valueTwd)
  };
}
