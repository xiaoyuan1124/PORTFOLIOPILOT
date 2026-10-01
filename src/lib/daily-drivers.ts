import type { Holding, PortfolioActivity } from "./types";
import type { TwQuoteCache } from "./market-data";

export type DailyHoldingDriver = {
  holdingId: string;
  symbol: string;
  name: string;
  venue: "TWSE" | "TPEx";
  holdingType: "stock" | "etf";
  date: string;
  quantity: number;
  close: number;
  change: number;
  changePct: number;
  impactTwd: number;
};

function matchComparableQuote(holding: Holding, cache: TwQuoteCache) {
  const code = holding.symbol.trim().toUpperCase();
  const candidates = cache.quotes.filter((quote) => quote.code.trim().toUpperCase() === code);
  const preferredVenue =
    holding.priceSource === "TWSE" || holding.priceSource === "TPEx"
      ? holding.priceSource
      : null;
  const quote = preferredVenue
    ? candidates.find((candidate) => candidate.market === preferredVenue)
    : candidates.length === 1
      ? candidates[0]
      : undefined;

  if (!quote || quote.close <= 0) return null;
  if (
    quote.change === null ||
    quote.change === undefined ||
    !Number.isFinite(quote.change) ||
    quote.changePct === null ||
    quote.changePct === undefined ||
    !Number.isFinite(quote.changePct)
  ) return null;

  return quote;
}

export function buildDailyHoldingDrivers(holdings: Holding[], cache: TwQuoteCache) {
  const eligible = holdings.filter((holding) => holding.market === "TW" && holding.type !== "cash");
  const matched = eligible.flatMap((holding): DailyHoldingDriver[] => {
    const quote = matchComparableQuote(holding, cache);
    if (!quote) return [];

    return [{
      holdingId: holding.id,
      symbol: holding.symbol,
      name: holding.name,
      venue: quote.market,
      holdingType: holding.type === "etf" ? "etf" : "stock",
      date: quote.date,
      quantity: holding.quantity,
      close: quote.close,
      change: quote.change ?? 0,
      changePct: quote.changePct ?? 0,
      impactTwd: holding.quantity * (quote.change ?? 0)
    }];
  });

  const latestDate = matched.map((row) => row.date).sort().at(-1) ?? null;
  const rows = latestDate ? matched.filter((row) => row.date === latestDate) : [];
  const excludedDifferentDate = matched.length - rows.length;

  return {
    latestDate,
    rows: [...rows].sort((a, b) => Math.abs(b.impactTwd) - Math.abs(a.impactTwd)),
    totalImpactTwd: rows.reduce((sum, row) => sum + row.impactTwd, 0),
    eligibleHoldings: eligible.length,
    matchedHoldings: rows.length,
    unmatchedHoldings: eligible.length - matched.length,
    excludedDifferentDate
  };
}

export function externalCashFlowForDate(activities: PortfolioActivity[], date: string) {
  let depositsTwd = 0;
  let withdrawalsTwd = 0;
  let count = 0;

  for (const activity of activities) {
    if (activity.date !== date) continue;
    if (activity.type !== "deposit" && activity.type !== "withdrawal") continue;

    const twd = activity.amount * (activity.currency === "USD" ? activity.fxRate : 1);
    if (!Number.isFinite(twd)) continue;

    count += 1;
    if (activity.type === "deposit") depositsTwd += twd;
    else withdrawalsTwd += twd;
  }

  return {
    count,
    depositsTwd,
    withdrawalsTwd,
    netTwd: depositsTwd - withdrawalsTwd
  };
}


export function summarizeDailyHoldingDrivers(rows: DailyHoldingDriver[]) {
  const positive = rows.filter((row) => row.impactTwd > 0);
  const negative = rows.filter((row) => row.impactTwd < 0);
  const positiveImpactTwd = positive.reduce((sum, row) => sum + row.impactTwd, 0);
  const negativeImpactTwd = negative.reduce((sum, row) => sum + row.impactTwd, 0);
  const absoluteImpactTwd = rows.reduce((sum, row) => sum + Math.abs(row.impactTwd), 0);

  return {
    positiveImpactTwd,
    negativeImpactTwd,
    netImpactTwd: positiveImpactTwd + negativeImpactTwd,
    absoluteImpactTwd,
    positiveCount: positive.length,
    negativeCount: negative.length,
    flatCount: rows.length - positive.length - negative.length,
    topPositive: [...positive].sort((a, b) => b.impactTwd - a.impactTwd)[0] ?? null,
    topNegative: [...negative].sort((a, b) => a.impactTwd - b.impactTwd)[0] ?? null
  };
}
