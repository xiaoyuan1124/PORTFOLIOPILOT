"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ExternalLink, RefreshCw, Search } from "lucide-react";
import type { AppState } from "@/lib/types";
import { cacheMarketFreshness, loadBundledTwQuotes, type TwQuoteCache } from "@/lib/market-data";
import { loadBundledRevenue, type RevenueCache } from "@/lib/revenue-data";
import {
  buildMarketSectorPulse,
  filterMarketSectorPulse,
  heldMarketIndustries
} from "@/lib/market-sector-pulse";
import { percent } from "@/lib/utils";
import { Badge, Card, CardContent, GhostButton } from "./ui";

function share(value: number) {
  return `${value.toFixed(1)}%`;
}

export function MarketSectorPulseResearch({ state }: { state: AppState }) {
  const [quotes, setQuotes] = useState<TwQuoteCache | null>(null);
  const [revenue, setRevenue] = useState<RevenueCache | null>(null);
  const [query, setQuery] = useState("");
  const [heldOnly, setHeldOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const [nextQuotes, nextRevenue] = await Promise.all([
        loadBundledTwQuotes(),
        loadBundledRevenue()
      ]);
      setQuotes(nextQuotes);
      setRevenue(nextRevenue);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法載入官方市場族群資料。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([loadBundledTwQuotes(), loadBundledRevenue()])
      .then(([nextQuotes, nextRevenue]) => {
        if (!active) return;
        setQuotes(nextQuotes);
        setRevenue(nextRevenue);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "無法載入官方市場族群資料。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const allRows = useMemo(
    () => quotes && revenue ? buildMarketSectorPulse(quotes, revenue) : [],
    [quotes, revenue]
  );
  const heldIndustries = useMemo(
    () => revenue ? heldMarketIndustries(revenue, state.holdings) : new Set<string>(),
    [revenue, state.holdings]
  );
  const rows = useMemo(
    () => filterMarketSectorPulse(allRows, query, heldIndustries, heldOnly),
    [allRows, heldIndustries, heldOnly, query]
  );
  const freshness = quotes ? cacheMarketFreshness(quotes) : { TWSE: null, TPEx: null };

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-black/6 bg-[#1f332a] p-5 text-white shadow-sm dark:border-white/8 dark:bg-[#dce9e2] dark:text-[#122018]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[.14em] opacity-55">Market Sector Pulse · Official EOD</p>
            <h3 className="mt-2 text-xl font-semibold">市場族群脈動</h3>
            <p className="mt-2 text-sm leading-6 opacity-75">
              以 TWSE／TPEx 官方當日收盤漲跌，搭配官方最新月營收產業分類，整理族群日漲跌中位數與上漲／下跌家數占比。只描述當日橫截面，不做利多利空、買賣評分或未來報酬預測。
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold">{allRows.length}</p>
            <p className="text-xs opacity-60">符合樣本門檻的產業</p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#edf2ee] text-[#335b46] dark:bg-[#17201b] dark:text-[#a8dab8]">
                <Activity size={18} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">統計口徑</h3>
                  <Badge tone="good">官方收盤</Badge>
                  <Badge>至少 5 家可比較</Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-black/50 dark:text-white/50">
                  使用官方 Change 欄位回推日漲跌百分比；除權息／不比價等無法直接比較的列會排除，不會用前一日價格自行猜測。
                </p>
                <p className="mt-1 text-xs text-black/35 dark:text-white/35">
                  TWSE 資料日 {freshness.TWSE ?? "—"} · TPEx 資料日 {freshness.TPEx ?? "—"}
                </p>
              </div>
            </div>
            <GhostButton disabled={loading} onClick={() => void reload()}>
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              {loading ? "讀取中" : "重新讀取"}
            </GhostButton>
          </div>

          {quotes?.sources.length ? (
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-black/38 dark:text-white/38">
              {quotes.sources.map((source) => (
                <a key={`${source.name}:${source.url}`} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-black/20 underline-offset-2 dark:decoration-white/20">
                  {source.name} <ExternalLink size={10} />
                </a>
              ))}
              <span>快取產生：{quotes.generatedAt.slice(0, 10)}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/35 dark:text-white/35" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋產業，例如：半導體、電子零組件"
            className="field pl-11"
          />
        </div>
        <GhostButton onClick={() => setHeldOnly((value) => !value)}>
          {heldOnly ? "顯示全部族群" : "只看持股相關族群"}
        </GhostButton>
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
          {error}
        </div>
      ) : null}

      {!loading && !error && heldOnly && heldIndustries.size === 0 ? (
        <p className="py-12 text-center text-sm text-black/40 dark:text-white/40">目前持股沒有可對應到官方產業分類的台股。</p>
      ) : null}

      {!loading && !error && rows.length === 0 && (!heldOnly || heldIndustries.size > 0) ? (
        <p className="py-12 text-center text-sm text-black/40 dark:text-white/40">目前沒有符合搜尋與樣本門檻的市場族群。</p>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        {rows.map((row) => {
          const held = heldIndustries.has(row.industry);
          return (
            <Card key={row.industry}>
              <CardContent className="p-4 md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{row.industry}</h3>
                      {held ? <Badge tone="good">持股相關</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                      可比較樣本 {row.sampleCount} 家 · TWSE {row.twseCount} / TPEx {row.tpexCount}
                    </p>
                  </div>
                  <Badge>{row.twseDate === row.tpexDate ? row.twseDate ?? row.tpexDate ?? "—" : "跨市場日期"}</Badge>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="mini-metric">
                    <span>日漲跌中位數</span>
                    <strong>{percent(row.medianChangePct, 2)}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>上漲家數</span>
                    <strong>{share(row.upSharePct)}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>下跌家數</span>
                    <strong>{share(row.downSharePct)}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>平盤</span>
                    <strong>{share(row.flatSharePct)}</strong>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-black/40 dark:text-white/40">
                    <span>上漲家數占比</span><span>{share(row.upSharePct)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/8">
                    <div className="h-full rounded-full bg-[#456b58]" style={{ width: `${Math.min(100, row.upSharePct)}%` }} />
                  </div>
                </div>

                <p className="mt-4 text-[11px] leading-5 text-black/35 dark:text-white/35">
                  這是當日市場廣度統計；原始收盤價未做還原權值，不適合拿來推論除權息事件日或未來投資報酬。
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
