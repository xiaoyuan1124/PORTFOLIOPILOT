"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, ChartNoAxesCombined, RefreshCw } from "lucide-react";
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

  return <div className="space-y-4">
    <div className="rounded-[24px] bg-[#1f332a] p-5 text-white dark:bg-[#dce9e2] dark:text-[#122018]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[.14em] opacity-65">PilotQuant · Native research</p><h2 className="mt-1 text-xl font-semibold">個股歷史回測 × 成長情境路徑</h2><p className="mt-2 text-xs leading-5 opacity-80">以 TWSE／TPEx 官方收盤資料驗證策略，依過往報酬分布推演不同可能路徑。不上傳持股、不連券商。</p></div>
        <Badge>研究模擬</Badge>
      </div>
    </div>

    <Card><CardContent className="space-y-4 p-4 md:p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
        <label className={smallLabel}>市場
          <select className="field mt-1" value={market} onChange={event => setMarket(event.target.value as Market)}><option value="TWSE">上市</option><option value="TPEx">上櫃</option></select>
        </label>
        <label className={smallLabel}>股票或 ETF 代號
          <input className="field mt-1" value={symbol} onChange={event => setSymbol(event.target.value.toUpperCase())} maxLength={8} inputMode="text" placeholder="例如 2330" />
        </label>
        <div className="col-span-2 flex items-end sm:col-span-1"><button type="button" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1f332a] px-4 text-sm font-semibold text-white dark:bg-[#dce9e2] dark:text-[#122018]" onClick={submit}><RefreshCw size={16} />分析</button></div>
      </div>
      {!current ? <p role="status" className="text-xs text-black/55 dark:text-white/55">正在讀取 {requestKey} 官方收盤資料…</p> : null}
      {current?.error ? <p role="alert" className={warning}>{current.error}。可稍後重新讀取或查核 GitHub Actions 歷史資料更新紀錄。</p> : null}
      {history && index ? <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-black/50 dark:text-white/50">
        <span>{history.symbol} · {history.name} · {history.market}</span>
        <span>資料：{history.startDate} ～ {history.endDate}</span>
        <span>最新收盤：{formatMoney(history.points.at(-1)?.[1])} TWD</span>
        <span>來源：{request.market === "TWSE" ? "TWSE MI_INDEX" : "TPEx daily close"}</span>
        <span>快取生成：{index.generatedAt.slice(0, 10)}</span>
      </div> : null}
      {history && staleDays > 7 ? <p className={warning}>最新資料距今約 {staleDays} 天；可能是假期、停止交易或快取未更新。此結果不宜作為當日買賣依據。</p> : null}
      {calculation.error ? <p role="alert" className={warning}>{calculation.error}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className={smallLabel}>量化策略
          <select className="field mt-1" value={config.strategy} onChange={event => setConfig(current => ({ ...current, strategy: event.target.value as QuantConfig["strategy"] }))}>
            <option value="sma">雙均線交叉</option><option value="rsi">RSI 門檻策略</option><option value="breakout">收盤價突破通道</option>
          </select>
        </label>
        <label className={smallLabel}>本金 (TWD)
          <input className="field mt-1" type="number" min={1000} step={1000} value={config.capital} onChange={event => setConfig(current => ({ ...current, capital: Number(event.target.value) }))} />
        </label>
        <label className={smallLabel}>投入比例 (%)
          <input className="field mt-1" type="number" min={1} max={100} value={config.allocationPct} onChange={event => setConfig(current => ({ ...current, allocationPct: Number(event.target.value) }))} />
        </label>
      </div>
      <details className="rounded-xl border border-black/8 p-3 text-xs dark:border-white/10">
        <summary className="cursor-pointer font-semibold">策略參數與費用假設</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ["fast", "短均線／日"], ["slow", "長均線／日"], ["rsiPeriod", "RSI 週期"], ["rsiBuyBelow", "RSI 買入小於"],
            ["rsiSellAbove", "RSI 賣出大於"], ["breakoutPeriod", "通道週期"], ["feeBps", "單邊手續費 bps"], ["sellTaxBps", "賣出稅 bps"],
            ["slippageBps", "單邊滑價 bps"], ["minimumFeeTwd", "最低單筆手續費"]
          ] as Array<[keyof QuantConfig, string]>).map(([key, label]) => (
            <label className={smallLabel} key={key}>{label}
              <input className="field mt-1" type="number" min={0} step={key === "feeBps" ? .25 : 1}
                value={config[key]} onChange={event => setConfig(current => ({ ...current, [key]: Number(event.target.value) }))} />
            </label>
          ))}
        </div>
      </details>
      <p className="text-[11px] leading-5 text-black/45 dark:text-white/45">交易規則：在第 t 日收盤產生訊號，僅於第 t+1 個交易日「收盤價」模擬成交，並扣除可設定手續費、滑價及賣出稅。沒有 OHLC 不使用盤中停損／停利。整股數為整數，不借券、不槓桿，賣出款以 T+2 交易日才可再投入的保守假設模擬，不發送實際委託。</p>
    </CardContent></Card>

    {calculation.report ? <>
      <Card><CardContent className="space-y-4 p-4 md:p-5">
        <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-black/45 dark:text-white/45">Historical validation</p><h3 className="mt-1 text-lg font-semibold">過往策略回測</h3></div>
        <SectionSummary heading="全期間" report={calculation.report.total} />
        <div className="grid gap-3 lg:grid-cols-2">
          <SectionSummary heading="前 70% · 樣本內" report={calculation.report.inSample} />
          <SectionSummary heading="後 30% · 時間保留樣本" report={calculation.report.outOfSample} />
        </div>
        <p className="text-xs leading-5 text-black/50 dark:text-white/50">分界：{calculation.report.splitDate}。兩段分別以相同本金重算，前段只提供指標暖機、不帶入持倉。這是固定參數的時間保留檢查，不是多折 Walk-forward；並且使用未還原權息股價，可能低估總報酬及受到除權息影響。</p>
        <div className="rounded-xl border border-black/8 p-3 dark:border-white/10">
          <h4 className="text-sm font-semibold">相同日期的市場價格比較（樣本外）</h4>
          {benchmarkComparison ? <div className="mt-3 grid grid-cols-3 gap-2">
            <Metric label="個股原始價格報酬" value={formatPercent(benchmarkComparison.stockReturn)} />
            <Metric label="台股加權價格指數" value={formatPercent(benchmarkComparison.benchmarkReturn)} />
            <Metric label="相對價格表現" value={formatPercent(benchmarkComparison.relative)} />
          </div> : <p className="mt-2 text-xs text-black/50 dark:text-white/50">官方加權價格指數資料不足或日期不一致，不以其他期間推補市場報酬。</p>}
          <p className="mt-2 text-[11px] leading-5 text-black/45 dark:text-white/45">對比僅使用同期間價格變化，不含股利、買賣成本，也不將相對表現稱為 Alpha。與上方「扣除成本的策略績效」屬不同口徑。</p>
        </div>
        <div className="h-[240px]" role="img" aria-label="樣本外策略資產曲線與扣除成本買進持有比較">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={calculation.report.outOfSample.equity}>
              <CartesianGrid strokeOpacity={0.09} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={32} tickFormatter={value => String(value).slice(5)} />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip labelFormatter={value => String(value)} formatter={(value, name) => [formatMoney(Number(value)), String(name)]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="equity" name="策略淨值" stroke="#315f49" strokeWidth={2.1} dot={false} />
              <Line type="monotone" dataKey="buyHold" name="扣成本買進持有" stroke="#c39a55" strokeWidth={1.8} strokeDasharray="5 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <details className="rounded-xl border border-black/8 p-3 dark:border-white/10">
          <summary className="cursor-pointer text-sm font-semibold">逐筆模擬委託（{calculation.report.total.trades.length} 筆）</summary>
          <div className="mt-2 max-h-[310px] space-y-2 overflow-y-auto text-xs">
            {calculation.report.total.trades.map((trade, index) =>
              <div key={trade.date + ":" + index} className="rounded-lg bg-black/[.025] p-2 dark:bg-white/[.04]">{trade.action} {trade.shares} 股 · 模擬價格 {formatMoney(trade.price)} · {trade.signalDate} 訊號 → {trade.date} 成交 · 費用 {formatMoney(trade.fees + trade.tax)}</div>
            )}
            {!calculation.report.total.trades.length ? <p>沒有符合條件的完整交易；勝率不可推論。</p> : null}
          </div>
        </details>
      </CardContent></Card>
      <Card><CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[.14em] text-black/45 dark:text-white/45"><ChartNoAxesCombined size={14} /> Scenario path</p><h3 className="mt-1 text-lg font-semibold">未來價格成長情境</h3></div>
          <div className="flex flex-wrap gap-1.5">{tradingHorizons.map(period => <button key={period} type="button" aria-pressed={horizon === period} onClick={() => setHorizon(period)} className={"min-h-9 rounded-full border px-3 text-xs font-semibold " + (horizon === period ? "border-[#315f49] bg-[#e7f1e9] text-[#245238] dark:bg-[#173426] dark:text-[#a9d7b7]" : "border-black/10 dark:border-white/10")}>{period === 21 ? "1月" : period === 63 ? "3月" : period === 126 ? "6月" : "1年"}</button>)}</div>
        </div>
        {calculation.projectionError ? <p role="alert" className={warning}>{calculation.projectionError}</p> : null}
        {calculation.scenario ? <ScenarioChart scenario={calculation.scenario} horizon={horizon} /> : null}
        <p className={warning}>重要：這些是由歷史價格變化所建立的機率情境，沒有納入未來營收、訂單、估值變化、法規、景氣或突發事件。股價可能落在全部模擬路徑之外，不能把 P90 當成「樂觀目標價」或將 P10 當成停損底線。</p>
      </CardContent></Card>
    </> : null}

    <Card><CardContent className="space-y-2 p-4">
      <h3 className="text-sm font-semibold">延伸：完整 PilotQuant 工作台</h3>
      <p className="text-xs leading-5 text-black/50 dark:text-white/50">進階 CSV 匯入、多標的比較及獨立策略回測保留在 PilotQuant v0.2 工作台；個股原生分析已經整合在此頁。</p>
      <a href={advancedUrl} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-black/10 px-3 text-xs font-semibold dark:border-white/10">開啟完整量化工作台 <ArrowUpRight size={14} /></a>
    </CardContent></Card>
  </div>;
}
