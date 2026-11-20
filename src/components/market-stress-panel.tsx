"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, ExternalLink, RefreshCw } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { benchmarkById, loadBundledBenchmarks, type BenchmarkCache } from "@/lib/benchmark";
import { loadBundledTwQuotes, type TwQuoteCache } from "@/lib/market-data";
import { calculateMarketStress, marketStressDateMismatch, marketStressLabel } from "@/lib/market-stress";
import { NATIVE_RESUME_EVENT } from "./native-runtime-bridge";
import { Badge, Card, CardContent, GhostButton } from "./ui";

type Props = { compact?: boolean; onOpen?: () => void };
const SOURCE_URL = "https://www.twse.com.tw/zh/indices/taiex/mfi94u.html";
const REFERENCE_URL = "https://toalpha.tw/market/fear";

function levelTone(score: number) {
  return score >= 75 ? "warn" as const : "neutral" as const;
}

export function MarketStressPanel({ compact = false, onOpen }: Props) {
  const [benchmark, setBenchmark] = useState<BenchmarkCache | null>(null);
  const [quotes, setQuotes] = useState<TwQuoteCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const [nextBenchmark, nextQuotes] = await Promise.all([
          loadBundledBenchmarks(),
          loadBundledTwQuotes().catch(() => null)
        ]);
        if (!active) return;
        setBenchmark(nextBenchmark);
        setQuotes(nextQuotes);
        setError("");
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "市場歷史資料暫時無法取得");
      } finally {
        if (active) setLoading(false);
      }
    }
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    void refresh();
    const timer = window.setInterval(onVisible, 15 * 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(NATIVE_RESUME_EVENT, onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(NATIVE_RESUME_EVENT, onVisible);
    };
  }, [refreshToken]);

  const rows = useMemo(() => {
    const series = benchmark ? benchmarkById(benchmark, "TWSE:TAIEX-PRICE") : null;
    return series ? calculateMarketStress(series.points) : [];
  }, [benchmark]);
  const latest = rows.at(-1) ?? null;
  const previous = rows.at(-2) ?? null;
  const quoteDate = quotes?.quotes.map((quote) => quote.date).sort().at(-1) ?? null;
  const olderThanQuotes = latest ? marketStressDateMismatch(latest.date, quoteDate) : false;
  const changed = latest && previous ? latest.score - previous.score : null;
  const chartRows = useMemo(() =>
    rows.slice(-252).map((row) => ({ ...row, time: Date.parse(row.date + "T00:00:00Z") })),
    [rows]
  );

  return (
    <Card data-ux-role={compact ? "home-market-stress" : "research-market-stress"}>
      <CardContent className="space-y-3 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#edf2ee] text-[#335b46] dark:bg-[#17201b] dark:text-[#a8dab8]">
              <Activity size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold">市場壓力 · 台股</h2>
              <p className="mt-0.5 text-xs text-black/45 dark:text-white/45">官方大盤收盤數據 · 獨立計算</p>
            </div>
          </div>
          {latest ? <Badge tone={levelTone(latest.score)}>{marketStressLabel(latest.score)}</Badge> : null}
        </div>

        {latest ? (
          <div className="flex flex-wrap items-end gap-3">
            <strong className={`${compact ? "text-2xl" : "text-4xl"} font-semibold tabular-nums`}>{latest.score}<span className="ml-1 text-sm font-normal text-black/40 dark:text-white/40">/ 100</span></strong>
            <p className="pb-1 text-xs text-black/55 dark:text-white/55">
              {changed === null ? "等待比較資料" : changed === 0 ? "較前交易日持平" : "較前交易日 " + (changed > 0 ? "+" : "") + changed + " 點"}
              <span className="ml-2">指標日 {latest.date}</span>
            </p>
          </div>
        ) : (
          <p className="text-sm text-black/50 dark:text-white/50">
            {loading ? "正在載入官方大盤歷史…" : error || "指數歷史樣本不足，暫不產生市場壓力分數。"}
          </p>
        )}

        {olderThanQuotes ? (
          <p className="text-xs leading-5 text-amber-700 dark:text-amber-300" role="status">
            大盤指數僅更新至 {latest?.date}，個股收盤已有 {quoteDate}。兩者日期不同，分數不代表最新交易日。
          </p>
        ) : null}
        {quotes?.offlineFallback ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">目前可能使用離線快取，請核對指標日期。</p>
        ) : null}
        {error && latest ? <p className="text-xs text-amber-700 dark:text-amber-300">暫時無法取得新版資料：{error}</p> : null}

        {compact ? (
          <>
            <p className="text-[11px] text-black/45 dark:text-white/45">3 因子歷史壓力；非買賣訊號 · 資料日 {latest?.date??"—"}</p>
            {onOpen ? <GhostButton className="min-h-11 w-full justify-center" onClick={onOpen}>完整市場風險分析 <ArrowRight size={15} /></GhostButton> : null}
          </>
        ) : (
          <>
            {latest ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {latest.factors.map((factor) => (
                    <div className="mini-metric" key={factor.key}>
                      <span>{factor.label}</span>
                      <strong>{factor.value.toFixed(1)}%</strong>
                      <span>歷史壓力百分位 {factor.percentile}</span>
                    </div>
                  ))}
                </div>
                <div className="h-52 w-full" aria-label="最近約一年市場壓力走勢圖">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartRows} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                      <XAxis type="number" scale="time" dataKey="time" domain={["dataMin", "dataMax"]} tickFormatter={(value) => new Date(Number(value)).toISOString().slice(5, 10)} tick={{ fontSize: 10 }} minTickGap={28} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip labelFormatter={(value) => new Date(Number(value)).toISOString().slice(0, 10)} formatter={(value) => [Number(value).toFixed(0) + " / 100", "市場壓力"]} />
                      <Line type="monotone" dataKey="score" stroke="#456b58" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-black/45 dark:text-white/45">
                  走勢採實際日期軸；週末及休市沒有數據、不補造交易日。基準為已有的 {rows.length} 筆可計算交易日，非保證五年完整。
                </p>
              </>
            ) : null}
            <details className="rounded-xl border border-black/8 p-3 text-xs leading-5 dark:border-white/10">
              <summary className="min-h-7 cursor-pointer font-semibold">計算與資料限制</summary>
              <div className="mt-2 space-y-2 text-black/55 dark:text-white/55">
                <p>本功能參考市場恐慌分析的研究方式，自行以 TWSE 加權價格指數計算，並非直接複製 ToAlpha 原始指數。</p>
                <p>近 20 日對數報酬標準差 × √252 為年化波動；距近 252 交易日最高收盤的跌幅；近 20 交易日負報酬。三項各以可用歷史樣本計算百分位並等權平均，最高 100。</p>
                <p>歷史樣本少於 332 個交易日不顯示分數。未包含跌停家數、融資維持率、台指 VIX 或美股／費半，不能與 ToAlpha 分數等同比較，也不能據此推算未來勝率。</p>
              </div>
            </details>
            <div className="flex flex-wrap gap-4 text-xs text-black/45 dark:text-white/45">
              <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">TWSE 原始指數 <ExternalLink size={13} /></a>
              <a href={REFERENCE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">ToAlpha 完整恐慌度（外部參考） <ExternalLink size={13} /></a>
              <GhostButton onClick={() => { setLoading(true); setRefreshToken((value) => value + 1); }} className="min-h-8 px-2 text-xs"><RefreshCw size={13} />重新讀取</GhostButton>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
