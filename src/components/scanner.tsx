"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CircleHelp, Database, ExternalLink, Minus, RefreshCw, Search, X } from "lucide-react";
import type { AppState } from "@/lib/types";
import { loadBundledRevenueHistory, type RevenueHistoryCache } from "@/lib/revenue-history";
import { loadBundledInstitutional10d, type InstitutionalCache } from "@/lib/institutional-data";
import {
  loadBundledQuarterlyMargins,
  type GateStatus,
  type QuarterlyMarginCache
} from "@/lib/quarterly-financials";
import {
  evaluateOfficialStrategy,
  type SourceRef
} from "@/lib/strategy-gates";
import { percent } from "@/lib/utils";
import { Badge, Card, CardContent, GhostButton } from "./ui";

const emptyRevenueHistory: RevenueHistoryCache = { generatedAt: "", periods: [], sources: [], rows: [] };
const emptyInstitutional: InstitutionalCache = { generatedAt: "", tradingDates: [], sources: [], rows: [] };
const emptyQuarterly: QuarterlyMarginCache = { generatedAt: "", periods: [], sources: [], rows: [], notApplicable: [] };

async function optionalCache<T>(label: string, loader: () => Promise<T>, fallback: T) {
  try {
    return { value: await loader(), warning: "" };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "載入失敗";
    return { value: fallback, warning: `${label}：${detail}` };
  }
}

function statusLabel(status: GateStatus) {
  if (status === "pass") return "通過";
  if (status === "fail") return "未通過";
  if (status === "insufficient") return "資料不足";
  return "不適用";
}

