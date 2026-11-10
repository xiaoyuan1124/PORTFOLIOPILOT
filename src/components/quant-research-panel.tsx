"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, ChevronDown, RefreshCw } from "lucide-react";
import { loadTwPriceHistory, loadTwPriceHistoryIndex, type TwPriceHistoryIndex, type TwPriceHistorySeries } from "@/lib/price-history-data";
import { benchmarkById, benchmarkWindow, loadBundledBenchmarks, type BenchmarkCache } from "@/lib/benchmark";
import { relativePerformancePct } from "@/lib/price-history";
import {
  DEFAULT_QUANT_CONFIG, projectGrowthScenarios, runQuantResearch,
  type GrowthScenarios, type QuantConfig, type QuantReport, type QuantSummary
} from "@/lib/quant-research";
import { Card, CardContent, Badge } from "./ui";

type Market = "TWSE" | "TPEx";
type Request = { market: Market; symbol: string };
type SourceState = { key: string; index: TwPriceHistoryIndex | null; history: TwPriceHistorySeries | null; error: string; ageDays?: number };
const initial: Request = { market: "TWSE", symbol: "2330" };
const tradingHorizons = [21, 63, 126, 252] as const;
type Horizon = typeof tradingHorizons[number];
type QuantView = "results" | "future" | "trades";
const smallLabel = "block space-y-1 text-xs font-semibold text-black/55 dark:text-white/55";
const warning = "rounded-xl border border-amber-400/30 bg-amber-50/80 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200";

function keyToRequest(key?: string): Request | null {
  if (!key) return null;
  const match = /^(TWSE|TPEx):([A-Za-z0-9]{4,8})$/.exec(key);
  return match ? { market: match[1] as Market, symbol: match[2].toUpperCase() } : null;
}
function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "資料不足" : (value >= 0 ? "+" : "") + value.toFixed(2) + "%";
}
function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="mini-metric"><span>{label}</span><strong className="tabular-nums">{value}</strong></div>;
}
function SectionSummary({ heading, report }: { heading: string; report: QuantSummary }) {
  return <section className="rounded-2xl border border-black/6 p-3 dark:border-white/8">
    <h4 className="mb-2 text-sm font-semibold">{heading}</h4>
    <p className="mb-3 text-[11px] text-black/45 dark:text-white/45">{report.firstDate} ～ {report.lastDate}</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Metric label="策略總報酬（扣成本）" value={formatPercent(report.totalReturnPct)} />
      <Metric label="同期買進持有（扣成本）" value={formatPercent(report.buyHoldReturnPct)} />
      <Metric label="最大回撤" value={formatPercent(report.maxDrawdownPct)} />
      <Metric label="夏普比率（無風險利率假設 0）" value={report.sharpe === null ? "資料不足" : report.sharpe.toFixed(2)} />
      <Metric label="完整交易數" value={String(report.completedTrades)} />
      <Metric label="完成交易勝率" value={formatPercent(report.winRatePct)} />
    </div>
  </section>;
}
function ScenarioChart({ scenario, horizon }: { scenario: GrowthScenarios; horizon: Horizon }) {
  const end = scenario.paths.at(-1)!;
  const checkpoints = [0, 21, 63, 126, 252].filter(day => day <= horizon);
  return <div className="space-y-3">
    <div className="grid grid-cols-3 gap-2">
      <Metric label="悲觀情境 P10" value={formatMoney(end.low)} />
      <Metric label="中位情境 P50" value={formatMoney(end.median)} />
      <Metric label="樂觀情境 P90" value={formatMoney(end.high)} />
    </div>
    <div className="h-[265px] w-full" role="img" aria-label="未來情境模擬曲線，10、50、90 百分位線">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={scenario.paths} margin={{ top: 6, right: 2, left: 0, bottom: 2 }}>
          <CartesianGrid strokeOpacity={0.09} vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} minTickGap={22} tickFormatter={(day) => "+" + day} />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip labelFormatter={(day) => "未來第 " + day + " 個交易日"} formatter={(value, name) => [formatMoney(Number(value)), String(name)]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
          <Area type="monotone" dataKey="high" name="P90 情境" stroke="#659880" strokeDasharray="5 4" strokeWidth={1.4} fill="#7fb99a" fillOpacity={0.1} dot={false} />
          <Area type="monotone" dataKey="low" name="P10 情境" stroke="#b58d59" strokeDasharray="5 4" strokeWidth={1.4} fillOpacity={0} dot={false} />
          <Line type="monotone" dataKey="median" name="P50 中位" stroke="#315f49" strokeWidth={2.4} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-left text-xs">
        <thead className="text-black/45 dark:text-white/45"><tr><th className="py-2">交易日</th><th>P10</th><th>P50</th><th>P90</th></tr></thead>
        <tbody>{checkpoints.map(day => {
          const row = scenario.paths[day];
          return <tr key={day} className="border-t border-black/5 dark:border-white/8"><td className="py-2">{day === 0 ? "基準日" : "+" + day}</td><td>{formatMoney(row.low)}</td><td>{formatMoney(row.median)}</td><td>{formatMoney(row.high)}</td></tr>;
        })}</tbody>
      </table>
    </div>
    <p className="text-[11px] leading-5 text-black/50 dark:text-white/50">使用最近 {scenario.sampleDays} 筆日報酬、5 日區塊重抽樣、固定亂數種子與 {scenario.observations} 條模擬路徑。P10／P50／P90 是模擬結果的百分位數，不是經校準的 80% 信賴區間，更不是未來股價預言。</p>
  </div>;
}

