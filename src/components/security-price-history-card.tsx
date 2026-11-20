"use client";

import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Area, AreaChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { benchmarkById, benchmarkWindow, loadBundledBenchmarks, type BenchmarkCache } from "@/lib/benchmark";
import { loadTwPriceHistory, type TwPriceHistorySeries } from "@/lib/price-history-data";
import { priceHistoryMetrics, relativePerformancePct } from "@/lib/price-history";
import { calculateCloseTechnicals } from "@/lib/technical-indicators";
import { Card, CardContent, InfoDisclosure } from "./ui";
import { useResumeRefreshKey } from "./use-resume-refresh-key";

function signedPct(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function SecurityPriceHistoryCard({
  market,
  symbol
}: {
  market: "TWSE" | "TPEx";
  symbol: string;
}) {
  const requestKey = `${market}:${symbol.trim().toUpperCase()}`;
  const [loadState, setLoadState] = useState<{
    key: string;
    history: TwPriceHistorySeries | null;
    error: string;
  }>({ key: "", history: null, error: "" });
  const [benchmarkCache, setBenchmarkCache] = useState<BenchmarkCache | null>(null);
  const resumeRefreshKey = useResumeRefreshKey();

  useEffect(() => {
    let active = true;
    void loadTwPriceHistory(market, symbol)
      .then((value) => {
        if (!active) return;
        setLoadState({ key: requestKey, history: value, error: "" });
      })
      .catch((cause) => {
        if (!active) return;
        setLoadState({
          key: requestKey,
          history: null,
          error: cause instanceof Error ? cause.message : "歷史行情暫時不可用。"
        });
      });
    return () => { active = false; };
  }, [market, requestKey, resumeRefreshKey, symbol]);

  useEffect(() => {
    let active = true;
    void loadBundledBenchmarks()
      .then((cache) => {
        if (active) setBenchmarkCache(cache);
      })
      .catch(() => {
        if (active) setBenchmarkCache(null);
      });
    return () => { active = false; };
  }, [resumeRefreshKey]);

  const current = loadState.key === requestKey ? loadState : null;
  const history = current?.history ?? null;
  const loading = !current;
  const error = current?.error ?? "";
  const metrics = useMemo(
    () => history ? priceHistoryMetrics(history.points) : null,
    [history]
  );

  const technical = useMemo(() => history ? calculateCloseTechnicals(history.points) : null,[history]);
  const chartRows = useMemo(() => technical ? technical.rows.map((row)=>({
    date: row.date, close: row.close, ma20: row.ma[20], ma60: row.ma[60]
  })) : [],[technical]);
  const priceBenchmark = benchmarkCache ? benchmarkById(benchmarkCache, "TWSE:TAIEX-PRICE") : null;

  function relativeFor(period: { startDate: string; endDate: string; returnPct: number } | null | undefined) {
    if (!period || !priceBenchmark) return null;
    const comparison = benchmarkWindow(priceBenchmark, period.startDate, period.endDate);
    if (comparison.status !== "available" || comparison.returnPct === null) return null;
    return relativePerformancePct(period.returnPct, comparison.returnPct);
  }

  const relative = metrics ? {
    oneMonth: relativeFor(metrics.oneMonth),
    threeMonth: relativeFor(metrics.threeMonth),
    sixMonth: relativeFor(metrics.sixMonth),
    oneYear: relativeFor(metrics.oneYear)
  } : null;

  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-semibold">官方歷史價格</h4>
            <p className="mt-1 text-xs text-black/40 dark:text-white/40">1M / 3M / 6M / 1Y 價格報酬、回撤與波動度</p>
          </div>
          {metrics ? <span className="text-[11px] text-black/35 dark:text-white/35">{metrics.latestDate}</span> : null}
        </div>

        {metrics ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="mini-metric"><span>1M</span><strong>{signedPct(metrics.oneMonth?.returnPct)}</strong><small className="mt-1 block font-normal text-black/38 dark:text-white/38">相對加權 {signedPct(relative?.oneMonth)}</small></div>
              <div className="mini-metric"><span>3M</span><strong>{signedPct(metrics.threeMonth?.returnPct)}</strong><small className="mt-1 block font-normal text-black/38 dark:text-white/38">相對加權 {signedPct(relative?.threeMonth)}</small></div>
              <div className="mini-metric"><span>6M</span><strong>{signedPct(metrics.sixMonth?.returnPct)}</strong><small className="mt-1 block font-normal text-black/38 dark:text-white/38">相對加權 {signedPct(relative?.sixMonth)}</small></div>
              <div className="mini-metric"><span>1Y</span><strong>{signedPct(metrics.oneYear?.returnPct)}</strong><small className="mt-1 block font-normal text-black/38 dark:text-white/38">相對加權 {signedPct(relative?.oneYear)}</small></div>
              <div className="mini-metric"><span>最大回撤</span><strong>{signedPct(metrics.maxDrawdownPct)}</strong></div>
              <div className="mini-metric"><span>年化波動度</span><strong>{signedPct(metrics.annualizedVolatilityPct)}</strong></div>
            </div>
            {technical ? (
              <section className="mt-3 rounded-xl border border-black/7 p-2 dark:border-white/8" aria-label="收盤價技術指標">
                <div className="grid grid-cols-3 gap-2">
                  <div className="mini-metric"><span>MA20</span><strong>{technical.latest.ma[20]?.toFixed(2) ?? "資料不足"}</strong></div>
                  <div className="mini-metric"><span>MA60</span><strong>{technical.latest.ma[60]?.toFixed(2) ?? "資料不足"}</strong></div>
                  <div className="mini-metric"><span>RSI 14</span><strong>{technical.latest.rsi14?.toFixed(1) ?? "資料不足"}</strong></div>
                </div>
                <details className="mt-2 text-xs" data-ux-role="close-price-technicals">
                  <summary className="min-h-10 cursor-pointer px-1 py-2 font-medium">其他均線、MACD 與收盤區間</summary>
                  <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {([5,10,20,60,120,240] as const).map(n=>(
                      <div key={n} className="mini-metric"><span>MA {n}</span><strong>{technical.latest.ma[n]?.toFixed(2) ?? "不足"}</strong></div>
                    ))}
                    <div className="mini-metric"><span>MACD DIF</span><strong>{technical.latest.macd?.toFixed(3) ?? "不足"}</strong></div>
                    <div className="mini-metric"><span>MACD DEA</span><strong>{technical.latest.macdSignal?.toFixed(3) ?? "不足"}</strong></div>
                    <div className="mini-metric"><span>MACD 柱</span><strong>{technical.latest.macdHistogram?.toFixed(3) ?? "不足"}</strong></div>
                    <div className="mini-metric"><span>距 MA20</span><strong>{signedPct(technical.gapFromMa20Pct)}</strong></div>
                    <div className="mini-metric"><span>60 日最高收盤</span><strong>{technical.high60Close?.toFixed(2) ?? "不足"}</strong></div>
                    <div className="mini-metric"><span>60 日最低收盤</span><strong>{technical.low60Close?.toFixed(2) ?? "不足"}</strong></div>
                  </div>
                  <p className="mt-2 leading-5 text-black/45 dark:text-white/45">
                    MA20 近 5 個交易日斜率：{technical.latest20Slope === null ? "資料不足" : technical.latest20Slope > 0 ? "上升" : technical.latest20Slope < 0 ? "下降" : "持平"}。
                    RSI 採 Wilder 14 期；MACD 為 12／26／9 EMA。均線與訊號皆使用可得的歷史收盤價，不含還原權息。
                    此快取沒有完整開高低價、成交量或分時資料，故不顯示偽造的 K 線、KD 或量比；技術指標不構成買賣保證。
                  </p>
                </details>
              </section>
            ) : null}
            <div className="mt-3 h-[190px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartRows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={32} tick={{ fontSize: 10 }} tickFormatter={(value) => String(value).slice(5)} />
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Tooltip
                    labelFormatter={(label) => String(label)}
                    formatter={(value) => [Number(value).toFixed(2), "收盤價"]}
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="close" stroke="#456b58" strokeWidth={2} fill="#456b58" fillOpacity={0.12} isAnimationActive={false} />
                  <Line type="monotone" dataKey="ma20" name="MA20" stroke="#b18749" strokeWidth={1.2} dot={false} connectNulls={false} isAnimationActive={false}/>
                  <Line type="monotone" dataKey="ma60" name="MA60" stroke="#667ab0" strokeWidth={1.2} dot={false} connectNulls={false} isAnimationActive={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[11px] text-black/45 dark:text-white/45">{metrics.firstDate} → {metrics.latestDate} · {metrics.points.length} 筆有效收盤 · 綠色收盤／琥珀 MA20／藍色 MA60</p>
            <InfoDisclosure summary="歷史價格口徑" className="mt-3">
              使用 TWSE／TPEx 官方每日收盤價。這是 raw price return，不含現金股利再投資，也沒有自行製作還原價；除權息會直接反映在價格序列，因此不可視為總報酬。「相對加權」使用同期間 TWSE TAIEX Price Index，兩邊都採價格報酬口徑；數值代表相對價格表現，不是投資評級。
            </InfoDisclosure>
          </>
        ) : (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-black/[.025] p-4 text-sm dark:bg-white/[.035]">
            <Info size={17} className="mt-0.5 shrink-0 text-black/35 dark:text-white/35" />
            <div>
              <p className="font-semibold">{loading ? "載入歷史行情中" : "歷史行情尚未可用"}</p>
              <p className="mt-1 text-xs leading-5 text-black/45 dark:text-white/45">{loading ? "正在讀取官方歷史價格分桶。" : error || "等待歷史行情快取建立。"}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
