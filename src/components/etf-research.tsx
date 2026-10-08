"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, RefreshCw } from "lucide-react";
import type { AppState, EtfComposition } from "@/lib/types";
import { loadBundledEtfCompositions, normalizeEtfCompositionNames, type EtfCompositionCache } from "@/lib/etf-composition-data";
import { chooseCurrentEtfCompositions } from "@/lib/etf-composition-catalog";
import { analyzeEtf } from "@/lib/etf-research";
import { loadBundledTwQuotes, type TwQuoteCache } from "@/lib/market-data";
import { Badge, Card, CardContent, GhostButton, InfoDisclosure } from "./ui";
import { EtfDeepAnalysis } from "./etf-deep-analysis";
import { EtfCompositionTracker } from "./etf-composition-tracker";



function compositionKey(composition: EtfComposition) {
  return `${composition.etfMarket}:${composition.etfSymbol.trim().toUpperCase()}`;
}

function fmtPct(value: number, digits = 2) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function fmtPoint(value: number, digits = 3) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}pt`;
}

export function EtfResearch({
  state,
  onOpenStock,
  requestedSymbol
}: {
  state: AppState;
  onOpenStock?: (researchKey: string) => void;
  requestedSymbol?: string;
}) {
  const [quotes, setQuotes] = useState<TwQuoteCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoteError, setQuoteError] = useState("");
  const [compositionHistory, setCompositionHistory] = useState<EtfComposition[]>([]);
  const [officialCache, setOfficialCache] = useState<EtfCompositionCache | null>(null);
  const [historyError, setHistoryError] = useState("");
  const heldEtfKeys = useMemo(
    () => new Set(
      state.holdings
        .filter((holding) => holding.type === "etf")
        .map((holding) => `${holding.market}:${holding.symbol.trim().toUpperCase()}`)
    ),
    [state.holdings]
  );
  const compositions = useMemo(() => {
    // Research is read-only: permit browsing issuer-supported ETFs even when
    // the user has not bought them or synchronized local holdings.
    const current = chooseCurrentEtfCompositions([
      ...state.etfCompositions,
      ...(officialCache?.compositions.filter((item) => item.sourceType !== "user_import") ?? [])
    ]);
    return current.map(normalizeEtfCompositionNames).sort((a, b) => {
      const aHeld = heldEtfKeys.has(compositionKey(a)) ? 1 : 0;
      const bHeld = heldEtfKeys.has(compositionKey(b)) ? 1 : 0;
      return bHeld - aHeld || a.etfSymbol.localeCompare(b.etfSymbol);
    });
  }, [heldEtfKeys, state.etfCompositions, officialCache]);
  const [manualSelectedKey, setManualSelectedKey] = useState<string | null>(null);
  // The requested ETF might only appear after the issuer bundle loads.
  // Resolve the requested symbol after loading, unless the user chose a tab.
  const requestedKey = requestedSymbol
    ? compositions.find((item) => item.etfSymbol.trim().toUpperCase() === requestedSymbol.trim().toUpperCase())
    : undefined;
  const selectedKey = manualSelectedKey ?? (requestedKey ? compositionKey(requestedKey) : compositions[0] ? compositionKey(compositions[0]) : "");

  async function reload() {
    setLoading(true);
    setQuoteError("");
    setHistoryError("");
    const [quoteResult, compositionResult] = await Promise.allSettled([
      loadBundledTwQuotes(),
      loadBundledEtfCompositions()
    ]);

    if (quoteResult.status === "fulfilled") {
      setQuotes(quoteResult.value);
    } else {
      setQuotes(null);
      setQuoteError(quoteResult.reason instanceof Error ? quoteResult.reason.message : "無法載入官方台股收盤資料。");
    }

    if (compositionResult.status === "fulfilled") {
      setOfficialCache(compositionResult.value);
      setCompositionHistory(compositionResult.value.history);
    } else {
      setHistoryError(compositionResult.reason instanceof Error ? compositionResult.reason.message : "無法載入 ETF 成份歷史快照。");
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    void Promise.allSettled([
      loadBundledTwQuotes(),
      loadBundledEtfCompositions()
    ]).then(([quoteResult, compositionResult]) => {
      if (!active) return;
      if (quoteResult.status === "fulfilled") {
        setQuotes(quoteResult.value);
        setQuoteError("");
      } else {
        setQuoteError(quoteResult.reason instanceof Error ? quoteResult.reason.message : "無法載入官方台股收盤資料。");
      }

      if (compositionResult.status === "fulfilled") {
        setOfficialCache(compositionResult.value);
        setCompositionHistory(compositionResult.value.history);
        setHistoryError("");
      } else {
        setHistoryError(compositionResult.reason instanceof Error ? compositionResult.reason.message : "無法載入 ETF 成份歷史快照。");
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const selected =
    compositions.find((composition) => compositionKey(composition) === selectedKey) ??
    compositions[0] ??
    null;
  const result = selected && quotes
    ? analyzeEtf(selected, state.holdings, quotes, state.usdTwd)
    : null;
  const positive = result?.rows.filter((row) => row.contributionPctPoints > 0).slice(0, 8) ?? [];
  const negative = result?.rows.filter((row) => row.contributionPctPoints < 0).slice(0, 8) ?? [];
  const sortedConstituents = selected
    ? [...selected.constituents].sort((a, b) => b.weightPct - a.weightPct)
    : [];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="rounded-[24px] border border-black/6 bg-[#1f332a] p-5 text-white shadow-sm dark:border-white/8 dark:bg-[#dce9e2] dark:text-[#122018]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] opacity-55">ETF Research · Look-through + Attribution</p>
            <h3 className="mt-2 text-xl font-semibold">從 ETF 一路看到是哪幾家公司在拉抬／拖累</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 opacity-70">先看今日影響、成份結構與異動，再展開完整資料。</p>
            <InfoDisclosure summary="資料來源與同步方式" className="mt-3 border-white/15 bg-white/[.06] dark:border-black/10 dark:bg-black/[.04]">
              成份權重使用目前保存的可追溯資料；支援的持有台灣 ETF 會在「同步最新資料」時同步官方發行人成份。當日歸因只使用同一最新交易日、可唯一匹配的官方台股收盤漲跌，缺資料不補猜。
            </InfoDisclosure>
          </div>
          <GhostButton disabled={loading} onClick={() => void reload()} className="border-white/20 bg-white/10 text-white dark:border-black/10 dark:bg-black/5 dark:text-[#122018]">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {loading ? "同步中" : "重新整理"}
          </GhostButton>
        </div>
      </div>

      {quoteError || historyError ? (
        <div className="flex gap-2 rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{[quoteError, historyError].filter(Boolean).join("；")}</span>
        </div>
      ) : null}

      <div role="status" className="rounded-xl border border-black/6 bg-white/50 px-3 py-2 text-xs leading-5 text-black/55 dark:border-white/8 dark:bg-white/4 dark:text-white/55">
        {officialCache
          ? `官方成份目錄 ${officialCache.compositions.length} 檔 · 快取產生 ${officialCache.generatedAt.slice(0, 10)}${officialCache.offlineFallback ? " · 離線舊快取（非最新更新）" : ""}。`
          : loading ? "正在讀取官方 ETF 成份目錄…" : "官方 ETF 目錄未載入，僅能查看本機已有的資料。"}
        {" "}瀏覽不會修改持股或覆寫本機成份。
      </div>

      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
        {compositions.map((composition) => {
          const key = compositionKey(composition);
          const active = selected ? compositionKey(selected) === key : false;
          return (
            <button
              key={key}
              onClick={() => setManualSelectedKey(key)}
              className={`min-w-[150px] rounded-2xl border p-3 text-left transition ${
                active
                  ? "border-[#315f49]/35 bg-[#e7f1e9] dark:border-[#8ec7a3]/30 dark:bg-[#173426]"
                  : "border-black/6 bg-white/60 hover:bg-white dark:border-white/8 dark:bg-white/4 dark:hover:bg-white/7"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">{composition.etfSymbol}</strong>
                {heldEtfKeys.has(key) ? <Badge tone="good">持有</Badge> : null}
              </div>
              <p className="mt-1 truncate text-sm">{composition.etfName}</p>
              <p className="mt-1 text-[11px] text-black/40 dark:text-white/40">
                {composition.sourceType === "user_import" ? "手動匯入" : "官方成份"} · 資料日 {composition.asOf}
              </p>
            </button>
          );
        })}
      </div>

      {!selected ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-semibold">目前沒有 ETF 成份資料</p>
            <p className="mt-2 text-xs leading-5 text-black/45 dark:text-white/45">
              目前尚未取得可研究的官方或本機 ETF 成份；請檢查網路並按「重新整理」。未支援的 ETF 可到「ETF 穿透」以 CSV 匯入；不會從名稱推測成份。
            </p>
          </CardContent>
        </Card>
      ) : null}

      {selected ? (
        <EtfCompositionTracker
          selected={selected}
          snapshots={[...compositions, ...compositionHistory]}
          loading={loading}
          error={historyError}
        />
      ) : null}

      {selected && result && quotes ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">成份權重覆蓋</p><p className="mt-2 text-xl font-semibold">{result.compositionCoveragePct.toFixed(1)}%</p><p className="mt-1 text-xs text-black/35 dark:text-white/35">{result.constituentCount} 檔已匯入成份</p></CardContent></Card>
            <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">Top 10 集中度</p><p className="mt-2 text-xl font-semibold">{result.top10WeightPct.toFixed(1)}%</p><p className="mt-1 text-xs text-black/35 dark:text-white/35">Top 1 {result.top1WeightPct.toFixed(1)}% · 有效持股約 {result.effectiveHoldingCount.toFixed(1)} 檔</p></CardContent></Card>
            <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">最大產業</p><p className="mt-2 truncate text-xl font-semibold">{result.topSector?.sector ?? "—"}</p><p className="mt-1 text-xs text-black/35 dark:text-white/35">{result.topSector ? `${result.topSector.weightPct.toFixed(1)}% 權重` : "無產業資料"}</p></CardContent></Card>
            <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">與直接持股重疊</p><p className="mt-2 text-xl font-semibold">{result.directPortfolioOverlapWeightPct.toFixed(1)}%</p><p className="mt-1 truncate text-xs text-black/35 dark:text-white/35">{result.directPortfolioOverlapSymbols.length ? result.directPortfolioOverlapSymbols.join("、") : "沒有直接持股重疊"}</p></CardContent></Card>
          </section>

          <Card>
            <CardContent>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Daily attribution</p>
                  <h3 className="mt-1 text-lg font-semibold">今天哪些成份股在拉抬／拖累 {selected.etfSymbol}？</h3>
                  <p className="mt-2 max-w-3xl text-xs leading-5 text-black/45 dark:text-white/45">先看正負貢獻最大的成份，點成份股可直接進一步研究。</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tabular-nums">{result.attributionDate ? fmtPct(result.estimatedEtfReturnPct) : "—"}</p>
                  <p className="mt-1 text-[11px] text-black/38 dark:text-white/38">
                    {result.attributionDate
                      ? `${result.attributionDate} · 已涵蓋權重 ${result.attributionCoveredWeightPct.toFixed(1)}%`
                      : "尚無可比較官方行情"}
                  </p>
                </div>
              </div>

              {result.attributionUnresolvedWeightPct > 0 ? (
                <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-[#8b6538] dark:text-[#d4ad7c]">
                  <AlertTriangle className="mt-0.5 shrink-0" size={13} />
                  另有約 {result.attributionUnresolvedWeightPct.toFixed(1)}% 的已匯入成份權重未納入本次日歸因，可能是 US 成份、缺行情、交易日不同或代號無法唯一匹配。
                </p>
              ) : null}

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
                  <div className="mb-3 flex items-center gap-2"><ArrowUpRight size={16} /><h4 className="text-sm font-semibold">主要拉抬</h4></div>
                  <div className="space-y-2">
                    {positive.map((row) => (
                      <button
                        key={row.symbol}
                        onClick={() => onOpenStock?.(`${row.venue}:${row.symbol}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-black/[.025] dark:hover:bg-white/[.035]"
                      >
                        <span className="min-w-0">
                          <strong className="block truncate text-sm">{row.symbol} · {row.name}</strong>
                          <span className="text-[11px] text-black/38 dark:text-white/38">權重 {row.weightPct.toFixed(2)}% · 當日 {fmtPct(row.changePct)}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <strong className="block text-sm tabular-nums">{fmtPoint(row.contributionPctPoints)}</strong>
                          {result.heldEtfValueTwd > 0 ? <span className="text-[10px] text-black/35 dark:text-white/35">約 NT$ {Math.round(row.estimatedHoldingImpactTwd).toLocaleString()}</span> : null}
                        </span>
                      </button>
                    ))}
                    {!positive.length ? <p className="text-xs text-black/38 dark:text-white/38">目前沒有可辨識的正向成份貢獻。</p> : null}
                  </div>
                </div>

                <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
                  <div className="mb-3 flex items-center gap-2"><ArrowDownRight size={16} /><h4 className="text-sm font-semibold">主要拖累</h4></div>
                  <div className="space-y-2">
                    {negative.map((row) => (
                      <button
                        key={row.symbol}
                        onClick={() => onOpenStock?.(`${row.venue}:${row.symbol}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-black/[.025] dark:hover:bg-white/[.035]"
                      >
                        <span className="min-w-0">
                          <strong className="block truncate text-sm">{row.symbol} · {row.name}</strong>
                          <span className="text-[11px] text-black/38 dark:text-white/38">權重 {row.weightPct.toFixed(2)}% · 當日 {fmtPct(row.changePct)}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <strong className="block text-sm tabular-nums">{fmtPoint(row.contributionPctPoints)}</strong>
                          {result.heldEtfValueTwd > 0 ? <span className="text-[10px] text-black/35 dark:text-white/35">約 NT$ {Math.round(row.estimatedHoldingImpactTwd).toLocaleString()}</span> : null}
                        </span>
                      </button>
                    ))}
                    {!negative.length ? <p className="text-xs text-black/38 dark:text-white/38">目前沒有可辨識的負向成份貢獻。</p> : null}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
            <Card>
              <CardContent>
                <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Constituents</p>
                <h3 className="mt-1 font-semibold">成份股與 ETF 的關聯</h3>
                <div className="mt-4 space-y-2">
                  {sortedConstituents.slice(0, 10).map((item, index) => (
                    <div key={`${item.market}:${item.symbol}:${index}`} className="flex items-center gap-3 rounded-xl border border-black/5 px-3 py-2 dark:border-white/6">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-black/[.04] text-[11px] font-semibold dark:bg-white/[.06]">{index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">{item.symbol} · {item.name}</strong>
                        <span className="text-[11px] text-black/38 dark:text-white/38">{item.sector || "未分類"} · {item.market}</span>
                      </span>
                      <strong className="shrink-0 text-sm tabular-nums">{item.weightPct.toFixed(2)}%</strong>
                    </div>
                  ))}
                </div>
                {sortedConstituents.length > 10 ? (
                  <details className="group mt-3 rounded-xl border border-black/6 dark:border-white/7">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between px-3 text-xs font-semibold text-black/50 dark:text-white/50">
                      查看全部 {sortedConstituents.length} 檔成份股
                      <span className="text-[11px] font-normal">前 10 大已顯示</span>
                    </summary>
                    <div className="space-y-2 border-t border-black/5 p-3 dark:border-white/6">
                      {sortedConstituents.slice(10).map((item, index) => (
                        <div key={`${item.market}:${item.symbol}:all:${index}`} className="flex items-center gap-3 rounded-xl border border-black/5 px-3 py-2 dark:border-white/6">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-black/[.04] text-[11px] font-semibold dark:bg-white/[.06]">{index + 11}</span>
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-sm">{item.symbol} · {item.name}</strong>
                            <span className="text-[11px] text-black/38 dark:text-white/38">{item.sector || "未分類"} · {item.market}</span>
                          </span>
                          <strong className="shrink-0 text-sm tabular-nums">{item.weightPct.toFixed(2)}%</strong>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Sector weights</p>
                <h3 className="mt-1 font-semibold">產業權重</h3>
                <div className="mt-4 space-y-3">
                  {result.sectorWeights.slice(0, 12).map((sector) => (
                    <div key={sector.sector}>
                      <div className="mb-1.5 flex justify-between gap-3 text-xs"><span>{sector.sector}</span><strong>{sector.weightPct.toFixed(1)}%</strong></div>
                      <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/8"><div className="h-full rounded-full bg-[#456b58]" style={{ width: `${Math.min(100, sector.weightPct)}%` }} /></div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>

          <EtfDeepAnalysis composition={selected} compositions={[...compositions, ...compositionHistory]} quotes={quotes} />

          <Card>
            <CardContent>
              <InfoDisclosure summary="資料邊界與官方來源">
                成份資料來源：{selected.sourceName} · 資料日 {selected.asOf}。目前每日歸因只涵蓋可唯一比對的台股成份；US 成份股尚未接免費且授權清楚的日行情來源。估算報酬也不含基金現金、期貨、借券、費用、匯率與申贖影響，因此不能當成官方 ETF NAV 報酬。
              </InfoDisclosure>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
