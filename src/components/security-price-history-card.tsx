"use client";

import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { loadTwPriceHistory, type TwPriceHistorySeries } from "@/lib/price-history-data";
import { priceHistoryMetrics } from "@/lib/price-history";
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
  const [history, setHistory] = useState<TwPriceHistorySeries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void loadTwPriceHistory(market, symbol)
      .then((value) => {
        if (!active) return;
        setHistory(value);
      })
      .catch((cause) => {
        if (!active) return;
        setHistory(null);
        setError(cause instanceof Error ? cause.message : "歷史行情暫時不可用。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [market, symbol]);

  const metrics = useMemo(
    () => history ? priceHistoryMetrics(history.points) : null,
    [history]
  );

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
              <div className="mini-metric"><span>1M</span><strong>{signedPct(metrics.oneMonth?.returnPct)}</strong></div>
              <div className="mini-metric"><span>3M</span><strong>{signedPct(metrics.threeMonth?.returnPct)}</strong></div>
              <div className="mini-metric"><span>6M</span><strong>{signedPct(metrics.sixMonth?.returnPct)}</strong></div>
              <div className="mini-metric"><span>1Y</span><strong>{signedPct(metrics.oneYear?.returnPct)}</strong></div>
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
              使用 TWSE／TPEx 官方每日收盤價。這是 raw price return，不含現金股利再投資，也沒有自行製作還原價；除權息會直接反映在價格序列，因此不可視為總報酬。
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