function Gate({ status, children }: { status: GateStatus; children: React.ReactNode }) {
  const style = status === "pass"
    ? "bg-[#e7f1e9] text-[#28573b] dark:bg-[#173426] dark:text-[#a8dab8]"
    : status === "fail"
      ? "bg-[#f3e9e7] text-[#7a4037] dark:bg-[#351e1b] dark:text-[#e2a79c]"
      : status === "insufficient"
        ? "bg-[#f5ece1] text-[#7d5729] dark:bg-[#382817] dark:text-[#e5bd86]"
        : "bg-black/5 text-black/50 dark:bg-white/8 dark:text-white/50";
  const Icon = status === "pass" ? Check : status === "fail" ? X : status === "insufficient" ? CircleHelp : Minus;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style}`}><Icon size={12} />{children}</span>;
}

function StatusBadge({ status }: { status: GateStatus }) {
  if (status === "pass") return <Badge tone="good">通過</Badge>;
  if (status === "insufficient") return <Badge tone="warn">資料不足</Badge>;
  return <Badge>{statusLabel(status)}</Badge>;
}

function number(value: number | null, maximumFractionDigits = 0) {
  if (value === null) return "—";
  return value.toLocaleString("zh-TW", { maximumFractionDigits });
}

function SourceLinks({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return <span>官方來源：—</span>;
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      {sources.map((source, index) => (
        <a
          key={`${source.name}:${source.url}:${index}`}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline decoration-black/20 underline-offset-2 hover:decoration-current dark:decoration-white/20"
        >
          {source.name}<ExternalLink size={10} />
        </a>
      ))}
    </span>
  );
}

function GateDetail({
  title,
  status,
  reason,
  dataAsOf,
  sources,
  children
}: {
  title: string;
  status: GateStatus;
  reason: string;
  dataAsOf: string;
  sources: SourceRef[];
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-black/6 bg-black/[0.018] p-3.5 dark:border-white/8 dark:bg-white/[0.025]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <StatusBadge status={status} />
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
      <p className="mt-3 text-xs leading-5 text-black/55 dark:text-white/55">{reason}</p>
      <div className="mt-2 space-y-1 text-[11px] leading-5 text-black/40 dark:text-white/40">
        <p>資料期別：{dataAsOf}</p>
        <p><SourceLinks sources={sources} /></p>
      </div>
    </div>
  );
}

export function Scanner({ state }: { state: AppState }) {
  const [revenue, setRevenue] = useState<RevenueHistoryCache | null>(null);
  const [institutional, setInstitutional] = useState<InstitutionalCache | null>(null);
  const [quarterly, setQuarterly] = useState<QuarterlyMarginCache | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const heldCodes = useMemo(
    () => new Set(state.holdings.filter((holding) => holding.market === "TW" && holding.type !== "cash").map((holding) => holding.symbol.toUpperCase())),
    [state.holdings]
  );

  async function fetchCaches(previous?: {
    revenue: RevenueHistoryCache | null;
    institutional: InstitutionalCache | null;
    quarterly: QuarterlyMarginCache | null;
  }) {
    const [revenueResult, institutionalResult, quarterlyResult] = await Promise.all([
      optionalCache("三個月營收歷史", loadBundledRevenueHistory, previous?.revenue ?? emptyRevenueHistory),
      optionalCache("法人 10D", loadBundledInstitutional10d, previous?.institutional ?? emptyInstitutional),
      optionalCache("季度毛利率", loadBundledQuarterlyMargins, previous?.quarterly ?? emptyQuarterly)
    ]);

    return {
      revenueCache: revenueResult.value,
      institutionalCache: institutionalResult.value,
      quarterlyCache: quarterlyResult.value,
      warnings: [
        revenueResult.warning,
        institutionalResult.warning,
        quarterlyResult.warning
      ].filter(Boolean)
    };
  }

  useEffect(() => {
    let active = true;
    void fetchCaches()
      .then(({ revenueCache, institutionalCache, quarterlyCache, warnings: nextWarnings }) => {
        if (!active) return;
        setRevenue(revenueCache);
        setInstitutional(institutionalCache);
        setQuarterly(quarterlyCache);
        setWarnings(nextWarnings);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "無法載入官方策略資料。");
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
      const next = await fetchCaches({ revenue, institutional, quarterly });
      setRevenue(next.revenueCache);
      setInstitutional(next.institutionalCache);
      setQuarterly(next.quarterlyCache);
      setWarnings(next.warnings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法載入官方策略資料。");
    } finally {
      setLoading(false);
    }
  }

  const evaluated = useMemo(
    () => revenue && institutional && quarterly ? evaluateOfficialStrategy(revenue, institutional, quarterly) : [],
    [revenue, institutional, quarterly]
  );
  const counts = useMemo(() => ({
    pass: evaluated.filter((item) => item.overallStatus === "pass").length,
    fail: evaluated.filter((item) => item.overallStatus === "fail").length,
    insufficient: evaluated.filter((item) => item.overallStatus === "insufficient").length,
    notApplicable: evaluated.filter((item) => item.overallStatus === "not_applicable").length
  }), [evaluated]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return evaluated
      .filter((item) => showAll || Boolean(needle) || item.overallStatus === "pass")
      .filter((item) => !needle || `${item.code} ${item.name} ${item.industry}`.toLowerCase().includes(needle))
      .slice(0, 120);
  }, [evaluated, query, showAll]);

  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-black/6 bg-[#1f332a] p-5 text-white shadow-sm dark:border-white/8 dark:bg-[#dce9e2] dark:text-[#122018]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] opacity-55">Official Scanner · 4 / 4 Gates</p>
            <h3 className="mt-2 text-xl font-semibold">成長＋毛利改善＋雙法人共振</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 opacity-70">全部條件皆來自 TWSE、TPEx 或 MOPS 官方公開資料。季毛利率使用單季數字；Q2～Q4 由同年累計財報差分後計算，不把累計毛利率冒充單季毛利率。</p>
          </div>
          <div className="text-right"><p className="text-3xl font-semibold">{loading ? "…" : error ? "—" : counts.pass}</p><p className="text-xs opacity-60">{loading ? "讀取官方 Gate" : "四關正式通過"}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs opacity-70">
          <span>通過 {counts.pass}</span><span>·</span><span>未通過 {counts.fail}</span><span>·</span><span>資料不足 {counts.insufficient}</span><span>·</span><span>不適用 {counts.notApplicable}</span>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/35 dark:text-white/35" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋代號、名稱或產業" className="field pl-11" /></div>
        <GhostButton onClick={() => setShowAll((value) => !value)}>{showAll ? "只看正式通過" : "查看全部狀態"}</GhostButton>
        <GhostButton disabled={loading} onClick={() => void reload()}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />{loading ? "讀取中" : "重新讀取"}</GhostButton>
      </div>

      {error ? <div className="rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">{error}</div> : null}
      {!error && warnings.length ? (
        <div className="rounded-2xl border border-[#b98b57]/20 bg-[#f8f1e8] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/15 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
          <p className="font-semibold">Scanner 部分官方資料暫時不可用</p>
          <p className="mt-1 text-xs leading-5 opacity-80">其餘 Gate 仍照實顯示；缺少來源的 Gate 會標成「資料不足」，不會因單一資料源失敗而讓整頁消失。</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-2">
        {visible.map((item) => (
          <Card key={`${item.market}:${item.code}`}><CardContent className="p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{item.name}</p><span className="text-xs text-black/40 dark:text-white/40">{item.code}</span>{heldCodes.has(item.code.toUpperCase()) ? <Badge tone="good">持有</Badge> : null}</div>
                <p className="mt-1 text-sm text-black/45 dark:text-white/45">{item.industry || "官方產業分類未帶入"} · {item.market}</p>
              </div>
              <StatusBadge status={item.overallStatus} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Gate status={item.revenueGate.status}><Database size={12} />3 月營收</Gate>
              <Gate status={item.grossMarginGate.status}>3 季毛利率</Gate>
              <Gate status={item.foreignGate.status}>外資 10D</Gate>
              <Gate status={item.trustGate.status}>投信 10D</Gate>
            </div>

            <details className="group mt-4 rounded-2xl border border-black/6 dark:border-white/8">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-black/65 dark:text-white/65">查看 Gate 實際數字、日期與官方來源</summary>
              <div className="grid gap-3 border-t border-black/6 p-3 dark:border-white/8">
                <GateDetail title="最近 3 個月營收 YoY > 20%" status={item.revenueGate.status} reason={item.revenueGate.reason} dataAsOf={item.revenueGate.dataAsOf} sources={item.revenueGate.sources}>
                  <div className="grid grid-cols-3 gap-2">
                    {item.revenueGate.values.map((value) => <div key={value.period} className="mini-metric"><span>{value.period} YoY</span><strong>{value.yoyPct === null ? "—" : percent(value.yoyPct, 1)}</strong></div>)}
                  </div>
                </GateDetail>

                <GateDetail title="季度毛利率連續改善" status={item.grossMarginGate.status} reason={item.grossMarginGate.reason} dataAsOf={item.grossMarginGate.dataAsOf} sources={item.grossMarginGate.sources}>
                  {item.grossMarginGate.values.length ? <div className="grid gap-2 sm:grid-cols-3">
                    {item.grossMarginGate.values.map((value) => <div key={value.period} className="mini-metric"><span>{value.period} 毛利率</span><strong>{percent(value.grossMarginPct, 2)}</strong><small className="mt-1 block font-normal leading-4 text-black/40 dark:text-white/40">營收 {number(value.revenue)}<br />成本 {number(value.operatingCost)}<br />毛利 {number(value.grossProfit)}</small></div>)}
                  </div> : <p className="text-xs text-black/40 dark:text-white/40">沒有可套用的一般產業季度毛利資料。</p>}
                </GateDetail>

                <GateDetail title="外資最近 10 個交易日淨買超 > 0" status={item.foreignGate.status} reason={item.foreignGate.reason} dataAsOf={item.foreignGate.dataAsOf} sources={item.foreignGate.sources}>
                  <div className="mini-metric"><span>10D 淨買超（股）</span><strong>{number(item.foreignGate.net10d)}</strong></div>
                </GateDetail>

                <GateDetail title="投信最近 10 個交易日淨買超 > 0" status={item.trustGate.status} reason={item.trustGate.reason} dataAsOf={item.trustGate.dataAsOf} sources={item.trustGate.sources}>
                  <div className="mini-metric"><span>10D 淨買超（股）</span><strong>{number(item.trustGate.net10d)}</strong></div>
                </GateDetail>
              </div>
            </details>
          </CardContent></Card>
        ))}
      </div>

      {!loading && !error && !visible.length ? <p className="py-14 text-center text-sm text-black/40 dark:text-white/40">目前沒有符合顯示條件的公司。可切換「查看全部狀態」檢查未通過、資料不足與不適用。</p> : null}
    </div>
  );
}
