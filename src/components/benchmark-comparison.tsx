"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Gauge, RefreshCw } from "lucide-react";
import type { NetWorthSnapshot } from "@/lib/types";
import {
  benchmarkById,
  benchmarkWindow,
  loadBundledBenchmarks,
  type BenchmarkCache
} from "@/lib/benchmark";
import type { ExactTwrResult } from "@/lib/performance";
import { percent } from "@/lib/utils";
import { Badge, Card, CardContent, GhostButton } from "./ui";

type Props = {
  exactTwr: ExactTwrResult;
  proxyReturn: number | null;
  snapshots: NetWorthSnapshot[];
};

export function BenchmarkComparison({ exactTwr, proxyReturn, snapshots }: Props) {
  const [cache, setCache] = useState<BenchmarkCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setCache(await loadBundledBenchmarks());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法載入官方 Benchmark。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void loadBundledBenchmarks()
      .then((next) => {
        if (!active) return;
        setCache(next);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "無法載入官方 Benchmark。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const portfolioWindow = useMemo(() => {
    if (exactTwr.status === "exact" && exactTwr.value !== null && exactTwr.startDate) {
      return {
        method: "Exact TWR",
        isExact: true,
        start: exactTwr.startDate,
        end: exactTwr.endDate,
        returnPct: exactTwr.value * 100
      };
    }

    const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const start = ordered[0]?.date;
    const end = ordered.at(-1)?.date;
    if (proxyReturn !== null && start && end && start < end) {
      return {
        method: "TWR Proxy",
        isExact: false,
        start,
        end,
        returnPct: proxyReturn * 100
      };
    }

    return null;
  }, [exactTwr, proxyReturn, snapshots]);

  const benchmark = cache ? benchmarkById(cache, "TWSE:TAIEX-TR") : null;
  const comparison = benchmark && portfolioWindow
    ? benchmarkWindow(benchmark, portfolioWindow.start, portfolioWindow.end)
    : null;

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#edf2ee] text-[#335b46] dark:bg-[#17201b] dark:text-[#a8dab8]">
              <Gauge size={18} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">官方 Benchmark 比較</h3>
                <Badge tone="good">TAIEX Total Return</Badge>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-black/50 dark:text-white/50">
                使用 TWSE 發行量加權股價報酬指數，含現金股利再投資效果。這是台股市場基準，不代表美股或混合資產一定應以它作為唯一基準。
              </p>
            </div>
          </div>
          <GhostButton disabled={loading} onClick={() => void reload()}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            {loading ? "讀取中" : "重新讀取"}
          </GhostButton>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
            {error}
          </div>
        ) : null}

        {!error && !loading && !portfolioWindow ? (
          <p className="mt-5 rounded-2xl border border-black/6 p-4 text-sm text-black/45 dark:border-white/8 dark:text-white/45">
            目前沒有可比較的 Portfolio TWR 區間。先累積 Exact TWR 邊界，或至少兩筆每日快照讓 TWR Proxy 有有效期間。
          </p>
        ) : null}

        {portfolioWindow && comparison?.status === "available" && benchmark ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="mini-metric">
                <span>Portfolio · {portfolioWindow.method}</span>
                <strong>{percent(portfolioWindow.returnPct, 2)}</strong>
                <small className="mt-1 block font-normal leading-4 text-black/40 dark:text-white/40">{portfolioWindow.start} → {portfolioWindow.end}</small>
              </div>
              <div className="mini-metric">
                <span>TAIEX Total Return</span>
                <strong>{comparison.returnPct === null ? "—" : percent(comparison.returnPct, 2)}</strong>
                <small className="mt-1 block font-normal leading-4 text-black/40 dark:text-white/40">{comparison.actualStart} → {comparison.actualEnd}</small>
              </div>
              <div className="mini-metric">
                <span>日期對齊</span>
                <strong>{comparison.calendarDatesExact ? "同日" : "交易日內縮"}</strong>
                <small className="mt-1 block font-normal leading-4 text-black/40 dark:text-white/40">不假設盤中估值時間＝指數收盤時間</small>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-black/6 p-4 text-xs leading-6 text-black/45 dark:border-white/8 dark:text-white/45">
              <p>{comparison.reason}</p>
              <p className="mt-1">目前只做並列比較，不直接宣稱 alpha／超額報酬。要計算真正可比的 excess return，還需要投資組合與 Benchmark 的估值時點一致。</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                <span>Benchmark 資料截至 {benchmark.asOf}</span>
                <span>·</span>
                <a className="inline-flex items-center gap-1 underline underline-offset-2" href={benchmark.sourceUrl} target="_blank" rel="noreferrer">
                  {benchmark.sourceName}<ExternalLink size={10} />
                </a>
              </div>
            </div>
          </>
        ) : null}

        {portfolioWindow && comparison?.status === "insufficient" ? (
          <p className="mt-5 rounded-2xl border border-[#b98b57]/20 bg-[#f5ece1] p-4 text-sm leading-6 text-[#6f4c26] dark:border-[#b98b57]/15 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
            {comparison.reason} 目標區間：{portfolioWindow.start} → {portfolioWindow.end}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
