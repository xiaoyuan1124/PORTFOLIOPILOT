"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { CompanyExposure } from "@/lib/etf-lookthrough";
import { compareCompanyEtfSources } from "@/lib/etf-source-comparison";
import { money } from "@/lib/utils";
import { Badge, Card, CardContent } from "./ui";

type Props = { exposures: CompanyExposure[] };

type ComparisonRow = {
  exposure: CompanyExposure;
  breakdown: ReturnType<typeof compareCompanyEtfSources>;
};

// Reuse the same drill-down for every match, not just the first ten.
function CompanyExposureDetail({ exposure, breakdown }: ComparisonRow) {
  return (
      <details
                className="min-w-0 rounded-xl border border-black/7 dark:border-white/9"
      >
        <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-3">
          <span className="min-w-0 break-words text-sm font-semibold">
            {exposure.symbol} · {exposure.name}
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {breakdown.distinctEtfCount >= 2 ? <Badge tone="warn">{breakdown.distinctEtfCount} 檔 ETF</Badge> : null}
            <strong className="text-sm tabular-nums">{money(exposure.totalValueTwd)}</strong>
          </span>
        </summary>
        <div className="space-y-2 border-t border-black/6 px-3 py-3 text-xs dark:border-white/8">
          <div className="flex flex-wrap justify-between gap-2">
            <span>直接持股</span><strong className="tabular-nums">{money(breakdown.directValueTwd)}</strong>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <span>ETF 隱含合計</span><strong className="tabular-nums">{money(breakdown.etfTotalValueTwd)}</strong>
          </div>
          <p className="text-[11px] leading-5 text-black/45 dark:text-white/45">
            下方比例為該公司已辨識 ETF 隱含金額的來源分攤，不是此公司占整體 ETF 的比例。
          </p>
          {breakdown.funds.map((fund) => (
            <div key={fund.sourceKey} className="rounded-lg bg-black/[.025] p-3 dark:bg-white/[.035]">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="min-w-0 break-words font-semibold">{fund.etfSymbol} · {fund.etfName}</span>
                <strong className="shrink-0 tabular-nums">{money(fund.valueTwd)}</strong>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-full rounded-full bg-[#456b58]" style={{ width: `${Math.min(100, fund.etfValueSharePct)}%` }} />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-black/45 dark:text-white/45">
                來源占比 {fund.etfValueSharePct.toFixed(1)}% · ETF 成份權重 {fund.weightPct.toFixed(2)}% · 資料日 {fund.asOf}
              </p>
              <a href={fund.sourceUrl} target="_blank" rel="noopener noreferrer"
                 className="mt-1 inline-flex min-h-10 items-center break-all underline underline-offset-2">
                查看官方／匯入來源：{fund.sourceName}
              </a>
            </div>
          ))}
          {!breakdown.funds.length ? (
            <p className="text-xs text-black/45 dark:text-white/45">
              此公司目前只有直接持股，沒有可辨識的 ETF 隱含來源。
            </p>
          ) : null}
        </div>
      </details>
  );
}

export function EtfCompanyComparison({ exposures }: Props) {
  const [query, setQuery] = useState("");
  const [overlapOnly, setOverlapOnly] = useState(false);

  const compared = useMemo(
    () => exposures.map((exposure) => ({ exposure, breakdown: compareCompanyEtfSources(exposure) })),
    [exposures]
  );
  const overlapping = compared.filter((row) => row.breakdown.distinctEtfCount >= 2).length;
  const filtered = compared.filter(({ exposure, breakdown }) => {
    if (overlapOnly && breakdown.distinctEtfCount < 2) return false;
    const text = query.trim().toLocaleLowerCase();
    return !text || [exposure.symbol, exposure.name, exposure.sector]
      .some((value) => value.toLocaleLowerCase().includes(text));
  });

  return (
    <Card>
      <CardContent>
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">
          Cross-ETF Exposure · ETF 重疊比較
        </p>
        <h3 className="mt-1 text-lg font-semibold">同一家公司，分別透過哪些 ETF 持有？</h3>
        <p className="mt-2 text-xs leading-5 text-black/50 dark:text-white/50">
          將直接持股和各檔 ETF 的隱含金額拆開比較。同一 ETF 的多個持倉會合併，
          未取得的成份仍保留為未解析，不會推估成零。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="min-w-0 text-xs font-semibold">
            搜尋公司名稱、股票代號或產業
            <span className="relative mt-2 block">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
                autoComplete="off"
                placeholder="例如 2330、台積電、半導體"
                className="field min-h-11 w-full min-w-0 pl-10"
              />
            </span>
          </label>
          <button
            type="button"
            aria-pressed={overlapOnly}
            onClick={() => setOverlapOnly((value) => !value)}
            className={`min-h-11 rounded-xl border px-3 text-left text-xs font-semibold transition ${overlapOnly
              ? "border-[#315f49]/30 bg-[#e7f1e9] text-[#245238] dark:bg-[#173426] dark:text-[#a9d7b7]"
              : "border-black/8 bg-white/60 text-black/60 dark:border-white/10 dark:bg-white/5 dark:text-white/60"}`}
          >
            僅看跨 ETF 重疊（{overlapping} 家）
          </button>
        </div>
        <p role="status" className="mt-3 text-xs text-black/45 dark:text-white/45">
          顯示 {filtered.length} / {exposures.length} 家公司。
        </p>

        <div className="mt-3 space-y-2">
          {filtered.slice(0, 10).map(({ exposure, breakdown }) => (
            <CompanyExposureDetail key={breakdown.companyKey} exposure={exposure} breakdown={breakdown} />
          ))}
        </div>
        {filtered.length > 10 ? (
          <details className="mt-3 rounded-xl border border-black/7 p-3 dark:border-white/8">
            <summary className="min-h-11 cursor-pointer text-xs font-semibold">查看其餘 {filtered.length - 10} 家公司</summary>
            <div className="mt-2 space-y-2">
              {filtered.slice(10).map(({ exposure, breakdown }) => (
                <CompanyExposureDetail key={breakdown.companyKey} exposure={exposure} breakdown={breakdown} />
              ))}
            </div>
          </details>
        ) : null}
        {!filtered.length ? (
          <p className="mt-3 rounded-xl bg-black/[.025] p-4 text-xs text-black/50 dark:bg-white/[.03] dark:text-white/50">
            沒有符合條件的公司；可清空搜尋或取消「僅看跨 ETF 重疊」。
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