/**
 * Native PortfolioPilot integration. No iframe, no remote AI, no broker tokens.
 * Existing PilotQuant standalone is retained for advanced CSV/multi-symbol study.
 */
export function QuantResearchPanel({ requestedKey }: { requestedKey?: string }) {
  const [market, setMarket] = useState<Market>(keyToRequest(requestedKey)?.market ?? initial.market);
  const [symbol, setSymbol] = useState(keyToRequest(requestedKey)?.symbol ?? initial.symbol);
  const [request, setRequest] = useState<Request>(keyToRequest(requestedKey) ?? initial);
  const [reloadToken, setReloadToken] = useState(0);
  const [source, setSource] = useState<SourceState>({ key: "", index: null, history: null, error: "" });
  const [config, setConfig] = useState<QuantConfig>(DEFAULT_QUANT_CONFIG);
  const [horizon, setHorizon] = useState<Horizon>(126);
  const [view, setView] = useState<QuantView>("results");
  const [marketBenchmark, setMarketBenchmark] = useState<BenchmarkCache | null>(null);

  useEffect(() => {
    let active = true;
    void loadBundledBenchmarks().then(cache => { if (active) setMarketBenchmark(cache); })
      .catch(() => { if (active) setMarketBenchmark(null); });
    return () => { active = false; };
  }, [reloadToken]);

  // A new requested stock remounts this component through its parent key.
  // No effect synchronously copying props into local input state.
  const requestKey = request.market + ":" + request.symbol;
  useEffect(() => {
    let active = true;
    void Promise.all([loadTwPriceHistoryIndex(), loadTwPriceHistory(request.market, request.symbol)])
      .then(([index, history]) => {
        if (!active) return;
        const lastDate = history.endDate ?? "";
        const ageDays = lastDate ? Math.max(0, Math.floor((Date.now() - new Date(lastDate + "T00:00:00+08:00").getTime()) / 86400000)) : 0;
        setSource({ key: requestKey, index, history, error: "", ageDays });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setSource({ key: requestKey, index: null, history: null, error: cause instanceof Error ? cause.message : "官方資料讀取失敗" });
      });
    return () => { active = false; };
  }, [requestKey, request.market, request.symbol, reloadToken]);

  const current = source.key === requestKey ? source : null;
  const history = current?.history ?? null;
  const index = current?.index ?? null;
  const blockedReason = useMemo(() => {
    if (!history || !index) return "";
    if (history.generatedAt !== index.generatedAt) return "歷史分桶版本與官方索引不一致，請更新快取後重試。";
    if (history.market !== request.market || history.symbol !== request.symbol) return "官方歷史資料標的識別不符。";
    if (history.endDate && history.endDate > index.targetEndDate) return "歷史資料日期超出快取的有效範圍。";
    const failed = index.failed.filter(item => item.market === request.market && item.date >= (history.startDate ?? "") && item.date <= (history.endDate ?? ""));
    return failed.length ? "官方行情有 " + failed.length + " 個交易日抓取失敗，暫停量化回測避免誤判。" : "";
  }, [history, index, request.market, request.symbol]);
  const calculation = useMemo((): { report: QuantReport | null; scenario: GrowthScenarios | null; error: string; projectionError: string } => {
    if (!history || !index || blockedReason) return { report: null, scenario: null, error: blockedReason, projectionError: "" };
    try {
      const report = runQuantResearch(history.points, config);
      try {
        return { report, scenario: projectGrowthScenarios(history.points, horizon), error: "", projectionError: "" };
      } catch (cause) {
        return { report, scenario: null, error: "", projectionError: cause instanceof Error ? cause.message : "無法產生成長情境" };
      }
    } catch (cause) {
      return { report: null, scenario: null, error: cause instanceof Error ? cause.message : "回測資料不足", projectionError: "" };
    }
  }, [history, index, blockedReason, config, horizon]);
  const benchmarkComparison = useMemo(() => {
    if (!marketBenchmark || !history || !calculation.report) return null;
    const series = benchmarkById(marketBenchmark, "TWSE:TAIEX-PRICE");
    if (!series) return null;
    const period = calculation.report.outOfSample;
    const result = benchmarkWindow(series, period.firstDate, period.lastDate);
    if (result.status !== "available" || result.returnPct === null || !result.calendarDatesExact) return null;
    const start = history.points.find(point => point[0] === result.actualStart);
    const end = history.points.find(point => point[0] === result.actualEnd);
    if (!start || !end || !start[1]) return null;
    const stockReturn = (end[1] / start[1] - 1) * 100;
    return { stockReturn, benchmarkReturn: result.returnPct, relative: relativePerformancePct(stockReturn, result.returnPct), dates: [result.actualStart, result.actualEnd] };
  }, [marketBenchmark, history, calculation.report]);
  const staleDays = current?.ageDays ?? 0;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const advancedUrl = basePath + "/quant-lab/";

  function submit() {
    const code = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      setSource({ key: requestKey, history: null, index: null, error: "請輸入 4～8 位的台股或 ETF 代號" });
      return;
    }
    setRequest({ market, symbol: code });
    setReloadToken(n => n + 1);
  }


  return <div className="space-y-3 md:space-y-4" data-testid="pilotquant-surface">
    <div className="flex min-w-0 items-center justify-between gap-2 px-0.5" data-testid="pilotquant-top">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-black/45 dark:text-white/45">PILOTQUANT · RESEARCH</p>
        <h2 className="mt-0.5 truncate text-lg font-semibold md:text-xl">個股量化研究</h2>
      </div>
      <Badge>研究模擬</Badge>
    </div>

    <Card><CardContent className="space-y-3 p-3 md:p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-2 sm:grid-cols-[minmax(0,1fr)_110px_auto]" role="search" aria-label="選擇研究標的">
        <label className={smallLabel}>股票／ETF 代號
          <input className="field mt-1" aria-label="股票或 ETF 代號" value={symbol}
            onChange={event => setSymbol(event.target.value.toUpperCase())}
            onKeyDown={event => { if (event.key === "Enter") submit(); }}
            maxLength={8} inputMode="text" placeholder="例如 2330" />
        </label>
        <label className={smallLabel}>市場
          <select className="field mt-1" aria-label="交易市場" value={market} onChange={event => setMarket(event.target.value as Market)}>
            <option value="TWSE">上市</option><option value="TPEx">上櫃</option>
          </select>
        </label>
        <button type="button" onClick={submit}
          className="pp-primary-button col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1f332a] px-4 text-sm font-semibold text-white dark:bg-[#dce9e2] dark:text-[#122018] sm:col-span-1 sm:self-end">
          <RefreshCw size={16} />分析
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={smallLabel}>交易策略
          <select className="field mt-1" aria-label="量化策略" value={config.strategy}
            onChange={event => setConfig(current => ({ ...current, strategy: event.target.value as QuantConfig["strategy"] }))}>
            <option value="sma">均線交叉</option><option value="rsi">RSI 門檻</option><option value="breakout">通道突破</option>
          </select>
        </label>
        <label className={smallLabel}>模擬本金 · TWD
          <input className="field mt-1" aria-label="模擬本金" type="number" min={1000} step={1000} value={config.capital}
            onChange={event => setConfig(current => ({ ...current, capital: Number(event.target.value) }))} />
        </label>
      </div>
      {history && index ? <p className="text-xs text-black/55 dark:text-white/55" data-testid="pilotquant-source">
        <strong>{history.symbol} · {history.name}</strong>　收盤 {formatMoney(history.points.at(-1)?.[1])} · {history.endDate}
      </p> : null}
      {!current ? <p role="status" className="text-xs text-black/55 dark:text-white/55">讀取 {requestKey} 官方收盤資料中…</p> : null}
      {current?.error ? <p role="alert" className={warning}>{current.error}。請檢查標的及資料來源。</p> : null}
      {history && staleDays > 7 ? <p className={warning}>歷史資料距今約 {staleDays} 天；可能因休市、停牌或資料更新延遲，請勿作為即時交易訊號。</p> : null}
      {calculation.error ? <p role="alert" className={warning}>{calculation.error}</p> : null}
      <details className="rounded-xl border border-black/8 px-3 py-2.5 text-xs dark:border-white/10" data-testid="pilotquant-advanced">
        <summary className="flex min-h-7 cursor-pointer items-center justify-between font-semibold">
          <span>進階參數 <span className="font-normal text-black/45 dark:text-white/45">· 比例、手續費及策略設定</span></span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["allocationPct", "投入比例 %"], ["fast", "短均線／日"], ["slow", "長均線／日"], ["rsiPeriod", "RSI 週期"],
            ["rsiBuyBelow", "RSI 買入小於"], ["rsiSellAbove", "RSI 賣出大於"], ["breakoutPeriod", "通道週期"],
            ["feeBps", "單邊手續費 bps"], ["sellTaxBps", "賣出稅 bps"], ["slippageBps", "單邊滑價 bps"],
            ["minimumFeeTwd", "最低手續費"]
          ] as Array<[keyof QuantConfig, string]>).map(([key, label]) =>
            <label className={smallLabel} key={key}>{label}
              <input className="field mt-1" type="number" min={0} step={key === "feeBps" ? .25 : 1}
                value={config[key]} onChange={event => setConfig(current => ({ ...current, [key]: Number(event.target.value) }))} />
            </label>
          )}
        </div>
        <p className="mt-3 leading-5 text-black/50 dark:text-white/50">修改策略或本金後會即時重新模擬；只有變更股票代號需要按「分析」。</p>
      </details>
    </CardContent></Card>

    {calculation.report ? <>
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-black/8 bg-black/[.025] p-1 dark:border-white/10 dark:bg-white/[.025]"
        role="tablist" aria-label="量化研究內容" data-testid="pilotquant-tabs">
        {([
          ["results", "回測摘要"], ["future", "未來情境"], ["trades", "交易明細"]
        ] as Array<[QuantView, string]>).map(([tab, label]) =>
          <button key={tab} type="button" role="tab" aria-selected={view === tab} onClick={() => {
            setView(tab);
            window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
          }}
            className={"min-h-10 rounded-lg px-1 text-xs font-semibold transition sm:text-sm " +
              (view === tab ? "bg-[#1f332a] text-white dark:bg-[#dce9e2] dark:text-[#122018]" : "text-black/55 dark:text-white/55")}>
            {label}
          </button>
        )}
      </div>

      {view === "results" ? <Card><CardContent className="space-y-3 p-3 md:p-5" role="tabpanel" aria-label="回測摘要">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">樣本外回測 <span className="text-xs font-normal text-black/45 dark:text-white/45">後 30% · 未參與策略設定</span></h3>
          <span className="text-[11px] text-black/45 dark:text-white/45">{calculation.report.outOfSample.firstDate}～{calculation.report.outOfSample.lastDate}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="pilotquant-summary">
          <Metric label="策略報酬（扣成本）" value={formatPercent(calculation.report.outOfSample.totalReturnPct)} />
          <Metric label="買進持有（扣成本）" value={formatPercent(calculation.report.outOfSample.buyHoldReturnPct)} />
          <Metric label="最大回撤" value={formatPercent(calculation.report.outOfSample.maxDrawdownPct)} />
          <Metric label="完整交易" value={String(calculation.report.outOfSample.completedTrades) + " 筆"} />
        </div>
        <div className="h-[205px]" role="img" aria-label="樣本外策略與買進持有模擬資產淨值比較">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={calculation.report.outOfSample.equity}>
              <CartesianGrid strokeOpacity={0.09} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={30} tickFormatter={value => String(value).slice(5)} />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip labelFormatter={value => String(value)} formatter={(value, name) => [formatMoney(Number(value)), String(name)]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="equity" name="策略淨值" stroke="#2fb98a" strokeWidth={2.3} dot={false} />
              <Line type="monotone" dataKey="buyHold" name="買進持有" stroke="#c39a55" strokeDasharray="5 3" strokeWidth={1.7} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] leading-5 text-black/50 dark:text-white/50">綠線：模擬策略；金線：買進持有。優先顯示樣本外表現，避免全期間績效掩蓋近期策略失效。</p>
        <details className="rounded-xl border border-black/8 p-3 dark:border-white/10" data-testid="pilotquant-full-report">
          <summary className="cursor-pointer text-xs font-semibold">展開完整回測、樣本內及市場比較</summary>
          <div className="mt-3 space-y-3">
            <SectionSummary heading="全期間" report={calculation.report.total} />
            <SectionSummary heading="前 70% · 樣本內" report={calculation.report.inSample} />
            <SectionSummary heading="後 30% · 樣本外" report={calculation.report.outOfSample} />
            <div className="rounded-xl border border-black/8 p-3 dark:border-white/10">
              <h4 className="text-sm font-semibold">同期間台股加權價格指數比較</h4>
              {benchmarkComparison ? <div className="mt-3 grid grid-cols-3 gap-2">
                <Metric label="個股價格報酬" value={formatPercent(benchmarkComparison.stockReturn)} />
                <Metric label="加權價格指數" value={formatPercent(benchmarkComparison.benchmarkReturn)} />
                <Metric label="相對價格表現" value={formatPercent(benchmarkComparison.relative)} />
              </div> : <p className="mt-2 text-xs text-black/50 dark:text-white/50">沒有完全相同日期的市場資料，不進行不同期間的比較。</p>}
              <p className="mt-2 text-xs text-black/50 dark:text-white/50">指數對比僅為價格報酬，不含股利或成本，不能稱為 Alpha。</p>
            </div>
          </div>
        </details>
      </CardContent></Card> : null}

      {view === "future" ? <Card><CardContent className="space-y-3 p-3 md:p-5" role="tabpanel" aria-label="未來情境">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="text-base font-semibold">未來價格情境</h3><p className="text-xs text-black/45 dark:text-white/45">歷史抽樣 · 不等於預測目標價</p></div>
          <div className="flex gap-1" role="group" aria-label="未來情境期間">
            {tradingHorizons.map(period => <button key={period} type="button" aria-pressed={horizon === period} onClick={() => setHorizon(period)}
              className={"min-h-9 rounded-full border px-2.5 text-xs font-semibold " + (horizon === period ? "border-[#315f49] bg-[#e7f1e9] text-[#245238] dark:bg-[#173426] dark:text-[#a9d7b7]" : "border-black/10 dark:border-white/10")}>
              {period === 21 ? "1月" : period === 63 ? "3月" : period === 126 ? "6月" : "1年"}
            </button>)}
          </div>
        </div>
        {calculation.projectionError ? <p role="alert" className={warning}>{calculation.projectionError}</p> : null}
        {calculation.scenario ? <ScenarioChart scenario={calculation.scenario} horizon={horizon} /> : null}
        <p className={warning}>P10／P50／P90 是歷史重抽樣的模擬分位數，不是可信度保證、投資目標價或停損區間；實際股價可能完全超出圖中範圍。</p>
      </CardContent></Card> : null}

      {view === "trades" ? <Card><CardContent className="space-y-3 p-3 md:p-5" role="tabpanel" aria-label="交易明細">
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">模擬成交紀錄</h3><Badge>{calculation.report.total.trades.length} 筆委託</Badge></div>
        <p className="text-xs text-black/50 dark:text-white/50">完成交易 {calculation.report.total.completedTrades} 次 · 勝率 {formatPercent(calculation.report.total.winRatePct)} · 未平倉 {calculation.report.total.openShares} 股</p>
        <div className="max-h-[55dvh] space-y-2 overflow-y-auto">
          {calculation.report.total.trades.map((trade, index) =>
            <div key={trade.date + ":" + index} className="rounded-xl border border-black/8 bg-black/[.015] p-3 text-xs dark:border-white/8 dark:bg-white/[.025]">
              <div className="flex items-center justify-between gap-2"><strong>{trade.action} · {trade.shares} 股</strong><span>{trade.date}</span></div>
              <p className="mt-1 text-black/50 dark:text-white/50">模擬成交價 {formatMoney(trade.price)} · 訊號日 {trade.signalDate} · 費用 {formatMoney(trade.fees + trade.tax)}</p>
            </div>
          )}
          {!calculation.report.total.trades.length ? <p className="py-7 text-center text-xs text-black/50 dark:text-white/50">此期間沒有觸發交易；不代表模型沒有風險。</p> : null}
        </div>
      </CardContent></Card> : null}
    </> : null}

    <details className="rounded-xl border border-black/8 p-3 text-xs dark:border-white/10" data-testid="pilotquant-methodology">
      <summary className="flex min-h-7 cursor-pointer items-center justify-between font-semibold">
        <span>資料來源、風險與進階工具</span><ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="mt-3 space-y-2 leading-5 text-black/55 dark:text-white/55">
        {history && index ? <p>{history.market} 官方收盤資料 · {history.startDate}～{history.endDate} · 快取 {index.generatedAt.slice(0, 10)}</p> : null}
        <p>第 t 日收盤訊號僅在下一交易日收盤模擬成交，含可調整交易費與 T+2 資金限制；沒有盤中止損或真實下單。</p>
        <p>資料未還原除權息；固定 70/30 檢查不是多折 Walk-forward，不能把歷史績效當成未來獲利能力。</p>
        <a href={advancedUrl} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-black/10 px-3 font-semibold dark:border-white/10">
          開啟進階工作台 · 多標的／CSV <ArrowUpRight size={14} />
        </a>
      </div>
    </details>
  </div>;
}
