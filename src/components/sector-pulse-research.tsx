"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, ExternalLink, RefreshCw, Search } from "lucide-react";
import type { AppState } from "@/lib/types";
import { loadBundledRevenue, latestRevenuePeriod, type RevenueCache } from "@/lib/revenue-data";
import {
  buildRevenueSectorPulse,
  filterRevenueSectorPulse,
  heldRevenueIndustries
} from "@/lib/sector-pulse";
import { percent } from "@/lib/utils";
import { Badge, Card, CardContent, GhostButton } from "./ui";
import { MarketSectorPulseResearch } from "./market-sector-pulse-research";

function share(value: number) {
  return `${value.toFixed(1)}%`;
}

function RevenueSectorPulseResearch({ state }: { state: AppState }) {
  const [cache, setCache] = useState<RevenueCache | null>(null);
  const [query, setQuery] = useState("");
  const [heldOnly, setHeldOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const heldCodes = useMemo(
    () => new Set(
      state.holdings
        .filter((holding) => holding.market === "TW" && holding.type !== "cash")
        .map((holding) => holding.symbol.toUpperCase())
    ),
    [state.holdings]
  );

  useEffect(() => {
    let active = true;
    void loadBundledRevenue()
      .then((next) => {
        if (!active) return;
        setCache(next);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "無法載入官方月營收資料。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setCache(await loadBundledRevenue());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法載入官方月營收資料。");
    } finally {
      setLoading(false);
    }
  }

  const period = cache ? latestRevenuePeriod(cache) : null;
  const allRows = useMemo(() => cache ? buildRevenueSectorPulse(cache) : [], [cache]);
  const heldIndustries = useMemo(() => cache ? heldRevenueIndustries(cache, heldCodes) : new Set<string>(), [cache, heldCodes]);
  const rows = useMemo(
    () => filterRevenueSectorPulse(allRows, query, heldIndustries, heldOnly),
    [allRows, heldIndustries, heldOnly, query]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-black/6 bg-[#1f332a] p-5 text-white shadow-sm dark:border-white/8 dark:bg-[#dce9e2] dark:text-[#122018]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[.14em] opacity-55">Revenue Sector Pulse · Official Data</p>
            <h3 className="mt-2 text-xl font-semibold">營收族群脈動</h3>
            <p className="mt-2 text-sm leading-6 opacity-75">
              依最新 TWSE／TPEx 官方月營收，把同產業公司聚合成中位數 YoY、正成長占比與 YoY &gt; 20% 占比。這是營收統計，不是股價強弱、排名或買賣建議。
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
                <BarChart3 size={18} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">統計口徑</h3>
                  <Badge tone="good">TWSE / TPEx</Badge>
                  <Badge>至少 5 家有 YoY</Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-black/50 dark:text-white/50">
                  只使用最新月份；「其他／未分類」不做族群訊號。列表按中位數 YoY 由高到低，僅為數值排序。
                </p>
                {period ? <p className="mt-1 text-xs text-black/35 dark:text-white/35">最新資料月份：{period}</p> : null}
              </div>
            </div>
            <GhostButton disabled={loading} onClick={() => void reload()}>
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              {loading ? "讀取中" : "重新讀取"}
            </GhostButton>
          </div>

          {cache?.sources.length ? (
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-black/38 dark:text-white/38">
              {cache.sources.map((source) => (
                <a key={`${source.name}:${source.url}`} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-black/20 underline-offset-2 dark:decoration-white/20">
                  {source.name} <ExternalLink size={10} />
                </a>
              ))}
              <span>快取產生：{cache.generatedAt.slice(0, 10)}</span>
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
        <p className="py-12 text-center text-sm text-black/40 dark:text-white/40">目前持股沒有可對應到官方最新營收產業分類的台股。</p>
      ) : null}

      {!loading && !error && rows.length === 0 && (!heldOnly || heldIndustries.size > 0) ? (
        <p className="py-12 text-center text-sm text-black/40 dark:text-white/40">目前沒有符合搜尋與樣本門檻的產業。</p>
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
                      樣本 {row.yoyCount} 家有 YoY · TWSE {row.twseCount} / TPEx {row.tpexCount}
                    </p>
                  </div>
                  <Badge>{row.period}</Badge>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="mini-metric">
                    <span>YoY 中位數</span>
                    <strong>{percent(row.medianYoyPct, 1)}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>YoY 正成長</span>
                    <strong>{share(row.positiveYoySharePct)}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>YoY &gt; 20%</span>
                    <strong>{share(row.over20YoySharePct)}</strong>
                  </div>
                  <div className="mini-metric">
                    <span>MoM 中位數</span>
                    <strong>{row.medianMomPct === null ? "—" : percent(row.medianMomPct, 1)}</strong>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-black/40 dark:text-white/40">
                      <span>正成長覆蓋</span><span>{share(row.positiveYoySharePct)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/8">
                      <div className="h-full rounded-full bg-[#456b58]" style={{ width: `${Math.min(100, row.positiveYoySharePct)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-black/40 dark:text-white/40">
                      <span>&gt;20% 覆蓋</span><span>{share(row.over20YoySharePct)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/8">
                      <div className="h-full rounded-full bg-[#456b58]" style={{ width: `${Math.min(100, row.over20YoySharePct)}%` }} />
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-[11px] leading-5 text-black/35 dark:text-white/35">
                  公司數 {row.companyCount}；統計只描述最新月營收橫截面，不代表未來報酬、價格動能或產業投資價值。
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}


export function SectorPulseResearch({ state }: { state: AppState }) {
  const [view, setView] = useState<"market" | "revenue">("market");

  return (
    <div className="space-y-4">
      <div className="inline-flex max-w-full overflow-x-auto rounded-2xl border border-black/6 bg-white/70 p-1 dark:border-white/8 dark:bg-white/4">
        <button
          type="button"
          onClick={() => setView("market")}
          className={`min-h-10 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition ${view === "market" ? "bg-[#1f332a] text-white shadow-sm dark:bg-[#dce9e2] dark:text-[#122018]" : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"}`}
        >
          市場日行情
        </button>
        <button
          type="button"
          onClick={() => setView("revenue")}
          className={`min-h-10 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition ${view === "revenue" ? "bg-[#1f332a] text-white shadow-sm dark:bg-[#dce9e2] dark:text-[#122018]" : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"}`}
        >
          月營收基本面
        </button>
      </div>

      {view === "market"
        ? <MarketSectorPulseResearch state={state} />
        : <RevenueSectorPulseResearch state={state} />}
    </div>
  );
}
