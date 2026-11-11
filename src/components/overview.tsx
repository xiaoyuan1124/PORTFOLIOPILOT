"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, ArrowUpRight, Landmark, Layers3, WalletCards } from "lucide-react";
import type { AppState } from "@/lib/types";
import {
  allocationByAccount,
  dailySnapshotDelta,
  localDateKey,
  missingSnapshotDays,
  snapshotChartPoints,
  officialPriceCoverage,
  portfolioCashSummary,
  portfolioSummary,
  snapshotPeriodDelta,
  snapshotsForRange,
  snapshotsThroughDate,
  topHoldings,
  type SnapshotRange
} from "@/lib/calc";
import { money, percent } from "@/lib/utils";
import { calculatePortfolioRisk } from "@/lib/portfolio-risk";
import { Badge, Card, CardContent, CardHeader, GhostButton, Metric } from "./ui";
import { DailyPortfolioDrivers } from "./daily-portfolio-drivers";
import { MarketStatusCenter } from "./market-status-center";

const ranges: Array<{ key: SnapshotRange; label: string }> = [
  { key: "1M", label: "1月" },
  { key: "3M", label: "3月" },
  { key: "YTD", label: "今年" },
  { key: "1Y", label: "1年" },
  { key: "ALL", label: "全部" }
];

