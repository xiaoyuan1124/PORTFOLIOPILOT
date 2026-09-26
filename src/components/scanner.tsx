"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Database, RefreshCw, Search, X } from "lucide-react";
import type { AppState } from "@/lib/types";
import { loadBundledRevenueHistory, type RevenueHistoryCache } from "@/lib/revenue-history";
import { loadBundledInstitutional10d, type InstitutionalCache } from "@/lib/institutional-data";
import { evaluatePreGrossMarginStrategy } from "@/lib/strategy-gates";
import { percent } from "@/lib/utils";
import { Badge, Card, CardContent, GhostButton } from "./ui";

function Gate({ ok, pending, children }: { ok?: boolean; pending?: boolean; children: React.ReactNode }) {
  if (pending) {
    return <span className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-black/45 dark:bg-white/8 dark:text-white/45"><Clock3 size={12} />{children}</span>;
  }
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ok ? "bg-[#e7f1e9] text-[#28573b] dark:bg-[#173426] dark:text-[#a8dab8]" : "bg-[#f3e9e7] text-[#7a4037] dark:bg-[#351e1b] dark:text-[#e2a79c]"}`}>{ok ? <Check size={12} /> : <X size={12} />}{children}</span>;
}

function shares(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString("zh-TW");
}

export function Scanner({ state }: { state: AppState }) {
  const [revenue, setRevenue] = useState<RevenueHistoryCache | null>(null);
  const [institutional, setInstitutional] = useState<InstitutionalCache | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const heldCodes = useMemo(
    () => new Set(state.holdings.filter((h) => h.market === "TW" && h.type !== "cash").map((h) => h.symbol.toUpperCase())),
    [state.holdings]
  );

  async function fetchCaches() {
    const [revenueCache, institutionalCache] = await Promise.all([
      loadBundledRevenueHistory(),
      loadBundledInstitutional10d()
    ]);
    return { revenueCache, institutionalCache };
  }

  useEffect(() => {
    let active = true;
    void fetchCaches()
      .then(({ revenueCache, institutionalCache }) => {
        if (!active) return;
        setRevenue(revenueCache);
        setInstitutional(institutionalCache);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "無法載入策略資料。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const next = await fetchCaches();
      setRevenue(next.revenueCache);
      setInstitutional(next.institutionalCache);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法載入策略資料。");
    } finally {
      setLoading(false);
    }
  }

  const evaluated = useMemo(
    () => revenue && institutional ? evaluatePreGrossMarginStrategy(revenue, institutional) : [],
    [revenue, institutional]
  );
  const passCount = evaluated.filter((item) => item.threeOfficialGatesPass).length;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return evaluated
      .filter((item) => showAll || item.threeOfficialGatesPass)
      .filter((item) => !needle || `${item.code} ${item.name} ${item.industry}`.toLowerCase().includes(needle))
      .slice(0, 100);
  }, [evaluated, query, showAll]);

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-black/6 bg-[#1f332a] p-5 text-white shadow-sm dark:border-white/8 dark:bg-[#dce9e2] dark:text-[#122018]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] opacity-55">Official Gates 3 / 4</p>
            <h3 className="mt-2 text-xl font-semibold">成長＋雙法人共振</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 opacity-70">官方資料已能檢查：連續 3 個月營收 YoY &gt;20%、外資近 10 個交易日淨買超、投信近 10 個交易日淨買超。最後只剩季毛利率連續改善尚未接入。</p>
          </div>
          <div className="text-right"><p className="text-3xl font-semibold">{passCount}</p><p className="text-xs opacity-60">三關通過 · 待毛利率</p></div>
        </div>
        {institutional?.tradingDates.length ? <p className="mt-4 text-xs opacity-55">法人期間：{institutional.tradingDates.at(-1)} ～ {institutional.tradingDates[0]}</p> : null}
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/35 dark:text-white/35" size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋代號、名稱或產業" className="field pl-11" /></div>
        <GhostButton onClick={() => setShowAll((value) => !value)}>{showAll ? "只看三關通過" : "查看全部"}</GhostButton>
        <GhostButton disabled={loading} onClick={() => void reload()}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />{loading ? "讀取中" : "重新讀取"}</GhostButton>
      </div>

      {error ? <div className="rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">{error}</div> : null}

      <div className="grid gap-3 xl:grid-cols-2">
        {visible.map((item) => (
          <Card key={`${item.market}:${item.code}`}><CardContent className="p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.name}</p><span className="text-xs text-black/40 dark:text-white/40">{item.code}</span>{heldCodes.has(item.code.toUpperCase()) ? <Badge tone="good">持有</Badge> : null}</div><p className="mt-1 text-sm text-black/45 dark:text-white/45">{item.industry || "未分類"} · {item.market}</p></div>
              {item.threeOfficialGatesPass ? <Badge tone="good">3/4 通過</Badge> : <Badge>未通過</Badge>}
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {item.revenuePeriods.map((period) => <div key={period.period} className="mini-metric"><span>{period.period} YoY</span><strong>{period.yoyPct === null ? "—" : percent(period.yoyPct, 1)}</strong></div>)}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="mini-metric"><span>外資 10D 淨買超（股）</span><strong>{shares(item.foreign10d)}</strong></div>
              <div className="mini-metric"><span>投信 10D 淨買超（股）</span><strong>{shares(item.trust10d)}</strong></div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Gate ok={item.revenuePass}><Database size={12} />3月營收</Gate>
              <Gate ok={item.foreignPass}>外資 10D</Gate>
              <Gate ok={item.trustPass}>投信 10D</Gate>
              <Gate pending>毛利率待接</Gate>
            </div>
          </CardContent></Card>
        ))}
      </div>

      {!loading && !error && !visible.length ? <p className="py-14 text-center text-sm text-black/40 dark:text-white/40">目前沒有符合顯示條件的公司。</p> : null}
    </div>
  );
}
