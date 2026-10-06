import type { HoldingLookupCandidate } from "./holding-autofill";
import type { WatchlistItem } from "./types";

export function watchlistKey(item: Pick<WatchlistItem, "venue" | "symbol">) {
  return `${item.venue}:${item.symbol.trim().toUpperCase()}`;
}

export function watchlistItemFromCandidate(
  candidate: HoldingLookupCandidate,
  addedAt: string
): WatchlistItem {
  return {
    id: `watch-${candidate.venue}-${candidate.code.trim().toUpperCase()}`,
    market: "TW",
    venue: candidate.venue,
    symbol: candidate.code.trim().toUpperCase(),
    name: candidate.name.trim(),
    type: candidate.type,
    industry: candidate.industry.trim() || "未分類",
    addedAt
  };
}

export function addToWatchlist(
  current: WatchlistItem[],
  candidate: HoldingLookupCandidate,
  addedAt: string
) {
  const item = watchlistItemFromCandidate(candidate, addedAt);
  if (current.some((existing) => watchlistKey(existing) === watchlistKey(item))) {
    return current;
  }
  return [...current, item];
}

export function removeFromWatchlist(current: WatchlistItem[], item: Pick<WatchlistItem, "venue" | "symbol">) {
  const key = watchlistKey(item);
  return current.filter((existing) => watchlistKey(existing) !== key);
}

export function watchlistContains(current: WatchlistItem[], item: Pick<WatchlistItem, "venue" | "symbol">) {
  const key = watchlistKey(item);
  return current.some((existing) => watchlistKey(existing) === key);
}
