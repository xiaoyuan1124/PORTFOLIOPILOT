"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AppState } from "@/lib/types";
import { localDateKey } from "@/lib/calc";
import { loadBundledRevenue } from "@/lib/revenue-data";
import { loadBundledTwQuotes } from "@/lib/market-data";
import {
  buildHoldingLookupCatalog,
  searchHoldingLookupCatalog,
  type HoldingLookupCandidate
} from "@/lib/holding-autofill";
import { addToWatchlist, removeFromWatchlist, watchlistContains, watchlistKey } from "@/lib/watchlist";
import { Badge, Card, CardContent, GhostButton } from "./ui";

function candidateKey(candidate: HoldingLookupCandidate) {
  return `${candidate.venue}:${candidate.code.trim().toUpperCase()}`;
}

export function Watchlist({
  state,
  onChange,
  onOpenResearch,
  onAddHolding
}: {
  state: AppState;
  onChange: (state: AppState) => boolean;
  onOpenResearch?: (researchKey: string, researchType: "stock" | "etf") => void;
  onAddHolding?: (candidate: HoldingLookupCandidate) => void;
}) {
  const watched = state.watchlist ?? [];
  const [catalog, setCatalog] = useState<HoldingLookupCandidate[] | null>(null);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([loadBundledTwQuotes(), loadBundledRevenue()])
      .then(([quotes, revenue]) => {
        if (!active) return;
        setCatalog(buildHoldingLookupCatalog(quotes, revenue));
        setLoadError("");
      })
      .catch((cause) => {
        if (!active) return;
        setCatalog([]);
        setLoadError(cause instanceof Error ? cause.message : "官方台股／ETF 清單目前無法載入。");
      });
    return () => { active = false; };
  }, []);

  const lookup = useMemo(
    () => new Map((catalog ?? []).map((candidate) => [candidateKey(candidate), candidate])),
    [catalog]
  );

  const results = useMemo(
    () => query.trim() ? searchHoldingLookupCatalog(catalog ?? [], query, 12) : [],
    [catalog, query]
  );

  const heldKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const holding of state.holdings) {
      if (holding.market !== "TW" || holding.type === "cash") continue;
      const symbol = holding.symbol.trim().toUpperCase();
      if (holding.priceSource === "TWSE" || holding.priceSource === "TPEx") {
        keys.add(`${holding.priceSource}:${symbol}`);
      } else {
        keys.add(`TWSE:${symbol}`);
        keys.add(`TPEx:${symbol}`);
      }
    }
    return keys;
  }, [state.holdings]);

  function add(candidate: HoldingLookupCandidate) {
    const next = addToWatchlist(watched, candidate, localDateKey());
    if (next === watched) {
      toast.info(`${candidate.code} 已在自選清單`);
      return;
    }
    if (!onChange({ ...state, watchlist: next })) return;
    toast.success(`已加入 ${candidate.code} · ${candidate.name}`);
  }

  function remove(venue: "TWSE" | "TPEx", symbol: string, name: string) {
    const next = removeFromWatchlist(watched, { venue, symbol });
    if (!onChange({ ...state, watchlist: next })) return;
    toast.success(`已移除 ${symbol} · ${name}`);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-black/6 bg-[#1f332a] p-5 text-white shadow-sm dark:border-white/8 dark:bg-[#dce9e2] dark:text-[#122018]">
        <p className="text-xs font-semibold uppercase tracking-[.14em] opacity-55">Watchlist · Local-first</p>
        <h3 className="mt-2 text-xl font-semibold">先追蹤，再決定要不要買</h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 opacity-70">
          自選清單只存在你的裝置。台股與 ETF 身分、最近官方收盤價及資料日使用 PortfolioPilot 現有官方快取，不建立帳號、不上傳你的清單。
        </p>
      </div>

      <Card>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30" size={17} />
            <input
              className="field pl-11"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="輸入台股／ETF 代號或名稱加入自選"
            />
          </div>

          {loadError ? (
            <p className="mt-3 rounded-xl border border-[#b98b57]/20 bg-[#f5ece1] px-3 py-2 text-xs leading-5 text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
              {loadError}
            </p>
          ) : null}

          {query.trim() ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-black/6 dark:border-white/8">
              {results.map((candidate) => {
                const isWatched = watchlistContains(watched, {
                  venue: candidate.venue,
                  symbol: candidate.code
                });
                const held = heldKeys.has(candidateKey(candidate));
                return (
                  <div
                    key={candidateKey(candidate)}
                    className="flex items-center justify-between gap-3 border-b border-black/5 px-3 py-3 last:border-b-0 dark:border-white/6"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenResearch?.(`${candidate.venue}:${candidate.code}`, candidate.type)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="truncate text-sm">{candidate.code} · {candidate.name}</strong>
                        {held ? <Badge tone="good">持有</Badge> : null}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-black/40 dark:text-white/40">
                        {candidate.venue} · {candidate.type === "etf" ? "ETF" : candidate.industry} · 收盤 {candidate.close.toLocaleString()} · {candidate.date}
                      </span>
                    </button>
                    <GhostButton
                      type="button"
                      className="h-9 min-h-9 shrink-0 px-3 text-xs"
                      disabled={isWatched}
                      onClick={() => add(candidate)}
                    >
                      <Plus size={14} />{isWatched ? "已加入" : "加入"}
                    </GhostButton>
                  </div>
                );
              })}
              {!results.length && catalog !== null ? (
                <p className="px-4 py-8 text-center text-sm text-black/40 dark:text-white/40">找不到符合的官方台股／ETF 資料。</p>
              ) : null}
              {catalog === null ? (
                <p className="px-4 py-8 text-center text-sm text-black/40 dark:text-white/40">正在載入官方清單…</p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Saved locally</p>
          <h3 className="mt-1 font-semibold">我的自選 · {watched.length}</h3>
        </div>
        {watched.length ? <Badge>{watched.length} 檔</Badge> : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {watched.map((item) => {
          const current = lookup.get(watchlistKey(item));
          const held = heldKeys.has(watchlistKey(item));
          return (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenResearch?.(`${item.venue}:${item.symbol}`, item.type)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="truncate">{item.symbol} · {item.name}</strong>
                      <Badge>{item.type === "etf" ? "ETF" : "個股"}</Badge>
                      {held ? <Badge tone="good">持有</Badge> : null}
                    </span>
                    <span className="mt-1 block text-xs text-black/42 dark:text-white/42">
                      {item.venue} · {item.industry}
                    </span>
                  </button>
                  <GhostButton
                    type="button"
                    className="h-9 min-h-9 w-9 shrink-0 px-0"
                    aria-label={`移除 ${item.name}`}
                    onClick={() => remove(item.venue, item.symbol, item.name)}
                  >
                    <Trash2 size={14} />
                  </GhostButton>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="mini-metric">
                    <span>最近官方收盤</span>
                    <strong>{current ? current.close.toLocaleString() : "—"}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>資料日</span>
                    <strong>{current?.date ?? "暫無"}</strong>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-black/35 dark:text-white/35">
                  加入自選 {item.addedAt}{current ? " · 點標的查看研究" : " · 官方清單目前找不到最新資料，已保留你的自選項目"}
                </p>
                {!held && current && onAddHolding ? (
                  <GhostButton
                    type="button"
                    className="mt-3 min-h-9 px-3 text-xs"
                    onClick={() => onAddHolding(current)}
                  >
                    <Plus size={14} />轉成持股
                  </GhostButton>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!watched.length ? (
        <div className="rounded-2xl border border-dashed border-black/10 px-5 py-12 text-center dark:border-white/10">
          <p className="text-sm font-semibold">自選清單還是空的</p>
          <p className="mt-2 text-xs leading-5 text-black/42 dark:text-white/42">上方搜尋股票或 ETF，即可先追蹤、不必先建立持股。</p>
        </div>
      ) : null}
    </div>
  );
}
