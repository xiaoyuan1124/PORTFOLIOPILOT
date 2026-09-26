"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Database, RefreshCw, Search } from "lucide-react";
import type { AppState } from "@/lib/types";
import {
  evaluateThreeMonthRevenueGate,
  loadBundledRevenueHistory,
  type RevenueGateResult,
  type RevenueHistoryCache
} from "@/lib/revenue-history";
import { percent } from "@/lib/utils";
import { Badge, Card, CardContent, GhostButton } from "./ui";

export function Scanner({ state }: { state: AppState }) {
  const [cache, setCache] = useState<RevenueHistoryCache | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const heldCodes = useMemo(
    () => new Set(
      state.holdings
        .filter((holding) => holding.market === "TW" && holding.type !== "cash")
        .map((holding) => holding.symbol.toUpperCase())
    ),
    [state.holdings]
  );

  useEffect(() => {
    let active = true;
    void loadBundledRevenueHistory()
      .then((next) => {
        if (!active) return;
        setCache(next);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "無法載入三個月營收歷史。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      setCache(await loadBundledRevenueHistory());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法載入三個月營收歷史。");
    } finally {
      setLoading(false);
    }
  }

  const evaluated = useMemo(
    () => cache ? evaluateThreeMonthRevenueGate(cache) : [],
    [cache]
  );

  const passCount = evaluated.filter((item) => item.pass).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return evaluated
      .filter((item) => showAll || item.pass)
      .filter((item) => !needle || `${item.code} ${item.name} ${item.industry}`.toLowerCase().includes(needle))
      .slice(0, 100);
  }, [evaluated, query, showAll]);

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-black/6 bg-[#1f332a] p-5 text-white shadow-sm dark:border-white/8 dark:bg-[#dce9e2] dark:text-[#122018]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] opacity-55">Official Gate 1 / 4</p>
            <h3 className="mt-2 text-xl font-semibold">連續三個月營收 YoY &gt; 20%</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 opacity-70">
              這一關已改用 MOPS 歷史月營收資料。毛利率、外資 10D、投信 10D 尚未接完，因此目前顯示的是「第一關池」，不是完整策略候選。
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold">{passCount}</p>
            <p className="text-xs opacity-60">第一關通過</p>
          </div>
        </div>
        {cache?.periods.length ? (
          <p className="mt-4 text-xs opacity-55">檢查月份：{[...cache.periods].sort().reverse().slice(0, 3).join(" · ")}</p>
        ) : null}
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/35 dark:text-white/35" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋代號、名稱或產業"
            className="field pl-11"
          />
        </div>
        <GhostButton type="button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "只看通過" : "查看全部"}
        </GhostButton>
        <GhostButton type="button" disabled={loading} onClick={() => void reload()}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {loading ? "讀取中" : "重新讀取"}
        </GhostButton>
      </div>

      {error ? (
        <div className="rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        {visible.map((item: RevenueGateResult) => (
          <Card key={`${item.market}:${item.code}`}>
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{item.name}</p>
                    <span className="text-xs text-black/40 dark:text-white/40">{item.code}</span>
                    {heldCodes.has(item.code.toUpperCase()) ? <Badge tone="good">持有</Badge> : null}
                  </div>
                  <p className="mt-1 text-sm text-black/45 dark:text-white/45">{item.industry || "未分類"} · {item.market}</p>
                </div>
                {item.pass ? <Badge tone="good"><Check size={12} /> 第一關通過</Badge> : <Badge>未通過</Badge>}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {item.periods.map((period) => (
                  <div key={period.period} className="mini-metric">
                    <span>{period.period}</span>
                    <strong>{period.yoyPct === null ? "—" : percent(period.yoyPct, 1)}</strong>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e7f1e9] px-2.5 py-1 font-medium text-[#28573b] dark:bg-[#173426] dark:text-[#a8dab8]">
                  <Database size={12} />營收：官方
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-2.5 py-1 font-medium text-black/45 dark:bg-white/8 dark:text-white/45">
                  <Clock3 size={12} />毛利率：待接
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-2.5 py-1 font-medium text-black/45 dark:bg-white/8 dark:text-white/45">
                  <Clock3 size={12} />雙法人：待接
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && !error && !visible.length ? (
        <p className="py-14 text-center text-sm text-black/40 dark:text-white/40">目前沒有符合顯示條件的公司。</p>
      ) : null}
    </div>
  );
}
