"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, ArrowUpRight, Landmark, Layers3, Search, WalletCards } from "lucide-react";
import type { AppState } from "@/lib/types";
import {
  allocationByAccount,
  allocationBySector,
  dailySnapshotDelta,
  officialPriceCoverage,
  portfolioCashSummary,
  portfolioSummary,
  snapshotPeriodDelta,
  snapshotsForRange,
  topHoldings,
  type SnapshotRange
} from "@/lib/calc";
import { money, percent } from "@/lib/utils";
import { Badge, Card, CardContent, CardHeader, GhostButton, Metric } from "./ui";

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
  onNavigate?: (section: "portfolio" | "research", researchKey?: string) => void;
}) {
  const [range, setRange] = useState<SnapshotRange>("3M");
  const summary = portfolioSummary(state.holdings, state.usdTwd);
  const cash = portfolioCashSummary(state.holdings, state.usdTwd);
  const sectors = allocationBySector(state.holdings, state.usdTwd).filter((item) => item.name !== "現金");
  const accounts = allocationByAccount(state.holdings, state.usdTwd);
  const topPositions = topHoldings(state.holdings, state.usdTwd, 5);
  const allSnapshots = useMemo(() => [...state.snapshots].sort((a, b) => a.date.localeCompare(b.date)), [state.snapshots]);
  const snapshots = useMemo(() => snapshotsForRange(allSnapshots, range), [allSnapshots, range]);
  const daily = dailySnapshotDelta(allSnapshots);
  const period = snapshotPeriodDelta(snapshots);
  const priceCoverage = officialPriceCoverage(state.holdings);
  const topSector = sectors[0];

  const trend = snapshots.map((snapshot) => ({
    label: snapshot.date.slice(5).replace("-", "/"),
    date: snapshot.date,
    value: Math.round(snapshot.total)
  }));

  return (
    <div className="space-y-4 md:space-y-6">
      {state.dataMode === "demo" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] px-4 py-3 text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
          <div>
            <p className="text-sm font-semibold">目前是 DEMO 示範資料</p>
            <p className="mt-0.5 text-xs opacity-75">所有持股、現金流與淨值都是模擬內容，不會被當成你的真實資產。</p>
          </div>
          <GhostButton onClick={() => onNavigate?.("portfolio")} className="border-current/15 bg-transparent">查看示範持股 <ArrowRight size={15} /></GhostButton>
        </div>
      ) : null}

      {!state.holdings.length ? (
        <Card>
          <CardContent className="py-8 md:py-10">
            <div className="mx-auto max-w-2xl text-center">
              <WalletCards className="mx-auto text-black/25 dark:text-white/25" size={32} />
              <h2 className="mt-4 text-lg font-semibold">3 步開始使用 PortfolioPilot</h2>
              <p className="mt-2 text-sm leading-6 text-black/48 dark:text-white/48">不用先補歷史交易。先建立現在真正持有的部位，就能開始看淨值、配置與官方研究。</p>
            </div>
            <div className="mx-auto mt-5 grid max-w-2xl gap-2 text-left sm:grid-cols-3">
              {[
                ["1", "新增部位", "輸入代號或名稱，自動帶入台股官方資料"],
                ["2", "確認持有資料", "只需補股數、實際平均成本與帳戶"],
                ["3", "更新與研究", "更新官方收盤價，再從持股一鍵進研究"]
              ].map(([step, label, detail]) => (
                <div key={step} className="rounded-2xl border border-black/6 p-3 dark:border-white/8">
                  <span className="text-xs font-semibold text-black/35 dark:text-white/35">STEP {step}</span>
                  <strong className="mt-1 block text-sm">{label}</strong>
                  <span className="mt-1 block text-xs leading-5 text-black/45 dark:text-white/45">{detail}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-center">
              <GhostButton onClick={() => onNavigate?.("portfolio")}>新增第一個部位 <ArrowRight size={15} /></GhostButton>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-2">
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <Metric label="總資產淨值" value={money(summary.total)} helper={daily ? `最近一日淨值變動 ${percent(daily.pct)}` : "依目前輸入價格估算"} />
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
                    <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""} formatter={(value) => money(Number(value))} contentStyle={{ borderRadius: 14, border: "1px solid rgba(0,0,0,.08)", fontSize: 12 }} />
                    <Area type="monotone" dataKey="value" stroke="#456b58" strokeWidth={2.5} fill="url(#networth)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="grid h-full place-items-center rounded-2xl border border-dashed border-black/10 px-5 text-center text-sm text-black/35 dark:border-white/10 dark:text-white/35">
                  每日會自動保留一筆真實淨值；累積兩天後即可比較趨勢。
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-black/40 dark:text-white/40">
              <span>{snapshots.length} 筆快照 · {range === "ALL" ? "全部期間" : ranges.find((item) => item.key === range)?.label}</span>
              {period ? <span className="tabular-nums">{period.firstDate} 起淨值變動：{percent(period.pct)}</span> : null}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-black/32 dark:text-white/32">淨值變動會受入出金影響，不等同投資報酬率；精確績效請看「投資組合 → 績效」。</p>
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
            {!accounts.length ? <p className="py-6 text-center text-sm text-black/40 dark:text-white/40">新增部位後顯示帳戶分布。</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Allocation</p><h2 className="mt-1 text-lg font-semibold">產業配置</h2></div>
              <Layers3 size={19} className="text-black/35 dark:text-white/35" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {sectors.slice(0, 6).map((item) => <div key={item.name}><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">{item.name}</span><span className="tabular-nums text-black/50 dark:text-white/50">{item.pct.toFixed(1)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/8"><div className="h-full rounded-full bg-[#456b58]" style={{ width: `${Math.max(item.pct, 2)}%` }} /></div></div>)}
            {!sectors.length ? <p className="py-6 text-center text-sm text-black/40 dark:text-white/40">新增投資資產後顯示配置。</p> : null}
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
              return <button key={item.holding.id} onClick={() => onNavigate?.(item.holding.market === "TW" ? "research" : "portfolio", researchKey)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-black/[.03] dark:hover:bg-white/[.04]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-black/[.04] text-xs font-semibold dark:bg-white/[.06]">{index + 1}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.holding.symbol} · {item.holding.name}</strong><span className="text-xs text-black/38 dark:text-white/38">{money(item.value)}</span></span><span className="text-sm font-semibold tabular-nums">{item.pct.toFixed(1)}%</span></button>;
            })}
            {!topPositions.length ? <p className="py-6 text-center text-sm text-black/40 dark:text-white/40">尚無投資標的。</p> : null}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_.8fr]">
        <Card>
          <CardHeader><p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Decision cockpit</p><h2 className="mt-1 text-lg font-semibold">今天先看這些</h2></CardHeader>
          <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#edf2ee] p-4 dark:bg-[#17201b]">
              <p className="text-sm font-semibold">最大產業曝險：{topSector?.name ?? "—"}</p>
              <p className="mt-1 text-sm leading-6 text-black/55 dark:text-white/55">{topSector ? `目前約占總資產 ${topSector.pct.toFixed(1)}%。進一步風險集中度可到投資組合查看。` : "新增持股後會顯示集中度。"}</p>
            </div>
            <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
              <p className="text-sm font-semibold">官方台股資料</p>
              <p className="mt-1 text-sm leading-6 text-black/55 dark:text-white/55">
                {priceCoverage.covered === 0
                  ? "尚無由官方快取更新的台股持股價格。"
                  : priceCoverage.manualOrUnknown > 0
                    ? `已有 ${priceCoverage.covered}/${priceCoverage.total} 檔使用官方收盤價；另有 ${priceCoverage.manualOrUnknown} 檔仍是手動或來源未確認。`
                    : priceCoverage.aligned
                      ? `全部 ${priceCoverage.covered} 檔台股官方收盤價資料日一致：${priceCoverage.newestDate}。`
                      : `官方價日期分布：${priceCoverage.oldestDate} ～ ${priceCoverage.newestDate}；部分持股資料日不同。`}
              </p>
            </div>
            <button onClick={() => onNavigate?.("research")} className="flex min-h-16 items-center justify-between rounded-2xl border border-black/6 p-4 text-left transition hover:bg-black/[.025] dark:border-white/8 dark:hover:bg-white/[.03]"><span><strong className="block text-sm">研究我的持股</strong><span className="mt-1 block text-xs text-black/45 dark:text-white/45">營收、估值、法人、Scanner 集中在一頁</span></span><Search size={18} /></button>
            <button onClick={() => onNavigate?.("portfolio")} className="flex min-h-16 items-center justify-between rounded-2xl border border-black/6 p-4 text-left transition hover:bg-black/[.025] dark:border-white/8 dark:hover:bg-white/[.03]"><span><strong className="block text-sm">檢查帳戶與績效</strong><span className="mt-1 block text-xs text-black/45 dark:text-white/45">持股、ETF 穿透、風險、現金流、績效</span></span><ArrowRight size={18} /></button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Trust</p><h2 className="mt-1 text-lg font-semibold">資料可信度</h2></CardHeader>
          <CardContent className="space-y-3 pt-4">
            <div className="flex gap-3 rounded-2xl border border-black/6 p-4 dark:border-white/8">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#8b6538]" />
              <p className="text-sm leading-6 text-black/55 dark:text-white/55">TWSE、TPEx、MOPS 研究資料保留來源與日期；個人淨值仍以你輸入的持股、價格、成本與匯率為準。</p>
            </div>
            <p className="text-xs leading-5 text-black/38 dark:text-white/38">PortfolioPilot 不把 Scanner、估值或資金流轉成買賣評分；它們是研究條件與原始資料。</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
