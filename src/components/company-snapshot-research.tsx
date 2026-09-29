"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import type { AppState } from "@/lib/types";
import { buildCompanySnapshots, companySnapshotsForView, companySnapshotKey, isHeldCompanySnapshot } from "@/lib/company-snapshot";
import { loadBundledInstitutional10d, type InstitutionalCache } from "@/lib/institutional-data";
import { loadBundledTwQuotes, type TwQuoteCache } from "@/lib/market-data";
import { loadBundledQuarterlyMargins, type GateStatus, type QuarterlyMarginCache } from "@/lib/quarterly-financials";
import { loadBundledRevenue, type RevenueCache } from "@/lib/revenue-data";
import { loadBundledRevenueHistory, type RevenueHistoryCache } from "@/lib/revenue-history";
import { evaluateOfficialStrategy, type SourceRef } from "@/lib/strategy-gates";
import { loadBundledValuations, valuationSource, type ValuationCache } from "@/lib/valuation-data";
import { money, percent } from "@/lib/utils";
import { Badge, Card, CardContent, GhostButton } from "./ui";

type Caches = {
  quotes: TwQuoteCache;
  revenue: RevenueCache;
  valuations: ValuationCache;
  revenueHistory: RevenueHistoryCache;
  institutional: InstitutionalCache;
  quarterly: QuarterlyMarginCache;
};

const emptyValuations: ValuationCache = { generatedAt: "", sources: [], rows: [] };
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

function StatusBadge({ status }: { status: GateStatus }) {
  if (status === "pass") return <Badge tone="good">通過</Badge>;
  if (status === "insufficient") return <Badge tone="warn">資料不足</Badge>;
  return <Badge>{statusLabel(status)}</Badge>;
}

function ratio(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}x`;
}

function yieldPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(2)}%`;
}

function rawNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("zh-TW", { maximumFractionDigits: 2 });
}

