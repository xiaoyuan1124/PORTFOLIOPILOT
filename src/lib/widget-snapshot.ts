import { portfolioSummary, latestOfficialPriceDate } from "./calc";
import type { TwQuoteCache } from "./market-data";
import type { AppState, WatchlistItem } from "./types";

// Explicit, minimized v1 contract for the native App Group; NEVER serialize
// AppState/transaction logs/accounts/journal entries to the home screen.
export type PortfolioWidgetSnapshot = {
  version: 1;
  enabled: true;
  isDemo: false;
  generatedAt: string;
  totalTwd: number;
  gainPct: number | null;
  quoteDate: string | null;
  watchlist: Array<{
    symbol: string;
    name: string;
    close: number;
    changePct: number | null;
    date: string;
  }>;
};

function validDate(date: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return false;
  const ms = Date.parse(date + "T00:00:00Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date;
}

function taipeiToday(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Taipei"
  }).format(now).replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$3-$1-$2");
}

function quoteForItem(item: WatchlistItem, cache: TwQuoteCache, today: string) {
  // A code appearing twice on an exchange is ambiguous. Never take the
  // arbitrary first match or manufacture price movements from stored values.
  const matches = cache.quotes.filter((quote) =>
    quote.code === item.symbol &&
    quote.market === item.venue &&
    validDate(quote.date, today) &&
    Number.isFinite(quote.close) && quote.close > 0
  );
  return matches.length === 1 ? matches[0] : null;
}

export function buildPortfolioWidgetSnapshot(
  state: AppState,
  quotes: TwQuoteCache | null,
  now = new Date()
): PortfolioWidgetSnapshot | null {
  // Demo data must never appear to be actual user portfolio data. An empty
  // installation is also not a reason to show fabricated "NT$0" holdings.
  if (state.dataMode === "demo" || (!state.holdings.length && !(state.watchlist?.length))) {
    return null;
  }

  const summary = portfolioSummary(state.holdings, state.usdTwd);
  if (!Number.isFinite(summary.total) || summary.total < 0 || !Number.isFinite(summary.gainPct)) {
    return null;
  }
  const today = taipeiToday(now);
  const watchlist = (state.watchlist ?? [])
    .map((item) => {
      const quote = quotes ? quoteForItem(item, quotes, today) : null;
      if (!quote) return null;
      return {
        symbol: item.symbol,
        name: item.name.trim().slice(0, 60),
        close: quote.close,
        changePct: quote.changePct != null && Number.isFinite(quote.changePct)
          ? quote.changePct
          : null,
        date: quote.date
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 3);

  const officialHoldingDate = latestOfficialPriceDate(state.holdings);
  const quoteDate = [officialHoldingDate, ...watchlist.map((item) => item.date)]
    .filter((date): date is string => Boolean(date) && validDate(date!, today))
    .sort()
    .at(-1) ?? null;

  return {
    version: 1,
    enabled: true,
    isDemo: false,
    generatedAt: now.toISOString(),
    totalTwd: summary.total,
    gainPct: summary.cost > 0 ? summary.gainPct : null,
    quoteDate,
    watchlist
  };
}
