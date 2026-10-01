"use client";

import { useMemo, useRef } from "react";
import { Database, Download, ExternalLink, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { AppState, EtfComposition } from "@/lib/types";
import { calculateEtfLookThrough } from "@/lib/etf-lookthrough";
import { localDateKey } from "@/lib/calc";
import {
  downloadText,
  etfCompositionCsvTemplate,
  etfCompositionsToCsv,
  mergeEtfCompositions,
  parseEtfCompositionCsv
} from "@/lib/local-data";
import { money } from "@/lib/utils";
import { Badge, Button, Card, CardContent, GhostButton } from "./ui";

function compositionKey(composition: EtfComposition) {
  return `${composition.etfMarket}:${composition.etfSymbol.toUpperCase()}`;
}

function coverageStatus(status: "covered" | "partial" | "insufficient") {
  if (status === "covered") return <Badge tone="good">可穿透</Badge>;
  if (status === "partial") return <Badge tone="warn">部分資料</Badge>;
  return <Badge>資料不足</Badge>;
}

export function EtfLookThrough({ state, onChange }: { state: AppState; onChange: (state: AppState) => boolean }) {
  const importRef = useRef<HTMLInputElement>(null);
  const result = useMemo(
    () => calculateEtfLookThrough(state.holdings, state.etfCompositions, state.usdTwd),
    [state.holdings, state.etfCompositions, state.usdTwd]
  );
  const heldEtfs = state.holdings.filter((holding) => holding.type === "etf");

  async function importComposition(file?: File) {
    if (!file) return;
    try {
      const incoming = parseEtfCompositionCsv(await file.text());
      const merged = mergeEtfCompositions(state.etfCompositions, incoming);
      if (!onChange({ ...state, etfCompositions: merged })) return;
      toast.success(`已匯入 ${incoming.length} 檔 ETF 成分資料`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ETF 成分 CSV 格式不正確");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  function removeComposition(market: "TW" | "US", symbol: string) {
    const key = `${market}:${symbol.toUpperCase()}`;
    if (!window.confirm(`移除 ${symbol} 的 ETF 成分資料？持股本身不會被刪除。`)) return;
    if (!onChange({
      ...state,
      etfCompositions: state.etfCompositions.filter((composition) => compositionKey(composition) !== key)
    })) return;
    toast.success("ETF 成分資料已移除");
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">ETF Look-through · Local-first</p>
              <h3 className="mt-1 text-xl font-semibold">直接持股＋ETF 隱含曝險</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50 dark:text-white/50">
                支援的持有台灣 ETF 會在「更新市場資料」時自動套用可追溯的官方發行人成份；CSV 保留作為尚未支援 ETF 的手動補充。沒有成份資料的 ETF 仍會標示「資料不足」，缺失權重不會被自動放大。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => importRef.current?.click()}><Upload size={16} />匯入成分 CSV</Button>
              <GhostButton onClick={() => downloadText("portfoliopilot-etf-composition-template.csv", etfCompositionCsvTemplate(), "text/csv;charset=utf-8")}><FileSpreadsheet size={16} />空白範本</GhostButton>
              {state.etfCompositions.length ? (
                <GhostButton onClick={() => downloadText(
                  `portfoliopilot-etf-compositions-${localDateKey()}.csv`,
                  etfCompositionsToCsv(state.etfCompositions),
                  "text/csv;charset=utf-8"
                )}><Download size={16} />匯出成分</GhostButton>
              ) : null}
              <input ref={importRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void importComposition(event.target.files?.[0])} />
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">ETF 市值</p><p className="mt-2 text-xl font-semibold">{money(result.etfValueTwd)}</p><p className="mt-1 text-xs text-black/35 dark:text-white/35">{heldEtfs.length} 檔持有 ETF</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">已穿透 ETF 市值</p><p className="mt-2 text-xl font-semibold">{money(result.coveredEtfValueTwd)}</p><p className="mt-1 text-xs text-black/35 dark:text-white/35">依實際成分權重計算</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">ETF 資料覆蓋</p><p className="mt-2 text-xl font-semibold">{result.etfCoveragePct.toFixed(1)}%</p><p className="mt-1 text-xs text-black/35 dark:text-white/35">不將缺失權重正規化</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">未解析 ETF 曝險</p><p className="mt-2 text-xl font-semibold">{money(result.unresolvedEtfValueTwd)}</p><p className="mt-1 text-xs text-black/35 dark:text-white/35">缺資料或成分未滿 100%</p></CardContent></Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Combined Exposure</p>
                <h3 className="mt-1 font-semibold">公司層級實際曝險</h3>
              </div>
              <Database size={18} className="text-black/30 dark:text-white/30" />
            </div>
            <div className="mt-4 space-y-3">
              {result.exposures.slice(0, 30).map((exposure) => (
                <details key={`${exposure.market}:${exposure.symbol}`} className="rounded-2xl border border-black/6 dark:border-white/8">
                  <summary className="cursor-pointer list-none p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{exposure.name}</p>
                          <span className="text-xs text-black/40 dark:text-white/40">{exposure.symbol} · {exposure.market}</span>
                        </div>
                        <p className="mt-1 text-xs text-black/40 dark:text-white/40">{exposure.sector}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{exposure.portfolioPct.toFixed(2)}%</p>
                        <p className="mt-1 text-xs text-black/35 dark:text-white/35">{money(exposure.totalValueTwd)}</p>
                      </div>
                    </div>
                  </summary>
                  <div className="border-t border-black/6 p-4 dark:border-white/8">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="mini-metric"><span>直接持股</span><strong>{money(exposure.directValueTwd)}</strong></div>
                      <div className="mini-metric"><span>ETF 隱含</span><strong>{money(exposure.implicitValueTwd)}</strong></div>
                    </div>
                    {exposure.contributions.length ? (
                      <div className="mt-3 space-y-2">
                        {exposure.contributions.map((contribution, index) => (
                          <div key={`${contribution.etfMarket}:${contribution.etfSymbol}:${index}`} className="rounded-xl bg-black/[0.025] p-3 text-xs dark:bg-white/[0.035]">
                            <div className="flex flex-wrap justify-between gap-2">
                              <span className="font-medium">來自 {contribution.etfSymbol} · 權重 {contribution.weightPct.toFixed(4)}%</span>
                              <span className="tabular-nums">{money(contribution.valueTwd)}</span>
                            </div>
                            <p className="mt-1 text-black/40 dark:text-white/40">資料日 {contribution.asOf}</p>
                            <a href={contribution.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-black/50 underline underline-offset-2 dark:text-white/50">
                              {contribution.sourceName}<ExternalLink size={10} />
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </details>
              ))}
              {!result.exposures.length ? <p className="py-10 text-center text-sm text-black/40 dark:text-white/40">目前沒有可計算的公司曝險。</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">ETF Data Coverage</p>
            <h3 className="mt-1 font-semibold">持有 ETF 的成分資料</h3>
            <div className="mt-4 space-y-3">
              {result.etfs.map((etf) => (
                <div key={`${etf.market}:${etf.symbol}`} className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{etf.name}</p><span className="text-xs text-black/40 dark:text-white/40">{etf.symbol}</span></div>
                      <p className="mt-1 text-xs text-black/40 dark:text-white/40">ETF 市值 {money(etf.valueTwd)}</p>
                    </div>
                    {coverageStatus(etf.status)}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="mini-metric"><span>成分權重覆蓋</span><strong>{etf.compositionCoveragePct.toFixed(2)}%</strong></div>
                    <div className="mini-metric"><span>未解析</span><strong>{money(etf.unresolvedValueTwd)}</strong></div>
                  </div>

                  {etf.sourceName && etf.sourceUrl && etf.asOf ? (
                    <div className="mt-3 text-xs leading-5 text-black/45 dark:text-white/45">
                      <p>資料日：{etf.asOf}</p>
                      <a href={etf.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                        匯入來源：{etf.sourceName}<ExternalLink size={10} />
                      </a>
                      <div className="mt-2">
                        <GhostButton className="min-h-9 h-9 px-3 text-xs" onClick={() => removeComposition(etf.market, etf.symbol)}><Trash2 size={13} />移除成分資料</GhostButton>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-black/45 dark:text-white/45">
                      目前沒有可追溯的成份資料。先按「更新市場資料」嘗試官方自動同步；若此 ETF 尚未支援，可再用 CSV 手動補充。
                    </p>
                  )}
                </div>
              ))}
              {!result.etfs.length ? <p className="py-10 text-center text-sm text-black/40 dark:text-white/40">目前持股沒有 ETF。</p> : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent>
          <p className="text-sm font-semibold">目前計算邊界</p>
          <p className="mt-2 text-sm leading-6 text-black/50 dark:text-white/50">
            此版只做一層 ETF 穿透，不遞迴拆解「ETF 裡的 ETF」。權重直接使用來源數值，不做補足或重估。官方自動同步與 CSV 手動匯入都會保留來源與資料日；抓取失敗時保留既有資料，不會把缺值當成 0。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