function shares(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

function SourceLinks({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return <span>來源：—</span>;
  const unique = [...new Map(sources.map((source) => [`${source.name}:${source.url}`, source])).values()];
  return <span className="inline-flex flex-wrap gap-x-3 gap-y-1">{unique.map((source) => <a key={`${source.name}:${source.url}`} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-black/20 underline-offset-2 hover:decoration-current dark:decoration-white/20">{source.name}<ExternalLink size={10} /></a>)}</span>;
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{title}</h4><span className="text-[11px] text-black/40 dark:text-white/40">{detail}</span></div>;
}

export function CompanySnapshotResearch({ state, requestedKey }: { state: AppState; requestedKey?: string }) {
  const [caches, setCaches] = useState<Caches | null>(null);
  const [query, setQuery] = useState("");
  const [heldOnly, setHeldOnly] = useState(false);
  const [selectedKey, setSelectedKey] = useState(requestedKey ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const heldKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const holding of state.holdings) {
      if (holding.market !== "TW" || holding.type === "cash") continue;
      const code = holding.symbol.toUpperCase();
      if (holding.priceSource === "TWSE" || holding.priceSource === "TPEx") {
        keys.add(companySnapshotKey(holding.priceSource, code));
      } else {
        keys.add(code);
      }
    }
    return keys;
  }, [state.holdings]);

  async function fetchCaches(previous?: Caches | null) {
    const [quotes, revenue] = await Promise.all([
      loadBundledTwQuotes(),
      loadBundledRevenue()
    ]);

    const [valuationsResult, revenueHistoryResult, institutionalResult, quarterlyResult] = await Promise.all([
      optionalCache("官方估值", loadBundledValuations, previous?.valuations ?? emptyValuations),
      optionalCache("三個月營收歷史", loadBundledRevenueHistory, previous?.revenueHistory ?? emptyRevenueHistory),
      optionalCache("法人 10D", loadBundledInstitutional10d, previous?.institutional ?? emptyInstitutional),
      optionalCache("季度毛利率", loadBundledQuarterlyMargins, previous?.quarterly ?? emptyQuarterly)
    ]);

    return {
      caches: {
        quotes,
        revenue,
        valuations: valuationsResult.value,
        revenueHistory: revenueHistoryResult.value,
        institutional: institutionalResult.value,
        quarterly: quarterlyResult.value
      },
      warnings: [
        valuationsResult.warning,
        revenueHistoryResult.warning,
        institutionalResult.warning,
        quarterlyResult.warning
      ].filter(Boolean)
    };
  }

  useEffect(() => {
    let active = true;
    void fetchCaches()
      .then((next) => {
        if (!active) return;
        setCaches(next.caches);
        setWarnings(next.warnings);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "無法載入官方個股資料。");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      const next = await fetchCaches(caches);
      setCaches(next.caches);
      setWarnings(next.warnings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法載入官方個股資料。");
    } finally {
      setLoading(false);
    }
  }

  const strategies = useMemo(() => caches ? evaluateOfficialStrategy(caches.revenueHistory, caches.institutional, caches.quarterly) : [], [caches]);
  const snapshots = useMemo(() => caches ? buildCompanySnapshots({ quotes: caches.quotes, revenue: caches.revenue, valuations: caches.valuations, strategies }) : [], [caches, strategies]);
  const visible = useMemo(() => companySnapshotsForView(snapshots, query, heldKeys, heldOnly, 80), [snapshots, query, heldKeys, heldOnly]);
  const selected = useMemo(() => {
    if (selectedKey) {
      return snapshots.find((row) => `${row.market}:${row.code}` === selectedKey) ?? null;
    }
    return snapshots.find((row) => isHeldCompanySnapshot(row, heldKeys)) ?? visible[0] ?? null;
  }, [snapshots, selectedKey, heldKeys, visible]);
  const requestedMissing = Boolean(selectedKey && !loading && !error && snapshots.length && !selected);

  const quoteSource = selected && caches ? caches.quotes.sources.find((source) => source.name.toUpperCase().includes(selected.market.toUpperCase())) ?? null : null;
  const revenueSource = selected?.revenue && caches ? caches.revenue.sources.find((source) => source.name.toUpperCase().includes(selected.market.toUpperCase())) ?? null : null;
  const valuationMeta = selected && caches ? valuationSource(caches.valuations, selected.market) : null;

  return <div className="space-y-4">
    <div className="rounded-[24px] border border-black/6 bg-[#1f332a] p-5 text-white shadow-sm dark:border-white/8 dark:bg-[#dce9e2] dark:text-[#122018]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.14em] opacity-55">Company Snapshot · Official Data</p><h3 className="mt-2 text-xl font-semibold">一頁看完台股個股／ETF 的核心資料</h3><p className="mt-2 max-w-3xl text-sm leading-6 opacity-70">把已驗證的 TWSE、TPEx、MOPS 快取集中在同一頁。不同指標保留各自日期與來源；缺值、不適用與資料不足不補猜。</p></div>
        <div className="text-right"><p className="text-3xl font-semibold">{snapshots.length}</p><p className="text-xs opacity-60">可研究標的</p></div>
      </div>
    </div>

    <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
      <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/35 dark:text-white/35" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋個股／ETF 代號、名稱或產業" className="field pl-11" /></div>
      <GhostButton onClick={() => setHeldOnly((value) => !value)}>{heldOnly ? "顯示全部" : "只看持有"}</GhostButton>
      <GhostButton disabled={loading} onClick={() => void reload()}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />{loading ? "讀取中" : "重新讀取"}</GhostButton>
    </div>

    {error ? <div className="rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">{error}</div> : null}
    {!error && warnings.length ? (
      <div className="rounded-2xl border border-[#b98b57]/20 bg-[#f8f1e8] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/15 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
        <p className="font-semibold">部分官方研究資料暫時不可用</p>
        <p className="mt-1 text-xs leading-5 opacity-80">收盤價與最新月營收仍可正常使用；以下區塊會保留先前已載入資料，若沒有舊資料則顯示資料不足，不用假資料補齊。</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
          {warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      </div>
    ) : null}

    {!loading && !error ? <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
      {visible.slice(0, 16).map((row) => {
        const rowKey = `${row.market}:${row.code}`;
        const active = selected ? `${selected.market}:${selected.code}` === rowKey : false;
        return <button key={rowKey} onClick={() => setSelectedKey(rowKey)} className={`min-w-[150px] rounded-2xl border p-3 text-left transition ${active ? "border-[#315f49]/35 bg-[#e7f1e9] dark:border-[#8ec7a3]/30 dark:bg-[#173426]" : "border-black/6 bg-white/60 hover:bg-white dark:border-white/8 dark:bg-white/4 dark:hover:bg-white/7"}`}><div className="flex items-center justify-between gap-2"><strong className="text-sm">{row.code}</strong>{isHeldCompanySnapshot(row, heldKeys) ? <Badge tone="good">持有</Badge> : null}</div><p className="mt-1 truncate text-sm">{row.name}</p><p className="mt-1 truncate text-[11px] text-black/40 dark:text-white/40">{row.industry || row.market}</p></button>;
      })}
    </div> : null}

    {requestedMissing ? (
      <div className="rounded-2xl border border-[#b98b57]/20 bg-[#f8f1e8] p-6 text-center text-[#6f4c26] dark:border-[#b98b57]/15 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
        <Search className="mx-auto opacity-50" size={28} />
        <p className="mt-3 text-sm font-semibold">指定標的目前不在官方研究清單</p>
        <p className="mt-1 text-xs leading-5 opacity-80">要求的研究鍵：{selectedKey}。系統不會自動改顯示另一家公司，避免你誤以為看到的是原本指定標的。</p>
        <GhostButton className="mt-4 border-current/20 bg-transparent" onClick={() => setSelectedKey("")}>改看其他標的</GhostButton>
      </div>
    ) : null}
    {!loading && !error && !selected && !requestedMissing ? <div className="rounded-2xl border border-black/6 p-8 text-center dark:border-white/8"><Search className="mx-auto text-black/25 dark:text-white/25" size={28} /><p className="mt-3 text-sm font-semibold">選一家公司開始研究</p><p className="mt-1 text-xs text-black/40 dark:text-white/40">有台股持倉時會自動優先顯示持有標的；否則請從上方搜尋或快速選擇。</p></div> : null}

    {selected ? <>
      <Card><CardContent className="p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-semibold">{selected.name}</h3><span className="text-sm text-black/40 dark:text-white/40">{selected.code}</span>{isHeldCompanySnapshot(selected, heldKeys) ? <Badge tone="good">持有</Badge> : null}</div><p className="mt-1 text-sm text-black/45 dark:text-white/45">{selected.industry || "官方產業分類未帶入"} · {selected.market}</p></div>{selected.type === "etf" ? <Badge>ETF</Badge> : selected.strategy ? <StatusBadge status={selected.strategy.overallStatus} /> : <Badge tone="warn">策略資料不足</Badge>}</div></CardContent></Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardContent className="p-4 md:p-5"><SectionHeader title="市場與估值" detail="官方收盤 / 估值快照" /><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="mini-metric"><span>收盤價</span><strong>{selected.quote ? money(selected.quote.close, "TWD") : "—"}</strong></div><div className="mini-metric"><span>PE</span><strong>{ratio(selected.valuation?.pe)}</strong></div><div className="mini-metric"><span>PB</span><strong>{ratio(selected.valuation?.pb)}</strong></div><div className="mini-metric"><span>殖利率</span><strong>{yieldPercent(selected.valuation?.dividendYield)}</strong></div></div><div className="mt-4 space-y-1 text-[11px] leading-5 text-black/40 dark:text-white/40"><p>收盤資料日：{selected.quote?.date ?? "—"} {quoteSource ? <a href={quoteSource.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 underline underline-offset-2">{quoteSource.name}<ExternalLink size={10} /></a> : null}</p><p>估值資料日：{selected.valuation?.date ?? "—"} {valuationMeta ? <a href={valuationMeta.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 underline underline-offset-2">{valuationMeta.name}<ExternalLink size={10} /></a> : null}</p></div></CardContent></Card>

        <Card><CardContent className="p-4 md:p-5"><SectionHeader title="最新月營收" detail={selected.revenue?.period ?? "ETF 不適用"} />{selected.revenue ? <><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="mini-metric"><span>營收原始值</span><strong>{rawNumber(selected.revenue.revenue)}</strong></div><div className="mini-metric"><span>MoM</span><strong>{selected.revenue.momPct === null ? "—" : percent(selected.revenue.momPct, 1)}</strong></div><div className="mini-metric"><span>YoY</span><strong>{selected.revenue.yoyPct === null ? "—" : percent(selected.revenue.yoyPct, 1)}</strong></div><div className="mini-metric"><span>累計 YoY</span><strong>{selected.revenue.cumulativeYoyPct === null ? "—" : percent(selected.revenue.cumulativeYoyPct, 1)}</strong></div></div><p className="mt-4 text-[11px] leading-5 text-black/40 dark:text-white/40">金額沿用官方原始值，不自行猜測或換算單位。{revenueSource ? <a href={revenueSource.url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 underline underline-offset-2">{revenueSource.name}<ExternalLink size={10} /></a> : null}</p></> : <p className="mt-4 text-sm leading-6 text-black/45 dark:text-white/45">ETF 沒有公司型月營收欄位；本頁不把成分股營收混成 ETF 自身營收。</p>}</CardContent></Card>

        <Card><CardContent className="p-4 md:p-5"><SectionHeader title="最近 3 個月營收 YoY" detail={selected.strategy?.revenueGate.dataAsOf ?? "—"} />{selected.strategy ? <><div className="mt-4 grid grid-cols-3 gap-2">{selected.strategy.revenueGate.values.map((value) => <div key={value.period} className="mini-metric"><span>{value.period}</span><strong>{value.yoyPct === null ? "—" : percent(value.yoyPct, 1)}</strong></div>)}</div><div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-black/50 dark:text-white/50">{selected.strategy.revenueGate.reason}</p><StatusBadge status={selected.strategy.revenueGate.status} /></div><p className="mt-3 text-[11px] text-black/40 dark:text-white/40"><SourceLinks sources={selected.strategy.revenueGate.sources} /></p></> : <p className="mt-4 text-sm text-black/40 dark:text-white/40">{selected.type === "etf" ? "ETF 不適用於此公司型指標。" : "資料不足。"}</p>}</CardContent></Card>

        <Card><CardContent className="p-4 md:p-5"><SectionHeader title="最近 3 季單季毛利率" detail={selected.strategy?.grossMarginGate.dataAsOf ?? "—"} />{selected.strategy ? <>{selected.strategy.grossMarginGate.values.length ? <div className="mt-4 grid grid-cols-3 gap-2">{selected.strategy.grossMarginGate.values.map((value) => <div key={value.period} className="mini-metric"><span>{value.period}</span><strong>{percent(value.grossMarginPct, 2)}</strong></div>)}</div> : <div className="mt-4 rounded-xl bg-black/[0.025] p-3 text-sm text-black/45 dark:bg-white/[0.03] dark:text-white/45">{selected.strategy.grossMarginGate.reason}</div>}<div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs text-black/50 dark:text-white/50">{selected.strategy.grossMarginGate.reason}</p><StatusBadge status={selected.strategy.grossMarginGate.status} /></div><p className="mt-3 text-[11px] text-black/40 dark:text-white/40"><SourceLinks sources={selected.strategy.grossMarginGate.sources} /></p></> : <p className="mt-4 text-sm text-black/40 dark:text-white/40">{selected.type === "etf" ? "ETF 不適用於此公司型指標。" : "資料不足。"}</p>}</CardContent></Card>

        <Card><CardContent className="p-4 md:p-5"><SectionHeader title="法人最近 10 個交易日" detail={selected.strategy?.foreignGate.dataAsOf ?? "—"} />{selected.strategy ? <><div className="mt-4 grid grid-cols-2 gap-2"><div className="mini-metric"><span>外資淨買超（股）</span><strong>{shares(selected.strategy.foreignGate.net10d)}</strong></div><div className="mini-metric"><span>投信淨買超（股）</span><strong>{shares(selected.strategy.trustGate.net10d)}</strong></div></div><div className="mt-3 flex flex-wrap gap-2"><span className="text-xs">外資</span><StatusBadge status={selected.strategy.foreignGate.status} /><span className="ml-2 text-xs">投信</span><StatusBadge status={selected.strategy.trustGate.status} /></div><p className="mt-3 text-[11px] text-black/40 dark:text-white/40"><SourceLinks sources={[...selected.strategy.foreignGate.sources, ...selected.strategy.trustGate.sources]} /></p></> : <p className="mt-4 text-sm text-black/40 dark:text-white/40">{selected.type === "etf" ? "ETF 不適用於此公司型指標。" : "資料不足。"}</p>}</CardContent></Card>

        <Card><CardContent className="p-4 md:p-5"><SectionHeader title="四關 Scanner" detail="描述條件，不是買賣建議" />{selected.strategy ? <><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-black/6 p-3 dark:border-white/8"><p className="text-xs text-black/45 dark:text-white/45">3 月營收</p><div className="mt-2"><StatusBadge status={selected.strategy.revenueGate.status} /></div></div><div className="rounded-xl border border-black/6 p-3 dark:border-white/8"><p className="text-xs text-black/45 dark:text-white/45">3 季毛利率</p><div className="mt-2"><StatusBadge status={selected.strategy.grossMarginGate.status} /></div></div><div className="rounded-xl border border-black/6 p-3 dark:border-white/8"><p className="text-xs text-black/45 dark:text-white/45">外資 10D</p><div className="mt-2"><StatusBadge status={selected.strategy.foreignGate.status} /></div></div><div className="rounded-xl border border-black/6 p-3 dark:border-white/8"><p className="text-xs text-black/45 dark:text-white/45">投信 10D</p><div className="mt-2"><StatusBadge status={selected.strategy.trustGate.status} /></div></div></div><div className="mt-4 flex items-center justify-between rounded-xl bg-black/[0.025] p-3 dark:bg-white/[0.03]"><div><p className="text-xs text-black/45 dark:text-white/45">整體狀態</p><p className="mt-1 text-sm font-semibold">{selected.strategy.passedGateCount} / 4 關通過</p></div><StatusBadge status={selected.strategy.overallStatus} /></div></> : <p className="mt-4 text-sm text-black/40 dark:text-white/40">{selected.type === "etf" ? "ETF 不套用公司型四關 Scanner。" : "策略資料不足。"}</p>}</CardContent></Card>
      </div>
    </> : null}
  </div>;
}
