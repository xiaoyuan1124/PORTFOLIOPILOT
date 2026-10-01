"use client";

import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { benchmarkById, benchmarkWindow, loadBundledBenchmarks, type BenchmarkCache } from "@/lib/benchmark";
import { loadTwPriceHistory, type TwPriceHistorySeries } from "@/lib/price-history-data";
import { priceHistoryMetrics, relativePerformancePct } from "@/lib/price-history";
import { Card, CardContent, InfoDisclosure } from "./ui";

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
  }, [market, requestKey, symbol]);

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
  }, []);

  const current = loadState.key === requestKey ? loadState : null;
  const history = current?.history ?? null;
  const loading = !current;
  const error = current?.error ?? "";
  const metrics = useMemo(
    () => history ? priceHistoryMetrics(history.points) : null,
    [history]
  );

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
            <div className="mt-4 h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.points.map(([date, close]) => ({ date, close }))} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={32} tick={{ fontSize: 10 }} tickFormatter={(value) => String(value).slice(5)} />
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Tooltip
                    labelFormatter={(label) => String(label)}
                    formatter={(value) => [Number(value).toFixed(2), "收盤價"]}
                    contentStyle={{ borderRadius: 12, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="close" stroke="#456b58" strokeWidth={2} fill="#456b58" fillOpacity={0.12} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[11px] text-black/35 dark:text-white/35">{metrics.firstDate} → {metrics.latestDate} · {metrics.points.length} 個交易日</p>
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
