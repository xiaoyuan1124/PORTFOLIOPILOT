"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, RefreshCw } from "lucide-react";
import { loadBundledTwQuotes, type TwQuoteCache } from "@/lib/market-data";
import { taiwanMarketStatus } from "@/lib/market-session";
import { Badge, Card, CardContent, GhostButton } from "./ui";

function toneForPhase(phase: ReturnType<typeof taiwanMarketStatus>["phase"]) {
  if (phase === "closed") return "good" as const;
  if (phase === "post_close_refresh") return "warn" as const;
  return "neutral" as const;
}

export function MarketStatusCenter() {
  const [cache, setCache] = useState<TwQuoteCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setCache(await loadBundledTwQuotes());
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
    void loadBundledTwQuotes()
      .then((value) => {
        if (!active) return;
        setCache(value);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setCache(null);
        setError(cause instanceof Error ? cause.message : "無法載入官方台股收盤資料。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const timer = window.setInterval(() => {
      if (active) setNow(new Date());
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const status = useMemo(() => taiwanMarketStatus(cache, now), [cache, now]);

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
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-black/45 dark:text-white/45">
                {error || status.helper}
              </p>
            </div>
          </div>

          <GhostButton
            className="min-h-9 rounded-full px-3 text-xs"
            disabled={loading}
            onClick={() => void reload()}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {loading ? "讀取中" : "重讀資料"}
          </GhostButton>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="mini-metric">
            <span>TWSE</span>
            <strong>{status.twseDate ?? "—"}</strong>
          </div>
          <div className="mini-metric">
            <span>TPEx</span>
            <strong>{status.tpexDate ?? "—"}</strong>
          </div>
          <div className="mini-metric">
            <span>自動更新</span>
            <strong>收盤後多次重試</strong>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-5 text-black/35 dark:text-white/35">
          PortfolioPilot 使用官方收盤資料，不把最近收盤價標成盤中即時價。平日收盤後會從 13:40 起多次檢查 TWSE／TPEx 是否已發布當日完整資料。
        </p>
      </CardContent>
    </Card>
  );
}
