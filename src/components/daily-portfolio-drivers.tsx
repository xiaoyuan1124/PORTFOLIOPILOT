"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, BellRing, RefreshCw } from "lucide-react";
import type { AppState } from "@/lib/types";
import { localDateKey } from "@/lib/calc";
import { money, percent } from "@/lib/utils";
import { buildDailyHoldingDrivers, externalCashFlowForDate, summarizeDailyHoldingDrivers } from "@/lib/daily-drivers";
import { loadBundledTwQuotes, type TwQuoteCache } from "@/lib/market-data";
import { loadBundledMaterialEvents, materialEventsForHoldings, type MaterialEventCache } from "@/lib/material-events-data";
import { loadBundledRevenue, type RevenueCache } from "@/lib/revenue-data";
import { buildMarketSectorPulse, heldMarketIndustries } from "@/lib/market-sector-pulse";
import { Badge, Card, CardContent, CardHeader, GhostButton, InfoDisclosure } from "./ui";
import { PortfolioContributionChart } from "./portfolio-contribution-chart";

export function DailyPortfolioDrivers({
  state,
  onNavigate
}: {
  state: AppState;
  onNavigate?: (section: "portfolio" | "research", researchKey?: string) => void;
}) {
  const [quotes, setQuotes] = useState<TwQuoteCache | null>(null);
  const [events, setEvents] = useState<MaterialEventCache | null>(null);
  const [revenue, setRevenue] = useState<RevenueCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoteError, setQuoteError] = useState("");

  async function reload() {
    setLoading(true);
    setQuoteError("");

    const [quoteResult, eventResult, revenueResult] = await Promise.allSettled([
      loadBundledTwQuotes(),
      loadBundledMaterialEvents(),
      loadBundledRevenue()
    ]);

    if (quoteResult.status === "fulfilled") setQuotes(quoteResult.value);
    else {
      setQuotes(null);
      setQuoteError(quoteResult.reason instanceof Error ? quoteResult.reason.message : "無法載入官方台股收盤資料。");
    }

    setEvents(eventResult.status === "fulfilled" ? eventResult.value : null);
    setRevenue(revenueResult.status === "fulfilled" ? revenueResult.value : null);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    void Promise.allSettled([
      loadBundledTwQuotes(),
      loadBundledMaterialEvents(),
      loadBundledRevenue()
    ]).then(([quoteResult, eventResult, revenueResult]) => {
      if (!active) return;

      if (quoteResult.status === "fulfilled") {
        setQuotes(quoteResult.value);
        setQuoteError("");
      } else {
        setQuotes(null);
        setQuoteError(quoteResult.reason instanceof Error ? quoteResult.reason.message : "無法載入官方台股收盤資料。");
      }

      setEvents(eventResult.status === "fulfilled" ? eventResult.value : null);
      setRevenue(revenueResult.status === "fulfilled" ? revenueResult.value : null);
      setLoading(false);
    });

    return () => { active = false; };
  }, []);

  const today = localDateKey();
  const drivers = useMemo(
    () => quotes ? buildDailyHoldingDrivers(state.holdings, quotes) : null,
    [quotes, state.holdings]
  );
  const cashFlow = useMemo(
    () => externalCashFlowForDate(state.activities, today),
    [state.activities, today]
  );
  const todayEvents = useMemo(
    () => events
      ? materialEventsForHoldings(events, state.holdings, 80).filter((row) => row.publishedDate === today)
      : [],
    [events, state.holdings, today]
  );
  const heldSectorRows = useMemo(() => {
    if (!quotes || !revenue) return [];
    const held = heldMarketIndustries(revenue, state.holdings);
    return buildMarketSectorPulse(quotes, revenue).filter((row) => held.has(row.industry));
  }, [quotes, revenue, state.holdings]);

  const strongestHeldSector = heldSectorRows[0] ?? null;
  const weakestHeldSector = heldSectorRows.at(-1) ?? null;
  const contribution = useMemo(
    () => summarizeDailyHoldingDrivers(drivers?.rows ?? []),
    [drivers?.rows]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Daily drivers</p>
            <h2 className="mt-1 text-lg font-semibold">今天我的資產為什麼變動？</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-black/42 dark:text-white/42">
              股票與台灣 ETF 放在同一張圖，直接看今天誰推升、誰拖累。
            </p>
          </div>
          <GhostButton disabled={loading} onClick={() => void reload()}>
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {loading ? "同步中" : "重新同步"}
          </GhostButton>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {quoteError ? (
          <div className="flex gap-2 rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>{quoteError}</span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-[#edf2ee] p-4 dark:bg-[#17201b]">
            <span className="text-xs text-black/45 dark:text-white/45">台股持倉影響估算</span>
            <strong className="mt-1 block text-xl tabular-nums">
              {drivers?.latestDate ? money(drivers.totalImpactTwd) : "—"}
            </strong>
            <span className="mt-1 block text-[11px] leading-5 text-black/38 dark:text-white/38">
              {drivers?.latestDate
                ? `${drivers.latestDate} 官方收盤 · ${drivers.matchedHoldings}/${drivers.eligibleHoldings} 檔納入`
                : "等待可比較的官方收盤資料"}
            </span>
          </div>

          <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
            <span className="text-xs text-black/45 dark:text-white/45">今日外部現金流</span>
            <strong className="mt-1 block text-xl tabular-nums">{money(cashFlow.netTwd)}</strong>
            <span className="mt-1 block text-[11px] leading-5 text-black/38 dark:text-white/38">
              {cashFlow.count ? `${cashFlow.count} 筆入金／出金，與投資損益分開` : "今天沒有記錄入金／出金"}
            </span>
          </div>

          <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
            <span className="text-xs text-black/45 dark:text-white/45">今日持股重大訊息</span>
            <strong className="mt-1 block text-xl tabular-nums">{events ? todayEvents.length : "—"}</strong>
            <span className="mt-1 block text-[11px] leading-5 text-black/38 dark:text-white/38">
              {events ? `${today} 官方公告` : "重大訊息資料暫時不可用"}
            </span>
          </div>

          <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
            <span className="text-xs text-black/45 dark:text-white/45">持股相關族群</span>
            <strong className="mt-1 block truncate text-sm">
              {strongestHeldSector ? `${strongestHeldSector.industry} ${percent(strongestHeldSector.medianChangePct, 2)}` : "—"}
            </strong>
            <span className="mt-1 block text-[11px] leading-5 text-black/38 dark:text-white/38">
              {weakestHeldSector && weakestHeldSector !== strongestHeldSector
                ? `相對較弱：${weakestHeldSector.industry} ${percent(weakestHeldSector.medianChangePct, 2)}`
                : revenue ? "依官方日行情中位數描述" : "族群資料暫時不可用"}
            </span>
          </div>
        </div>

        {drivers?.excludedDifferentDate ? (
          <p className="flex items-start gap-1.5 text-[11px] leading-5 text-[#8b6538] dark:text-[#d4ad7c]">
            <AlertTriangle className="mt-0.5 shrink-0" size={13} />
            有 {drivers.excludedDifferentDate} 檔官方報價資料日與最新交易日不同，未混入本次持倉影響合計。
          </p>
        ) : null}

        {drivers?.unmatchedHoldings ? (
          <p className="text-[11px] leading-5 text-black/35 dark:text-white/35">
            另有 {drivers.unmatchedHoldings} 檔台股因缺少可比較漲跌、來源不明或市場代號歧義而未估算；系統不會猜測。
          </p>
        ) : null}

        {drivers?.rows.length ? (
          <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">今日持倉貢獻</p>
                <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                  {drivers.latestDate} · 依當日官方收盤漲跌 × 目前持有數量估算
                </p>
              </div>
              <Badge>{drivers.matchedHoldings}/{drivers.eligibleHoldings} 檔覆蓋</Badge>
            </div>
            <PortfolioContributionChart rows={drivers.rows} />
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="mini-metric"><span>推升合計</span><strong>{money(contribution.positiveImpactTwd)}</strong></div>
              <div className="mini-metric"><span>拖累合計</span><strong>{money(contribution.negativeImpactTwd)}</strong></div>
              <div className="mini-metric"><span>淨影響</span><strong>{money(contribution.netImpactTwd)}</strong></div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-black/[.025] p-3 text-xs dark:bg-white/[.035]">
                <span className="text-black/40 dark:text-white/40">最大推升</span>
                <strong className="mt-1 block">
                  {contribution.topPositive
                    ? `${contribution.topPositive.symbol} · ${contribution.topPositive.name} · ${money(contribution.topPositive.impactTwd)}`
                    : "—"}
                </strong>
              </div>
              <div className="rounded-xl bg-black/[.025] p-3 text-xs dark:bg-white/[.035]">
                <span className="text-black/40 dark:text-white/40">最大拖累</span>
                <strong className="mt-1 block">
                  {contribution.topNegative
                    ? `${contribution.topNegative.symbol} · ${contribution.topNegative.name} · ${money(contribution.topNegative.impactTwd)}`
                    : "—"}
                </strong>
              </div>
            </div>
            <InfoDisclosure summary="這張貢獻圖怎麼算" className="mt-3">
              使用目前持有數量 × 官方最新同日收盤漲跌估算每個台股股票／台灣 ETF 的當日持倉影響。它不是券商逐筆損益，也不把入金、出金混進投資表現；不同交易日或缺乏可比報價的標的不會被硬塞進合計。
            </InfoDisclosure>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-3">
          <button onClick={() => onNavigate?.("research")} className="flex min-h-14 items-center justify-between rounded-2xl border border-black/6 px-4 text-left text-sm font-semibold transition hover:bg-black/[.025] dark:border-white/8 dark:hover:bg-white/[.03]">
            <span className="flex items-center gap-2"><BellRing size={16} />查看重大訊息與族群</span><ArrowRight size={15} />
          </button>
          <button onClick={() => onNavigate?.("portfolio")} className="flex min-h-14 items-center justify-between rounded-2xl border border-black/6 px-4 text-left text-sm font-semibold transition hover:bg-black/[.025] dark:border-white/8 dark:hover:bg-white/[.03]">
            <span className="flex items-center gap-2"><Activity size={16} />檢查現金流與績效</span><ArrowRight size={15} />
          </button>
          <div className="flex min-h-14 items-center rounded-2xl border border-black/6 px-4 text-[11px] leading-5 text-black/38 dark:border-white/8 dark:text-white/38">
            <Badge>最新交易日</Badge><span className="ml-2">{drivers?.latestDate ?? "等待官方行情"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
