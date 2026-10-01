"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { AppState } from "@/lib/types";
import { buildDailyHoldingDrivers, summarizeDailyHoldingDrivers } from "@/lib/daily-drivers";
import { loadBundledTwQuotes, type TwQuoteCache } from "@/lib/market-data";
import { money } from "@/lib/utils";
import { PortfolioContributionChart } from "./portfolio-contribution-chart";
import { Badge, Card, CardContent, CardHeader, GhostButton, InfoDisclosure } from "./ui";

export function LatestPortfolioContribution({ state }: { state: AppState }) {
  const [quotes, setQuotes] = useState<TwQuoteCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setQuotes(await loadBundledTwQuotes());
    } catch (cause) {
      setQuotes(null);
      setError(cause instanceof Error ? cause.message : "無法載入官方台股收盤資料。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void loadBundledTwQuotes()
      .then((cache) => {
        if (!active) return;
        setQuotes(cache);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setQuotes(null);
        setError(cause instanceof Error ? cause.message : "無法載入官方台股收盤資料。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const drivers = useMemo(
    () => quotes ? buildDailyHoldingDrivers(state.holdings, quotes) : null,
    [quotes, state.holdings]
  );
  const summary = useMemo(
    () => summarizeDailyHoldingDrivers(drivers?.rows ?? []),
    [drivers?.rows]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Latest contribution</p>
            <h3 className="mt-1 font-semibold">最新交易日持倉貢獻</h3>
            <p className="mt-1 text-xs text-black/42 dark:text-white/42">股票與台灣 ETF 放在同一張圖，不把入出金混進投資表現。</p>
          </div>
          <GhostButton className="min-h-9 rounded-full px-3 text-xs" disabled={loading} onClick={() => void reload()}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "同步中" : "重新同步"}
          </GhostButton>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {error ? (
          <div className="flex gap-2 rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {drivers?.rows.length ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge>{drivers.latestDate}</Badge>
              <span className="text-xs text-black/40 dark:text-white/40">{drivers.matchedHoldings}/{drivers.eligibleHoldings} 檔納入</span>
            </div>
            <PortfolioContributionChart rows={drivers.rows} height={280} />
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="mini-metric"><span>推升合計</span><strong>{money(summary.positiveImpactTwd)}</strong></div>
              <div className="mini-metric"><span>拖累合計</span><strong>{money(summary.negativeImpactTwd)}</strong></div>
              <div className="mini-metric"><span>淨影響</span><strong>{money(summary.netImpactTwd)}</strong></div>
            </div>
            <InfoDisclosure summary="目前為什麼只有最新交易日" className="mt-3">
              PortfolioPilot 現在有可靠的最新官方收盤漲跌，因此能估算最新交易日各持倉貢獻；但尚未保存每檔股票與 ETF 的完整歷史價格序列，所以不會把淨值快照差額硬拆成 1M／3M 個別標的 attribution。等免費可追溯歷史行情接入後，再開期間貢獻。
            </InfoDisclosure>
          </>
        ) : !loading ? (
          <p className="py-8 text-center text-sm text-black/40 dark:text-white/40">目前沒有可比較的台股股票／ETF 最新交易日資料。</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
