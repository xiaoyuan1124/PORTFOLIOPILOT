"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, ArrowUpRight, Landmark, Layers3, WalletCards } from "lucide-react";
import type { AppState } from "@/lib/types";
import {
  allocationByAccount,
  dailySnapshotDelta,
  localDateKey,
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
import { MarketStressPanel } from "./market-stress-panel";
import { snapshotTimeline } from "@/lib/snapshot-timeline";
import { formatNetWorthTick, netWorthChartScale, netWorthFullScale } from "@/lib/net-worth-chart-scale";
import { navCashFlowBridge } from "@/lib/nav-cash-flow-bridge";

const ranges: Array<{ key: SnapshotRange; label: string }> = [
  { key: "1D", label: "1日（已記錄淨值）" },
  { key: "1W", label: "1週" },
  { key: "1M", label: "1月" },
  { key: "3M", label: "3月" },
  { key: "6M", label: "6月" },
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
  const [axisMode, setAxisMode] = useState<"zoom" | "full">("zoom");
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
  const flowBridge = navCashFlowBridge(snapshots, state.activities);
  const priceCoverage = officialPriceCoverage(state.holdings);

  const trend = snapshotTimeline(snapshots);
  const missingWeekdays = trend.filter((point) => point.value === null).length;
  const values = trend.map((point) => point.value);
  const netWorthScale = axisMode === "zoom" ? netWorthChartScale(values) : netWorthFullScale(values);
  const chartMoney = (value: number) => netWorthScale.step < 1
    ? "NT$" + formatNetWorthTick(value, netWorthScale.step)
    : money(value);

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

      {state.holdings.length > 0 ? (<section className="grid gap-3 md:grid-cols-4">
        <Card className="md:col-span-2">
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <Metric label="總資產淨值" value={money(summary.total)} helper={daily ? `最近兩筆記錄差額 ${money(daily.amount)}（${percent(daily.pct)}，含入出金）` : "依本機持股價格估算"} />
              {state.dataMode === "demo" ? <Badge tone="warn">DEMO</Badge> : null}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <label className="sr-only" htmlFor="nav-range">淨值圖時間範圍</label>
              <select id="nav-range" aria-label="淨值圖時間範圍" className="field min-h-11 min-w-0 max-w-[142px] py-1.5 text-xs" value={range} onChange={(event) => setRange(event.target.value as SnapshotRange)}>
                {ranges.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
              <div role="group" aria-label="淨值圖金額刻度" className="inline-flex shrink-0 gap-1 rounded-xl bg-black/[.025] p-1 dark:bg-white/[.035]">
                <button type="button" aria-pressed={axisMode === "zoom"} onClick={() => setAxisMode("zoom")} className={`min-h-9 rounded-lg px-2.5 text-[11px] font-semibold ${axisMode === "zoom" ? "bg-white shadow-sm dark:bg-white/10" : "text-black/45 dark:text-white/45"}`}>放大波動</button>
                <button type="button" aria-pressed={axisMode === "full"} onClick={() => setAxisMode("full")} className={`min-h-9 rounded-lg px-2.5 text-[11px] font-semibold ${axisMode === "full" ? "bg-white shadow-sm dark:bg-white/10" : "text-black/45 dark:text-white/45"}`}>完整金額</button>
              </div>
            </div>
            <div className="mt-2 h-40 md:h-48">
              {trend.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 10, right: 6, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="networth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#456b58" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#456b58" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="currentColor" strokeOpacity={0.08} strokeDasharray="3 4" vertical={false} />
                    <XAxis type="number" scale="time" dataKey="time" domain={["dataMin", "dataMax"]} tickFormatter={(value) => new Date(Number(value)).toISOString().slice(5, 10).replace("-", "/")} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#78817b" }} minTickGap={24} />
                    <YAxis
                      type="number"
                      domain={netWorthScale.domain}
                      ticks={netWorthScale.ticks}
                      tickFormatter={(value) => axisMode === "full" && Math.abs(Number(value)) >= 10000 ? `${Number(value) / 10000}萬` : formatNetWorthTick(Number(value), netWorthScale.step)}
                      width={axisMode === "full" ? 46 : netWorthScale.maximum !== null && netWorthScale.maximum >= 1_000_000 ? 76 : 68}
                      axisLine={false}
                      tickLine={false}
                      tickMargin={5}
                      tick={{ fontSize: 10, fill: "#78817b" }}
                      allowDecimals={netWorthScale.step < 1}
                    />
                    <Tooltip
                      labelFormatter={(value) => new Date(Number(value)).toISOString().slice(0, 10)}
                      formatter={(value) => chartMoney(Number(value))}
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
                    <Area type="linear" connectNulls={false} dataKey="value" stroke="#456b58" strokeWidth={2} fill="url(#networth)" dot={snapshots.length <= 10 ? { r: 2, fill: "#456b58" } : false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center rounded-xl border border-dashed border-black/10 px-3 text-center text-xs text-black/45 dark:border-white/10 dark:text-white/45">
                  {snapshots.length === 1 ? "此期間只有一筆真實淨值，無法畫出走勢。" : "目前沒有足夠的已記錄淨值；不補造歷史價格。"}
                </div>
              )}
            </div>
            {netWorthScale.minimum !== null && netWorthScale.maximum !== null && snapshots.length > 1 ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] tabular-nums text-black/50 dark:text-white/50">
                <span>最低 <strong className="text-inherit">{chartMoney(netWorthScale.minimum)}</strong></span>
                <span>最高 <strong className="text-inherit">{chartMoney(netWorthScale.maximum)}</strong></span>
              </div>
            ) : null}
            {netWorthScale.unchanged && snapshots.length > 1 ? (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">已記錄數值持平；放大刻度不會產生不存在的波動。</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-black/40 dark:text-white/40">
              <span>{snapshots.length} 筆紀錄 · {missingWeekdays} 個平日無快照（含可能休市）</span>
              {period ? <span className="tabular-nums">{period.firstDate} 起 {money(period.amount)} · {percent(period.pct)}</span> : null}
            </div>
            {flowBridge ? <details className="mt-2 rounded-lg border border-black/7 px-2.5 py-1.5 text-xs dark:border-white/8" data-ux-role="nav-flow-reconciliation">
              <summary className="flex min-h-10 cursor-pointer items-center justify-between text-xs font-semibold">區間資金流與損益拆解 <span className="font-normal text-black/40 dark:text-white/40">查看</span></summary>
              <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                <span>資產淨值差額 <strong>{money(flowBridge.changeTwd)}</strong></span>
                <span>期間入金 <strong>{money(flowBridge.depositsTwd)}</strong></span>
                <span>期間提領 <strong>{money(flowBridge.withdrawalsTwd)}</strong></span>
                <span>入金減提領 <strong>{money(flowBridge.netCashFlowTwd)}</strong></span>
                <span className="col-span-2">扣除外部現金流後差額 <strong>{flowBridge.residualTwd === null ? "資料不足" : money(flowBridge.residualTwd)}</strong></span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-black/45 dark:text-white/45">差額不是純投資報酬：仍可能包括匯率變動、手動修改、價格校正與未記錄交易。匯率獨立歸因需完整買賣與歷史匯率成本，請到「績效」核對；不虛構缺漏。</p>
              {flowBridge.invalidCashFlows>0 ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{flowBridge.invalidCashFlows} 筆入出金無法安全換算，暫停差額歸因。</p> : null}
            </details> : null}
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
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/8">
              <div className="h-full rounded-full bg-[#456b58]" style={{ width: `${Math.min(100, cash.cashPct)}%` }} />
            </div>
            <p className="mt-3 text-xs text-black/45 dark:text-white/45">已投入資產 {cash.investedPct.toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Metric label="未實現損益" value={money(summary.gain)} helper={percent(summary.gainPct)} />
            <div className="mt-3 flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
              <WalletCards size={15} />
              {state.holdings.filter((h) => h.type !== "cash").length} 個投資標的
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-black/45 dark:text-white/45">
              <Landmark size={15} />
              {accounts.length} 個帳戶 · USD/TWD {state.usdTwd.toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </section>) : null}

      {state.holdings.length > 0 ? (<Card className="min-w-0" data-ux-role="home-priority">
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
      </Card>) : null}

      <MarketStatusCenter />

      <MarketStressPanel compact onOpen={() => onNavigate?.("research", "__market_stress__")} />

      {state.holdings.length > 0 ? <DailyPortfolioDrivers state={state} onNavigate={onNavigate} /> : null}

      {state.holdings.length > 0 ? (<details className="rounded-2xl border border-black/8 p-2 dark:border-white/10" data-ux-role="home-allocation-details">
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
      </details>) : null}


    </div>
  );
}
