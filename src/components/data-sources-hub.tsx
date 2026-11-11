"use client";

import { useEffect, useMemo, useState } from "react";
import { Database, ExternalLink, RefreshCw } from "lucide-react";
import type { AppState } from "@/lib/types";
import { Modal, GhostButton } from "./ui";
import { fetchPublishedMarketCache, publicMarketDataUrl } from "@/lib/market-data";

const datasets = [
  { title: "台股收盤價", path: "tw-quotes.json" },
  { title: "歷史收盤價／回測", path: "tw-price-history/index.json" },
  { title: "月營收", path: "tw-revenue.json" },
  { title: "估值（PE／PB／殖利率）", path: "tw-valuations.json" },
  { title: "外資與投信", path: "tw-institutional-10d.json" },
  { title: "重大訊息", path: "tw-material-events.json" },
  { title: "季度財務", path: "tw-quarterly-margins.json" },
  { title: "市場指數", path: "tw-benchmarks.json" },
  { title: "ETF 成分", path: "tw-etf-compositions.json" }
] as const;

type ListedSource = {
  name: string;
  url: string | null;
  fetchedAt: string | null;
  asOf: string | null;
  status: string | null;
};
type Group = {
  title: string;
  path: string;
  generatedAt: string | null;
  sources: ListedSource[];
  error?: string;
  offlineFallback?: boolean;
};

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function httpUrl(value: unknown): string | null {
  const raw = textValue(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function extractPublishedSources(data: unknown): { generatedAt: string | null; sources: ListedSource[] } {
  const json = record(data);
  const entries: unknown[] = Array.isArray(json.sources) ? json.sources : [];
  // Index providers (e.g. market indices) declare per-series provenance.
  if (Array.isArray(json.benchmarks)) entries.push(...json.benchmarks);
  const sources = entries.map((entry) => {
    const item = record(entry);
    const symbol = textValue(item.symbol);
    const name = textValue(item.sourceName) ?? textValue(item.name) ??
      textValue(item.provider) ?? "公開資料";
    return {
      name: symbol ? symbol + " · " + name : name,
      url: httpUrl(item.sourceUrl) ?? httpUrl(item.url) ??
        httpUrl(item.urlTemplate) ?? httpUrl(item.sourceUrlTemplate),
      fetchedAt: textValue(item.fetchedAt),
      asOf: textValue(item.asOf),
      status: textValue(item.status)
    };
  });
  const dedup = new Map<string, ListedSource>();
  for (const source of sources) dedup.set(source.name + source.url, source);
  return { generatedAt: textValue(json.generatedAt), sources: [...dedup.values()] };
}

function dateLabel(date: string | null) {
  if (!date) return "未提供時間";
  return date.replace("T", " ").slice(0, 16) + (date.endsWith("Z") ? " UTC" : "");
}

function groupSourceCount(group: Group) {
  return group.error ? "讀取失敗" : group.sources.length ? group.sources.length + " 個來源" : "來源詳情未提供";
}

export function DataSourcesHub({ state }: { state: AppState }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const holdingPrices = useMemo(() => state.holdings.filter(holding => holding.type !== "cash"), [state.holdings]);
  const manuallyPriced = holdingPrices.filter(holding => holding.priceSource !== "TWSE" && holding.priceSource !== "TPEx");
  const officialPrices = holdingPrices.filter(holding => holding.priceSource === "TWSE" || holding.priceSource === "TPEx");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();
    void Promise.all(datasets.map(async ({ title, path }) => {
      try {
        const { response, offlineFallback } = await fetchPublishedMarketCache(path);
        if (controller.signal.aborted) throw new Error("已取消");
        const parsed = extractPublishedSources(await response.json());
        return { title, path, ...parsed, offlineFallback } satisfies Group;
      } catch (error) {
        return { title, path, generatedAt: null, sources: [], error: error instanceof Error ? error.message : "讀取失敗" } satisfies Group;
      }
    })).then(result => {
      if (cancelled) return;
      setGroups(result);
      setUpdatedAt(new Date().toLocaleString("zh-TW"));
      setLoading(false);
    });
    return () => { cancelled = true; controller.abort(); };
  }, [open, refreshKey]);

  return <Modal
    title="資料來源"
    open={open}
    onOpenChange={next => { setOpen(next); if (next) setLoading(true); }}
    trigger={<button type="button" aria-label="資料來源" title="查看資料來源、價格日期及公開資料網址"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/6 bg-white/80 dark:border-white/8 dark:bg-white/6">
      <Database size={19} aria-hidden="true" />
    </button>}
  >
    <div className="space-y-4" data-testid="data-sources-hub">
      <div className="rounded-xl border border-black/8 p-3 text-xs leading-5 dark:border-white/10">
        <p className="font-semibold">本機持股價格</p>
        <p className="mt-1 text-black/55 dark:text-white/55">
          {officialPrices.length} 筆使用 TWSE／TPEx 官方收盤價 · {manuallyPriced.length} 筆為手動／未確認來源
        </p>
        {manuallyPriced.length > 0 ? <p role="status" className="mt-1 text-amber-700 dark:text-amber-300">手動價格不會自動更新；需在持股頁確認。</p> : null}
        {holdingPrices.length ? <details className="mt-2 rounded-lg border border-black/8 p-2 dark:border-white/10">
          <summary className="min-h-8 cursor-pointer font-semibold">查看每檔持股價格及資料日期</summary>
          <div className="mt-2 max-h-[35dvh] space-y-1 overflow-y-auto">
            {holdingPrices.map(holding => <div key={holding.id} className="flex justify-between gap-3 border-t border-black/5 py-1.5 dark:border-white/10">
              <span className="min-w-0 truncate">{holding.symbol} · {holding.name}</span>
              <span className="shrink-0 text-right text-black/55 dark:text-white/55">
                {holding.priceSource === "TWSE" || holding.priceSource === "TPEx" ? holding.priceSource : "手動"}
                {" · "}{holding.priceAsOf ?? "日期未知"}
              </span>
            </div>)}
          </div>
        </details> : null}
      </div>
      {state.etfCompositions.length ? <details className="rounded-xl border border-black/8 p-3 text-xs dark:border-white/10">
        <summary className="min-h-9 cursor-pointer font-semibold">我儲存的 ETF 成分來源（{state.etfCompositions.length} 筆）</summary>
        <div className="mt-2 max-h-[32dvh] space-y-2 overflow-y-auto">
          {state.etfCompositions.map(item => <div key={item.id} className="rounded-lg bg-black/[.02] p-2 dark:bg-white/[.03]">
            <div className="flex flex-wrap justify-between gap-2"><strong>{item.etfSymbol} · {item.etfName}</strong>
              {httpUrl(item.sourceUrl) ? <a href={httpUrl(item.sourceUrl)!} rel="noopener noreferrer" target="_blank"
                className="inline-flex items-center gap-1 underline underline-offset-2">檢視出處 <ExternalLink size={12} /></a> : null}</div>
            <p className="mt-1 text-black/50 dark:text-white/50">{item.sourceName} · {item.sourceType === "user_import" ? "手動匯入" : "官方"} · 資料日 {item.asOf}</p>
          </div>)}
        </div>
      </details> : null}
      <p className="text-xs text-black/55 dark:text-white/55">
        公開行情由 GitHub Actions 排程更新快取；個人持股及淨值保存在本機，兩者更新時間不一定相同。
      </p>
      {loading ? <p role="status" className="text-sm">正在讀取來源索引…</p> :
        <p className="text-[11px] text-black/45 dark:text-white/45">來源索引檢查：{updatedAt || "尚未檢查"}</p>}
      {groups.map(group => <details key={group.path} className="rounded-xl border border-black/8 px-3 py-2 dark:border-white/10">
        <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
          <span>{group.title}</span><span className="shrink-0 text-xs font-normal text-black/45 dark:text-white/45">{groupSourceCount(group)}</span>
        </summary>
        <div className="space-y-2 pb-2 text-xs">
          <p className="text-black/50 dark:text-white/50">快取生成：{dateLabel(group.generatedAt)}{group.offlineFallback ? " · 離線內建備份，可能過期" : ""}</p>
          {group.error ? <p role="alert" className="text-amber-700 dark:text-amber-300">無法讀取快取：{group.error}</p> : null}
          {group.sources.map((source, index) => <div key={index} className="rounded-lg bg-black/[.02] p-2 dark:bg-white/[.03]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{source.name}</strong>
              {source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
                官方來源 <ExternalLink size={12} aria-hidden="true" />
              </a> : <span className="text-black/45 dark:text-white/45">無原始網址</span>}
            </div>
            <p className="mt-1 text-black/50 dark:text-white/50">
              {source.asOf ? "資料日 " + source.asOf + " · " : ""}
              {source.fetchedAt ? "取得 " + dateLabel(source.fetchedAt) : ""}
              {source.status && source.status !== "ok" ? " · " + source.status : ""}
            </p>
          </div>)}
          <a href={publicMarketDataUrl(group.path)} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold underline underline-offset-2">
            查看本站公開快取 <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      </details>)}
      <p className="text-xs leading-5 text-black/45 dark:text-white/45">
        收盤價不是盤中報價；無來源、日期不一致或資料不足時不補造數據。ETF 手動匯入的來源仍以各筆成分資料記錄為準。
      </p>
      <GhostButton className="w-full" onClick={() => { setLoading(true); setRefreshKey(value => value + 1); }}>
        <RefreshCw size={15} />重新讀取資料索引
      </GhostButton>
    </div>
  </Modal>;
}
