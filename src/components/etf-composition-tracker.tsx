"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Check, Clock3, ExternalLink, Eye, History, Info } from "lucide-react";
import { toast } from "sonner";
import type { EtfComposition } from "@/lib/types";
import {
  buildEtfCompositionTimeline,
  etfTimelineFingerprint
} from "@/lib/etf-composition-tracker";
import { Badge, Card, CardContent, InfoDisclosure } from "./ui";

const ETF_SEEN_CHANGE_EVENT = "portfoliopilot:etf-change-seen";
function subscribeSeenChanges(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(ETF_SEEN_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ETF_SEEN_CHANGE_EVENT, onChange);
  };
}

type ChangeFilter = "all" | "added" | "removed" | "weight";
type Props = {
  selected: EtfComposition;
  snapshots: EtfComposition[];
  loading: boolean;
  error: string;
};

const filterOptions: Array<{ id: ChangeFilter; label: string }> = [
  { id: "all", label: "全部異動" },
  { id: "added", label: "新增" },
  { id: "removed", label: "移除" },
  { id: "weight", label: "權重變化" }
];

const labels = {
  added: "來源新增",
  removed: "來源移除",
  increased: "權重上升",
  decreased: "權重下降",
  unchanged: "未變動"
} as const;

function delta(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)} pp`;
}

function observedWeight(composition: EtfComposition) {
  return composition.constituents.reduce((total, row) => total + row.weightPct, 0);
}

export function EtfCompositionTracker({ selected, snapshots, loading, error }: Props) {
  const timeline = useMemo(
    () => buildEtfCompositionTimeline(selected, snapshots),
    [selected, snapshots]
  );
  const [activePair, setActivePair] = useState("");
  const [filter, setFilter] = useState<ChangeFilter>("all");

  const latest = timeline[0] ?? null;
  const selectedPair = timeline.find((event) => event.currentAsOf === activePair) ?? latest;
  const seenKey = `portfoliopilot:etf-change-seen:v1:${selected.etfMarket}:${selected.etfSymbol.trim().toUpperCase()}`;
  const latestFingerprint = latest ? etfTimelineFingerprint(latest) : "";
  const hasLatestChange = Boolean(latest?.changedCount);
  const unread = hasLatestChange && acknowledged !== latestFingerprint;

  // React 19: subscribe to external storage rather than synchronously set
  // React state from an effect; SSR uses a null snapshot until hydration.
  const readSeenMarker = useCallback(() => {
    try {
      return window.localStorage.getItem(seenKey);
    } catch {
      return null;
    }
  }, [seenKey]);
  const acknowledged = useSyncExternalStore(subscribeSeenChanges, readSeenMarker, () => null);

  const filtered = selectedPair?.rows.filter((row) => {
    if (row.changeType === "unchanged") return false;
    if (filter === "all") return true;
    if (filter === "weight") return row.changeType === "increased" || row.changeType === "decreased";
    return row.changeType === filter;
  }) ?? [];
  const previousCoverage = selectedPair ? observedWeight(selectedPair.previous) : null;
  const currentCoverage = selectedPair ? observedWeight(selectedPair.latest) : null;
  const incomplete = previousCoverage !== null && currentCoverage !== null &&
    (previousCoverage < 95 || currentCoverage < 95);

  function markAsRead() {
    if (!latest || !hasLatestChange) return;
    try {
      window.localStorage.setItem(seenKey, latestFingerprint);
      window.dispatchEvent(new Event(ETF_SEEN_CHANGE_EVENT));
    } catch {
      toast.error("無法儲存已讀狀態；請檢查本機儲存空間。");
    }
  }

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[.1em] text-black/45 dark:text-white/45">
              <History size={15} /> ETF 成份異動追蹤
            </p>
            <h4 className="mt-2 break-words text-lg font-semibold">
              {selected.etfSymbol} · 官方持股快照比較
            </h4>
            <p className="mt-1 text-xs leading-5 text-black/45 dark:text-white/45">
              比較同一 ETF 各官方資料日的成份清單與權重；只在本機保留已讀狀態。
            </p>
          </div>
          {latest ? (
            <Badge tone={unread ? "warn" : hasLatestChange ? "good" : "neutral"}>
              {unread ? "本期尚未確認" : hasLatestChange ? "本期已讀" : "本期無異動"}
            </Badge>
          ) : <Badge>資料不足</Badge>}
        </div>

        {loading && !timeline.length ? (
          <p role="status" className="mt-4 text-sm text-black/45 dark:text-white/45">正在讀取官方 ETF 歷史快照…</p>
        ) : null}
        {error ? (
          <div role="status" className="mt-4 rounded-xl border border-[#b98b57]/25 bg-[#f8f1e8] p-3 text-xs leading-5 text-[#6f4c26] dark:bg-[#2a2117] dark:text-[#e0bd8c]">
            歷史資料讀取失敗：{error}。不會推測未取得的期別。
          </div>
        ) : null}

        {!timeline.length && !loading ? (
          <div className="mt-4 rounded-2xl border border-black/6 bg-black/[.018] p-4 text-sm dark:border-white/8 dark:bg-white/[.025]">
            <div className="flex items-center gap-2 font-semibold"><Clock3 size={16} />尚無可比較的兩期官方快照</div>
            <p className="mt-2 text-xs leading-5 text-black/45 dark:text-white/45">
              {selected.sourceType === "user_import"
                ? "這份 ETF 成份是手動匯入；為避免把不完整 CSV 當作官方完整成份，本追蹤只比較不同日期的官方來源。"
                : "歷史快照至少需要同檔 ETF 的兩個官方資料日。GitHub 定期更新資料後，會在此自動顯示真正存在的比較結果。"}
            </p>
          </div>
        ) : null}

        {timeline.length && selectedPair ? (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`etf-composition-period-${selected.etfSymbol}`} className="text-xs font-semibold">
                比較期間
              </label>
              <select
                id={`etf-composition-period-${selected.etfSymbol}`}
                className="field min-w-0 max-w-full sm:max-w-[320px]"
                value={selectedPair.currentAsOf}
                onChange={(event) => {
                  setActivePair(event.target.value);
                  setFilter("all");
                }}
              >
                {timeline.map((event) => (
                  <option key={event.currentAsOf} value={event.currentAsOf}>
                    {event.previousAsOf} → {event.currentAsOf}
                    {event.changedCount ? ` · ${event.changedCount} 筆` : " · 無變動"}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([
                ["新增", selectedPair.summary.added],
                ["移除", selectedPair.summary.removed],
                ["權重上升", selectedPair.summary.increased],
                ["權重下降", selectedPair.summary.decreased]
              ] as const).map(([title, count]) => (
                <div key={title} className="rounded-xl border border-black/6 px-3 py-3 dark:border-white/8">
                  <p className="text-[11px] text-black/45 dark:text-white/45">{title}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{count}</p>
                </div>
              ))}
            </div>

            {incomplete ? (
              <div className="mt-3 rounded-xl border border-[#b98b57]/25 bg-[#f8f1e8] px-3 py-2 text-xs leading-5 text-[#6f4c26] dark:bg-[#2a2117] dark:text-[#e0bd8c]">
                官方成份公開權重未涵蓋全額（前期 {previousCoverage?.toFixed(1)}%、本期 {currentCoverage?.toFixed(1)}%）。
                新增／移除僅代表在這兩份來源清單內出現／未出現，不能直接推論基金已交易。
              </div>
            ) : null}

            <div role="group" aria-label="異動類型篩選" className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-1">
              {filterOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={filter === option.id}
                  onClick={() => setFilter(option.id)}
                  className={`min-h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold transition ${filter === option.id
                    ? "border-[#315f49]/30 bg-[#e7f1e9] text-[#245238] dark:bg-[#173426] dark:text-[#a9d7b7]"
                    : "border-black/7 bg-white/65 text-black/50 dark:border-white/8 dark:bg-white/4 dark:text-white/50"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {filtered.length ? (
              <div className="mt-2 space-y-1.5">
                {filtered.slice(0, 12).map((row) => (
                  <div key={`${row.market}:${row.symbol}`} className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-black/[.025] px-3 py-2.5 dark:bg-white/[.035]">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">{row.symbol} · {row.name}</p>
                      <p className="mt-1 text-[11px] text-black/45 dark:text-white/45">
                        {labels[row.changeType]} · {row.previousWeightPct.toFixed(2)}% → {row.currentWeightPct.toFixed(2)}%
                      </p>
                    </div>
                    <strong className={`shrink-0 text-xs tabular-nums ${row.changePctPoints >= 0
                      ? "text-[#315f49] dark:text-[#a9d7b7]"
                      : "text-[#9a624f] dark:text-[#e0ad91]"}`}>{delta(row.changePctPoints)}</strong>
                  </div>
                ))}
                {filtered.length > 12 ? (
                  <details className="rounded-xl border border-black/7 px-3 py-2 text-xs dark:border-white/8">
                    <summary className="min-h-10 cursor-pointer font-semibold">查看其餘 {filtered.length - 12} 筆變動</summary>
                    <div className="mt-2 space-y-2">
                      {filtered.slice(12).map((row) => (
                        <div key={`${row.market}:${row.symbol}:rest`} className="flex justify-between gap-3 border-t border-black/5 py-2 dark:border-white/7">
                          <span className="min-w-0 break-words">{row.symbol} · {row.name} · {labels[row.changeType]}</span>
                          <strong className="shrink-0 tabular-nums">{delta(row.changePctPoints)}</strong>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-black/[.025] p-3 text-xs text-black/45 dark:bg-white/[.035] dark:text-white/45">
                這段期間沒有符合篩選條件的成份變動。
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 text-[11px] leading-5 text-black/45 dark:text-white/45">
                <p>來源：{selectedPair.latest.sourceName} · 資料日 {selectedPair.latest.asOf}</p>
                <a href={selectedPair.latest.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1 underline underline-offset-2">
                  開啟官方來源 <ExternalLink size={12} />
                </a>
              </div>
              {latest && hasLatestChange ? (
                <button
                  type="button"
                  disabled={!unread}
                  onClick={markAsRead}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/10 px-3 text-xs font-semibold disabled:opacity-45 dark:border-white/10"
                >
                  {unread ? <Eye size={15} /> : <Check size={15} />}
                  {unread ? "標記最新異動已讀" : "已確認最新異動"}
                </button>
              ) : null}
            </div>

            <InfoDisclosure summary="成份異動與交易行為的差異" className="mt-3">
              <div className="flex items-start gap-2">
                <Info size={15} className="mt-0.5 shrink-0" />
                <p>
                  新增、移除指公開持股清單的差異；權重變化單位為百分點（pp），可能由價格、申贖或實際持倉調整造成。
                  本功能不推論基金確實買賣，也不提供即時推播；已讀狀態只儲存在你的裝置。
                </p>
              </div>
            </InfoDisclosure>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
