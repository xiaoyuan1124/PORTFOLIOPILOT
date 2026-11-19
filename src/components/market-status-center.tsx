"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, RefreshCw } from "lucide-react";
import { loadBundledTwQuotes, type TwQuoteCache } from "@/lib/market-data";
import { taiwanMarketStatus } from "@/lib/market-session";
import { Badge, Card, CardContent, GhostButton } from "./ui";
import { NATIVE_RESUME_EVENT } from "./native-runtime-bridge";
import { benchmarkById, loadBundledBenchmarks } from "@/lib/benchmark";
import { loadTwPriceHistoryIndex } from "@/lib/price-history-data";

function toneForPhase(phase: ReturnType<typeof taiwanMarketStatus>["phase"]) {
  if (phase === "closed") return "good" as const;
  if (phase === "post_close_refresh") return "warn" as const;
  return "neutral" as const;
}

export function MarketStatusCenter() {
  const [cache, setCache] = useState<TwQuoteCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [benchmarkDate, setBenchmarkDate] = useState<string | null>(null);
  const [historyDate, setHistoryDate] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const [nextQuotes, nextBenchmark, nextHistory] = await Promise.all([
        loadBundledTwQuotes(),
        loadBundledBenchmarks().catch(() => null),
        loadTwPriceHistoryIndex().catch(() => null)
      ]);
      setCache(nextQuotes);
      setBenchmarkDate(nextBenchmark ? benchmarkById(nextBenchmark, "TWSE:TAIEX-PRICE")?.asOf ?? null : null);
      setHistoryDate(nextHistory?.endDate ?? null);
      setNow(new Date());
    } catch (cause) {
      setCache(null);
      setError(cause instanceof Error ? cause.message : "無法載入官方台股收盤資料。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function refreshQuietly() {
      try {
        const [next, nextBenchmark, nextHistory] = await Promise.all([
          loadBundledTwQuotes(),
          loadBundledBenchmarks().catch(() => null),
          loadTwPriceHistoryIndex().catch(() => null)
        ]);
        if (!active) return;
        setCache(next);
        setBenchmarkDate(nextBenchmark ? benchmarkById(nextBenchmark, "TWSE:TAIEX-PRICE")?.asOf ?? null : null);
        setHistoryDate(nextHistory?.endDate ?? null);
        setNow(new Date());
        setError("");
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "無法載入官方台股收盤資料。");
      } finally {
        if (active) setLoading(false);
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") void refreshQuietly();
    }

    void refreshQuietly();
    // An already-open view must refresh its dataset, not merely advance the clock.
    const timer = window.setInterval(onVisible, 15 * 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(NATIVE_RESUME_EVENT, onVisible);

    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(NATIVE_RESUME_EVENT, onVisible);
    };
  }, []);

  const status = useMemo(() => taiwanMarketStatus(cache, now), [cache, now]);
  const datesLagging = Boolean(status.latestOfficialDate && [benchmarkDate, historyDate].some((date) => date && date < status.latestOfficialDate!));

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#edf2ee] text-[#335b46] dark:bg-[#17201b] dark:text-[#a8dab8]">
              <Clock3 size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">台股資料狀態</p>
                <Badge tone={toneForPhase(status.phase)}>{status.label}</Badge>
                {datesLagging ? <Badge tone="warn">資料日期未同步</Badge> : null}
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-black/45 dark:text-white/45">
                {error || status.helper}
              </p>
            </div>
          </div>

          <GhostButton
            className="min-h-11 rounded-full px-3 text-xs"
            disabled={loading}
            onClick={() => void reload()}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "讀取中" : "重讀資料"}
          </GhostButton>
        </div>

        <details className="mt-2 rounded-lg border border-black/6 px-2 py-1.5 dark:border-white/8">
          <summary className="min-h-10 cursor-pointer px-1 py-2 text-xs font-medium text-black/55 dark:text-white/55">查看 TWSE／TPEx／大盤／個股歷史的資料日期</summary>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="mini-metric">
            <span>TWSE</span>
            <strong>{status.twseDate ?? "—"}</strong>
          </div>
          <div className="mini-metric">
            <span>TPEx</span>
            <strong>{status.tpexDate ?? "—"}</strong>
          </div>
          <div className="mini-metric">
            <span>大盤指數</span>
            <strong>{benchmarkDate ?? "—"}</strong>
          </div>
          <div className="mini-metric">
            <span>個股歷史</span>
            <strong>{historyDate ?? "—"}</strong>
          </div>
        </div>

          </div>
        </details>
      </CardContent>
    </Card>
  );
}