export function Overview({
  state,
  onNavigate
}: {
  state: AppState;
  onNavigate?: (section: "portfolio" | "research" | "lab", researchKey?: string, researchType?: "stock" | "etf") => void;
}) {
  const [range, setRange] = useState<SnapshotRange>("3M");
  const summary = portfolioSummary(state.holdings, state.usdTwd);
  const cash = portfolioCashSummary(state.holdings, state.usdTwd);
  const risk = calculatePortfolioRisk(state.holdings, state.etfCompositions, state.usdTwd);
  const sectors = risk.sectorExposures;
  const accounts = allocationByAccount(state.holdings, state.usdTwd);
  const topPositions = topHoldings(state.holdings, state.usdTwd, 5);
  const today = localDateKey();
  const currentSnapshots = useMemo(() => snapshotsThroughDate(state.snapshots, today), [state.snapshots, today]);
  const futureSnapshotCount = state.snapshots.length - currentSnapshots.length;
  const snapshots = useMemo(() => snapshotsForRange(currentSnapshots, range), [currentSnapshots, range]);
  const daily = dailySnapshotDelta(currentSnapshots);
  const period = snapshotPeriodDelta(snapshots);
  const priceCoverage = officialPriceCoverage(state.holdings);
  const missingDays = missingSnapshotDays(snapshots);

  const trend = snapshotChartPoints(snapshots);

  return (
    <div className="space-y-4 md:space-y-6">
      {state.dataMode === "demo" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] px-4 py-3 text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
          <div>
            <p className="text-sm font-semibold">目前是 DEMO 示範資料</p>
            <p className="mt-0.5 text-xs opacity-75">以下為示範數據，非真實資產。</p>
          </div>
          <GhostButton onClick={() => onNavigate?.("portfolio")} className="border-current/15 bg-transparent">查看示範持股 <ArrowRight size={15} /></GhostButton>
        </div>
      ) : null}

      {!state.holdings.length ? (
        <Card data-ux-role="home-first-run">
          <CardContent className="space-y-3 p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold">先建立第一筆持股</h2>
                <p className="mt-1 text-xs leading-5 text-black/50 dark:text-white/50">輸入代號、股數與成本即可開始。</p>
              </div>
              <GhostButton onClick={() => onNavigate?.("portfolio")} className="shrink-0">新增持股 <ArrowRight size={15} /></GhostButton>
            </div>
            <details className="rounded-xl border border-black/8 px-3 py-2 text-xs dark:border-white/10" data-ux-role="home-first-run-help">
              <summary className="min-h-7 cursor-pointer font-semibold">查看完整建立步驟（3 步）</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-4 leading-5 text-black/55 dark:text-white/55">
                <li>輸入證券代號</li>
                <li>填入股數、成本及帳戶</li>
                <li>更新價格並查看績效</li>
              </ol>
            </details>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-2">
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <Metric label="總資產淨值" value={money(summary.total)} helper={daily ? `自 ${daily.previousDate} 變動 ${percent(daily.pct)}` : "依目前輸入價格估算"} />
              <Badge tone={state.dataMode === "demo" ? "warn" : "good"}><ArrowUpRight size={13} /> {state.dataMode === "demo" ? "DEMO" : "本機資料"}</Badge>
            </div>

            <div className="mt-5 flex max-w-full gap-1 overflow-x-auto rounded-xl bg-black/[.025] p-1 dark:bg-white/[.035]">
              {ranges.map((item) => <button key={item.key} onClick={() => setRange(item.key)} className={`min-h-8 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition ${range === item.key ? "bg-white text-[#1f332a] shadow-sm dark:bg-white/10 dark:text-white" : "text-black/40 dark:text-white/40"}`}>{item.label}</button>)}
            </div>

            <div className="mt-4 h-40">
              {trend.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="networth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#456b58" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#456b58" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#78817b" }} minTickGap={24} />
                    <YAxis hide domain={["dataMin", "dataMax"]} />
                    <Tooltip
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                      formatter={(value) => money(Number(value))}
                      contentStyle={{
                        borderRadius: 14,
                        border: "1px solid rgba(0,0,0,.08)",
                        background: "#ffffff",
                        color: "#1b241f",
                        fontSize: 12
                      }}
                      labelStyle={{ color: "#78817b", fontWeight: 500 }}
                      itemStyle={{ color: "#456b58" }}
                    />
                    <Area type="monotone" dataKey="value" connectNulls={false} dot={{ r: 2 }} stroke="#456b58" strokeWidth={2.5} fill="url(#networth)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center rounded-2xl border border-dashed border-black/10 px-5 text-center text-sm text-black/35 dark:border-white/10 dark:text-white/35">
                  尚無足夠的實際淨值紀錄。
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-black/40 dark:text-white/40">
              <span>{snapshots.length} 筆快照 · {range === "ALL" ? "全部期間" : ranges.find((item) => item.key === range)?.label}</span>
              {period ? <span className="tabular-nums">{period.firstDate} 起淨值變動：{percent(period.pct)}</span> : null}
            </div>
            {missingDays > 0 ? <p role="status" data-testid="snapshot-gap-warning" className="mt-2 text-xs text-amber-700 dark:text-amber-300">缺 {missingDays} 天淨值紀錄，圖表不補估。</p> : null}
            <p className="mt-2 text-[11px] leading-5 text-black/32 dark:text-white/32">淨值含入出金；投資報酬率請看「績效」。</p>
            {futureSnapshotCount > 0 ? (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-[#8b6538] dark:text-[#d4ad7c]">
                <AlertTriangle className="mt-0.5 shrink-0" size={13} />
                已排除 {futureSnapshotCount} 筆晚於今天（{today}）的未來淨值快照，避免污染目前趨勢與變動數字。
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Metric label="現金水位" value={money(cash.cash)} helper={`占總資產 ${cash.cashPct.toFixed(1)}%`} />
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/8">
              <div className="h-full rounded-full bg-[#456b58]" style={{ width: `${Math.min(100, cash.cashPct)}%` }} />
            </div>
            <p className="mt-3 text-xs text-black/45 dark:text-white/45">已投入資產 {cash.investedPct.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Metric label="未實現損益" value={money(summary.gain)} helper={percent(summary.gainPct)} />
            <div className="mt-6 flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
              <WalletCards size={15} />
              {state.holdings.filter((h) => h.type !== "cash").length} 個投資標的
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-black/45 dark:text-white/45">
              <Landmark size={15} />
              {accounts.length} 個帳戶 · USD/TWD {state.usdTwd.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="min-w-0" data-ux-role="home-priority">
        <CardContent className="space-y-2.5 p-3.5 md:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">今天先看這些</h2>
            <span className="text-[11px] text-black/45 dark:text-white/45">持股與官方資料狀態</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-black/8 px-3 py-2.5 text-xs dark:border-white/10">
              <span className="text-black/50 dark:text-white/50">最大公司曝險</span>
              <p className="mt-1 font-semibold">{risk.largestCompany
                ? `${risk.largestCompany.name} · ${risk.largestCompany.portfolioPct.toFixed(1)}%`
                : "尚無持股"}</p>
            </div>
            <div className="rounded-xl border border-black/8 px-3 py-2.5 text-xs dark:border-white/10">
              <span className="text-black/50 dark:text-white/50">官方台股報價</span>
              <p className="mt-1 font-semibold">{priceCoverage.total === 0 ? "尚無台股報價" :
                `${priceCoverage.covered}/${priceCoverage.total} 檔有官方價格`}</p>
              {priceCoverage.manualOrUnknown > 0 || (priceCoverage.covered > 0 && !priceCoverage.aligned) ?
                <p className="mt-1 text-amber-700 dark:text-amber-300" role="status">有未確認來源或不同交易日報價，請先核對</p> : null}
            </div>
          </div>
          <details className="rounded-xl border border-black/8 px-3 py-2 dark:border-white/10" data-ux-role="home-trust-details">
            <summary className="min-h-7 cursor-pointer text-xs font-semibold">計算依據</summary>
            <div className="mt-2 space-y-2 text-xs leading-5 text-black/55 dark:text-white/55">
              <p>曝險包含直接持股與 ETF 已知成分股。</p>
              <p>台股資料來源：TWSE／TPEx／MOPS。資產依輸入部位與匯率估算。</p>
              <p>研究數據不代表買賣訊號。</p>
            </div>
          </details>
        </CardContent>
      </Card>

      <MarketStatusCenter />

      <DailyPortfolioDrivers state={state} onNavigate={onNavigate} />

      <details className="rounded-2xl border border-black/8 p-2 dark:border-white/10" data-ux-role="home-allocation-details">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between px-2 text-sm font-semibold">
          <span>展開帳戶分布、產業曝險與最大持股</span>
          <span className="text-xs font-normal text-black/45 dark:text-white/45">進階配置</span>
        </summary>
        <div className="mt-2">
      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Accounts</p><h2 className="mt-1 text-lg font-semibold">帳戶分布</h2></div>
              <Landmark size={19} className="text-black/35 dark:text-white/35" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {accounts.slice(0, 6).map((item) => <div key={item.name}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{item.name}</span><span className="shrink-0 tabular-nums text-black/50 dark:text-white/50">{money(item.value)} · {item.pct.toFixed(1)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/8"><div className="h-full rounded-full bg-[#456b58]" style={{ width: `${Math.max(item.pct, 2)}%` }} /></div></div>)}
            {!accounts.length ? <p className="py-6 text-center text-sm text-black/40 dark:text-white/40">尚無帳戶資料。</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Look-through allocation</p><h2 className="mt-1 text-lg font-semibold">真實產業曝險</h2></div>
              <Layers3 size={19} className="text-black/35 dark:text-white/35" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {sectors.slice(0, 6).map((item) => <div key={item.key}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">{item.label}</span><span className="shrink-0 tabular-nums text-black/50 dark:text-white/50">{item.portfolioPct.toFixed(1)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/8"><div className="h-full rounded-full bg-[#456b58]" style={{ width: `${Math.max(item.portfolioPct, 2)}%` }} /></div></div>)}
            {!sectors.length ? <p className="py-6 text-center text-sm text-black/40 dark:text-white/40">尚無配置資料。</p> : null}
            {sectors.length ? <p className="text-[11px] leading-5 text-black/35 dark:text-white/35">已知成分覆蓋 {risk.riskCoveragePct.toFixed(1)}%</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Top positions</p><h2 className="mt-1 text-lg font-semibold">最大持股</h2></div>
              <WalletCards size={19} className="text-black/35 dark:text-white/35" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-4">
            {topPositions.map((item, index) => {
              const sourceMarket = item.holding.priceSource === "TWSE" || item.holding.priceSource === "TPEx" ? item.holding.priceSource : undefined;
              const researchKey = item.holding.market === "TW" && sourceMarket ? `${sourceMarket}:${item.holding.symbol}` : undefined;
              return <button key={item.holding.id} onClick={() => onNavigate?.(item.holding.market === "TW" ? "research" : "portfolio", researchKey, item.holding.type === "etf" ? "etf" : "stock")} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-black/[.03] dark:hover:bg-white/[.04]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-black/[.04] text-xs font-semibold dark:bg-white/[.06]">{index + 1}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.holding.symbol} · {item.holding.name}</strong><span className="text-xs text-black/38 dark:text-white/38">{money(item.value)}</span></span><span className="text-sm font-semibold tabular-nums">{item.pct.toFixed(1)}%</span></button>;
            })}
            {!topPositions.length ? <p className="py-6 text-center text-sm text-black/40 dark:text-white/40">尚無投資標的。</p> : null}
          </CardContent>
        </Card>
      </section>
        </div>
      </details>


    </div>
  );
}
