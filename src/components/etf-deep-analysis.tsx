"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  analyzeEtfAdvanced,
  overlapProductBand,
  sectorProductBand,
  singleHoldingProductBand,
  top10ProductBand,
  type EtfAttributionExclusionReason,
  type EtfProductBand
} from "@/lib/etf-advanced-analysis";
import type { TwQuoteCache } from "@/lib/market-data";
import { loadBundledQuarterlyMargins, type QuarterlyMarginCache } from "@/lib/quarterly-financials";
import { loadBundledRevenueHistory, type RevenueHistoryCache } from "@/lib/revenue-history";
import type { EtfComposition } from "@/lib/types";
import { loadBundledValuations, type ValuationCache } from "@/lib/valuation-data";
import { Badge, Card, CardContent, InfoDisclosure } from "./ui";

type Props = {
  composition: EtfComposition;
  compositions: EtfComposition[];
  quotes: TwQuoteCache;
};

type SourceData = {
  valuations: ValuationCache | null;
  revenueHistory: RevenueHistoryCache | null;
  quarterlyMargins: QuarterlyMarginCache | null;
};

const exclusionLabels: Record<EtfAttributionExclusionReason, string> = {
  unsupported_market: "目前未接此市場免費日行情",
  quote_cache_unavailable: "官方行情快取 unavailable",
  missing_quote: "找不到行情",
  ambiguous_quote: "代號對應不唯一",
  invalid_quote: "行情缺少有效收盤／漲跌",
  different_trading_date: "行情交易日與本次歸因日不同"
};

function pct(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "unavailable";
  return (value >= 0 ? "+" : "") + value.toFixed(digits) + "%";
}

function plain(value: number | null, digits = 2) {
  if (value === null || !Number.isFinite(value)) return "unavailable";
  return value.toFixed(digits);
}

function point(value: number | null, digits = 3) {
  if (value === null || !Number.isFinite(value)) return "unavailable";
  return (value >= 0 ? "+" : "") + value.toFixed(digits) + "pt";
}

function bandLabel(band: EtfProductBand, kind: "single" | "top10" | "sector" | "overlap") {
  if (kind === "single") {
    if (band === "low") return "低";
    if (band === "medium") return "中";
    if (band === "high") return "高";
    return "非常集中";
  }
  if (kind === "top10") return band === "low" ? "較分散" : band === "medium" ? "中度集中" : "高集中";
  if (kind === "sector") return band === "low" ? "較分散" : band === "medium" ? "產業偏重" : "高產業集中";
  return band === "low" ? "較低重疊" : band === "medium" ? "中度重疊" : "高度重複曝險";
}

function ruleTone(band: EtfProductBand) {
  return band === "low" ? "good" as const : band === "medium" ? "neutral" as const : "warn" as const;
}

function coverageLabel(value: number) {
  if (value >= 95) return "高覆蓋";
  if (value >= 80) return "部分覆蓋";
  return "資料不足";
}

function NumberCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
      <p className="text-xs text-black/42 dark:text-white/42">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-5 text-black/38 dark:text-white/38">{helper}</p>
    </div>
  );
}

function SectionTitle({ number, title, status }: { number: number; title: string; status: "available" | "partial" | "unavailable" }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold">{number}. {title}</h4>
      <Badge tone={status === "available" ? "good" : status === "partial" ? "neutral" : "warn"}>
        {status === "available" ? "可分析" : status === "partial" ? "部分資料" : "unavailable"}
      </Badge>
    </div>
  );
}

function TopHoldingsChart({ rows }: { rows: Array<{ symbol: string; name: string; weightPct: number }> }) {
  const data = rows.map((row) => ({
    label: row.symbol,
    name: row.name,
    weightPct: row.weightPct
  }));

  return (
    <div className="mt-4 h-[220px] w-full" aria-label="前八大成份股權重圖">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis dataKey="label" type="category" width={54} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: "rgba(69,107,88,.07)" }}
            formatter={(value) => [Number(value).toFixed(2) + "%", "權重"]}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="weightPct" fill="#456b58" radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function WeightChangeChart({ rows }: { rows: Array<{ symbol: string; name: string; changePctPoints: number }> }) {
  const data = rows.slice(0, 8).map((row) => ({
    label: row.symbol,
    name: row.name,
    changePctPoints: row.changePctPoints
  }));

  if (!data.length) return null;

  return (
    <div className="mt-3 h-[230px] w-full" aria-label="ETF 成份權重變化圖">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(value) => (Number(value) >= 0 ? "+" : "") + Number(value).toFixed(1)} />
          <YAxis dataKey="label" type="category" width={54} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
          <ReferenceLine x={0} stroke="rgba(127,127,127,.45)" />
          <Tooltip
            cursor={{ fill: "rgba(69,107,88,.07)" }}
            formatter={(value) => [(Number(value) >= 0 ? "+" : "") + Number(value).toFixed(3) + "pt", "權重變化"]}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="changePctPoints" radius={[4, 4, 4, 4]}>
            {data.map((row) => <Cell key={row.label} fill={row.changePctPoints >= 0 ? "#456b58" : "#9a624f"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EtfDeepAnalysis({ composition, compositions, quotes }: Props) {
  const [sourceData, setSourceData] = useState<SourceData>({
    valuations: null,
    revenueHistory: null,
    quarterlyMargins: null
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      loadBundledValuations(),
      loadBundledRevenueHistory(),
      loadBundledQuarterlyMargins()
    ]).then((results) => {
      if (!active) return;
      setSourceData({
        valuations: results[0]?.status === "fulfilled" ? results[0].value : null,
        revenueHistory: results[1]?.status === "fulfilled" ? results[1].value : null,
        quarterlyMargins: results[2]?.status === "fulfilled" ? results[2].value : null
      });
      setLoaded(true);
    });
    return () => { active = false; };
  }, []);

  const analysis = useMemo(
    () => analyzeEtfAdvanced(composition, compositions, { quotes, ...sourceData }),
    [composition, compositions, quotes, sourceData]
  );

  const top10Band = top10ProductBand(analysis.top10WeightPct);
  const singleBand = singleHoldingProductBand(analysis.top1WeightPct);
  const topSector = analysis.sectorWeights[0] ?? null;
  const sectorBand = sectorProductBand(topSector?.weightPct ?? 0);
  const snapshotDates = useMemo(() => [...new Set(
    [composition, ...compositions]
      .filter((item) =>
        item.etfMarket === composition.etfMarket &&
        item.etfSymbol.trim().toUpperCase() === composition.etfSymbol.trim().toUpperCase()
      )
      .map((item) => item.asOf)
  )].sort((a, b) => b.localeCompare(a)), [composition, compositions]);
  const addedRows = analysis.weightChanges.filter((row) => row.changeType === "added");
  const removedRows = analysis.weightChanges.filter((row) => row.changeType === "removed");
  const weightMovementRows = analysis.weightChanges.filter((row) =>
    row.changeType === "increased" || row.changeType === "decreased"
  );
  const changedRows = analysis.weightChanges.filter((row) => row.changeType !== "unchanged");
  const topConstituents = useMemo(
    () => [...composition.constituents].sort((a, b) => b.weightPct - a.weightPct).slice(0, 8),
    [composition.constituents]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">ETF Analysis V0.80</p>
          <h3 className="mt-1 text-lg font-semibold">先看結構，再深入細節</h3>
          <p className="mt-2 text-xs leading-5 text-black/45 dark:text-white/45">先用圖表與關鍵數字抓重點；完整口徑、門檻與資料限制需要時再展開。</p>
          <InfoDisclosure summary="分析口徑與資料邊界" className="mt-3">
            PortfolioPilot 的門檻只描述 ETF 結構與資料完整度，不是買賣建議或投資評級。加權數據會保留覆蓋率；缺資料維持 unavailable，不以 0 補值。
          </InfoDisclosure>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardContent>
            <SectionTitle number={1} title="成份股結構" status="available" />
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <NumberCard label="成份股數" value={String(analysis.constituentCount)} helper={"權重覆蓋 " + analysis.compositionCoveragePct.toFixed(1) + "%"} />
              <NumberCard label="Top 1" value={analysis.top1WeightPct.toFixed(1) + "%"} helper="最大單一成份" />
              <NumberCard label="Top 5" value={analysis.top5WeightPct.toFixed(1) + "%"} helper="前五大合計" />
              <NumberCard label="Top 10" value={analysis.top10WeightPct.toFixed(1) + "%"} helper="前十大合計" />
            </div>
            <TopHoldingsChart rows={topConstituents} />
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-black/42 dark:text-white/42">
              <span>前 8 大成份 · 權重 %</span>
              <span>{composition.asOf}</span>
            </div>
            <div className="mt-3 rounded-2xl border border-black/6 p-3 dark:border-white/8">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold">歷史快照與成份異動／調倉線索</p>
                  <p className="mt-1 text-[11px] text-black/40 dark:text-white/40">
                    已保存 {snapshotDates.length} 個資料日{snapshotDates.length > 1 ? ` · ${snapshotDates.at(-1)} → ${snapshotDates[0]}` : ""}
                  </p>
                </div>
                {analysis.previousCompositionAsOf ? <Badge tone="good">可比較前一期</Badge> : <Badge>等待下一期</Badge>}
              </div>

              {analysis.previousCompositionAsOf ? (
                <>
                  <p className="mt-3 text-xs">本期 {composition.asOf} 對比前一期 {analysis.previousCompositionAsOf}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <NumberCard label="新增成份" value={String(analysis.compositionChangeSummary.added)} helper="前期 0% → 本期有權重" />
                    <NumberCard label="刪除成份" value={String(analysis.compositionChangeSummary.removed)} helper="前期有權重 → 本期 0%" />
                    <NumberCard label="權重上升" value={String(analysis.compositionChangeSummary.increased)} helper="兩期皆存在且權重增加" />
                    <NumberCard label="權重下降" value={String(analysis.compositionChangeSummary.decreased)} helper="兩期皆存在且權重減少" />
                  </div>

                  {addedRows.length || removedRows.length ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl bg-black/[.025] p-3 dark:bg-white/[.035]">
                        <p className="text-xs font-semibold">新增成份股</p>
                        <div className="mt-2 space-y-1">
                          {addedRows.length ? addedRows.map((row) => (
                            <div key={row.market + ":" + row.symbol} className="flex justify-between gap-3 text-xs">
                              <span className="truncate">{row.symbol} · {row.name}</span>
                              <strong className="shrink-0 tabular-nums">{row.currentWeightPct.toFixed(2)}%</strong>
                            </div>
                          )) : <p className="text-[11px] text-black/38 dark:text-white/38">本期沒有新增成份。</p>}
                        </div>
                      </div>
                      <div className="rounded-xl bg-black/[.025] p-3 dark:bg-white/[.035]">
                        <p className="text-xs font-semibold">刪除成份股</p>
                        <div className="mt-2 space-y-1">
                          {removedRows.length ? removedRows.map((row) => (
                            <div key={row.market + ":" + row.symbol} className="flex justify-between gap-3 text-xs">
                              <span className="truncate">{row.symbol} · {row.name}</span>
                              <strong className="shrink-0 tabular-nums">{row.previousWeightPct.toFixed(2)}% → 0%</strong>
                            </div>
                          )) : <p className="text-[11px] text-black/38 dark:text-white/38">本期沒有刪除成份。</p>}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 rounded-xl bg-black/[.025] p-3 dark:bg-white/[.035]">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold">權重變化最大</p>
                      <span className="text-[10px] text-black/35 dark:text-white/35">百分點</span>
                    </div>
                    {weightMovementRows.length ? <WeightChangeChart rows={weightMovementRows} /> : <p className="mt-2 text-[11px] text-black/38 dark:text-white/38">兩期共同成份的權重沒有變化。</p>}
                  </div>

                  {changedRows.length > 8 ? (
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer font-semibold">查看全部 {changedRows.length} 筆成份變化</summary>
                      <div className="mt-2 space-y-1">
                        {changedRows.map((row) => (
                          <div key={row.market + ":" + row.symbol} className="flex justify-between gap-3">
                            <span className="truncate">{row.symbol} · {row.name} · {row.changeType}</span>
                            <span className="shrink-0 tabular-nums">{row.previousWeightPct.toFixed(2)}% → {row.currentWeightPct.toFixed(2)}% · {point(row.changePctPoints)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}

                  <InfoDisclosure summary="如何解讀權重變化" className="mt-3">
                    權重上升／下降只是兩個官方快照的權重差，可能來自成份股價格相對變動，不等同基金真的買進／賣出；新增／刪除則代表兩期公開成份集合不同。
                  </InfoDisclosure>
                </>
              ) : (
                <p className="mt-3 text-xs leading-5 text-black/38 dark:text-white/38">
                  已開始保存官方歷史快照；目前只有一個資料日，等下一個不同 as-of 的官方快照出現後，就會自動顯示新增、刪除與權重變化。
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle number={2} title="集中度" status="available" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <NumberCard label="HHI" value={analysis.hhi.toFixed(0)} helper="權重平方和，越高越集中" />
              <NumberCard label="有效持股數" value={analysis.effectiveHoldingCount.toFixed(1)} helper="10000 / HHI" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={ruleTone(top10Band)}>{bandLabel(top10Band, "top10")}</Badge>
              <span className="text-black/45 dark:text-white/45">Top 10 {analysis.top10WeightPct.toFixed(1)}%</span>
            </div>
            <InfoDisclosure summary="集中度門檻" className="mt-3">
              Top 10 &lt;40% 描述為較分散；40–60% 為中度集中；&gt;60% 為高集中。HHI 與有效持股數用來補充觀察整體權重分布。
            </InfoDisclosure>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle number={3} title="產業曝險" status="available" />
            <div className="mt-4 space-y-3">
              {analysis.sectorWeights.slice(0, 8).map((row) => (
                <div key={row.sector}>
                  <div className="mb-1 flex justify-between gap-3 text-xs"><span>{row.sector}</span><strong>{row.weightPct.toFixed(1)}%</strong></div>
                  <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/8"><div className="h-full rounded-full bg-[#456b58]" style={{ width: Math.min(100, row.weightPct) + "%" }} /></div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={ruleTone(sectorBand)}>{bandLabel(sectorBand, "sector")}</Badge>
              <span className="text-black/45 dark:text-white/45">{topSector ? topSector.sector + " " + topSector.weightPct.toFixed(1) + "%" : "—"}</span>
            </div>
            <InfoDisclosure summary="產業集中門檻" className="mt-3">
              單一產業權重超過 50% 時描述為高產業集中。這是結構描述，不代表該產業未來表現。
            </InfoDisclosure>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle number={4} title="單一公司風險" status="available" />
            <p className="mt-4 text-xl font-semibold">{analysis.topHolding ? analysis.topHolding.symbol + " · " + analysis.topHolding.name : "—"}</p>
            <p className="mt-1 text-sm">{analysis.top1WeightPct.toFixed(1)}% 權重</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={ruleTone(singleBand)}>{bandLabel(singleBand, "single")}</Badge>
            </div>
            <InfoDisclosure summary="單一公司集中門檻" className="mt-3">
              &lt;10% 描述為低；10–20% 為中；20–30% 為高；&gt;30% 為非常集中。
            </InfoDisclosure>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle number={5} title="成份股品質" status="partial" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <NumberCard label="加權營收 YoY" value={pct(analysis.revenueYoY.value)} helper={"覆蓋 " + analysis.revenueYoY.coveredWeightPct.toFixed(1) + "% · " + (analysis.revenueYoY.asOf ?? "unavailable")} />
              <NumberCard label="加權毛利率" value={pct(analysis.grossMargin.value)} helper={"覆蓋 " + analysis.grossMargin.coveredWeightPct.toFixed(1) + "% · " + (analysis.grossMargin.asOf ?? "unavailable")} />
              <NumberCard label="毛利率改善占比" value={pct(analysis.grossMarginImprovingSharePct)} helper={"可比較權重 " + analysis.grossMarginTrendCoveredWeightPct.toFixed(1) + "%"} />
              <NumberCard label="資料邊界" value={loaded ? "partial" : "loading"} helper="EPS / ROE / 自由現金流 / 負債：目前 bundled 官方資料不足" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle number={6} title="估值" status="partial" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <NumberCard label="加權 P/E" value={plain(analysis.weightedPe.value)} helper={"覆蓋 " + analysis.weightedPe.coveredWeightPct.toFixed(1) + "%"} />
              <NumberCard label="加權 P/B" value={plain(analysis.weightedPb.value)} helper={"覆蓋 " + analysis.weightedPb.coveredWeightPct.toFixed(1) + "%"} />
              <NumberCard label="盈餘殖利率" value={pct(analysis.earningsYieldPct.value)} helper={"覆蓋 " + analysis.earningsYieldPct.coveredWeightPct.toFixed(1) + "%"} />
              <NumberCard label="股利殖利率" value={pct(analysis.dividendYieldPct.value)} helper={"覆蓋 " + analysis.dividendYieldPct.coveredWeightPct.toFixed(1) + "%"} />
            </div>
            <InfoDisclosure summary="估值怎麼計算" className="mt-3">
              只聚合可唯一匹配的官方台股估值資料；沒有資料的成份不進分母，並保留實際覆蓋權重。
            </InfoDisclosure>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle number={7} title="ETF 動能" status="unavailable" />
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-black/[.025] p-4 text-sm dark:bg-white/[.035]">
              <Info size={17} className="mt-0.5 shrink-0 text-black/35 dark:text-white/35" />
              <div>
                <p className="font-semibold">等待歷史行情資料</p>
                <p className="mt-1 text-xs leading-5 text-black/45 dark:text-white/45">1M、3M、6M、1Y、RS、Max Drawdown 會在可追溯免費歷史行情接入後顯示。</p>
              </div>
            </div>
            <InfoDisclosure summary="目前為什麼不計算" className="mt-3">{analysis.momentumUnavailableReason}</InfoDisclosure>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle number={8} title="ETF ↔ 成份股今日漲跌貢獻" status="available" />
            <InfoDisclosure summary="今日歸因計算方式" className="mt-3">
              依 {composition.asOf} 成份權重估算；Contribution ≈ weight × constituent daily return。這是 PortfolioPilot 的透明估算，不是基金公司正式 attribution。
            </InfoDisclosure>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <NumberCard label="官方 ETF 今日報酬" value={pct(analysis.officialEtfDailyReturnPct)} helper={analysis.officialEtfQuoteDate ?? "unavailable"} />
              <NumberCard label="已涵蓋成份估算" value={pct(analysis.estimatedCoveredReturnPct)} helper={"行情日 " + (analysis.attributionDate ?? "unavailable")} />
              <NumberCard label="歸因 coverage" value={analysis.attributionCoveredWeightPct.toFixed(1) + "%"} helper={coverageLabel(analysis.attributionCoveredWeightPct)} />
              <NumberCard label="官方－估算 residual" value={point(analysis.attributionResidualPctPoints)} helper="可能含未覆蓋成份、現金、期貨、費用、匯率與基金結構差異" />
            </div>
            {analysis.attributionUnimportedWeightPct > 0 ? <p className="mt-3 text-xs text-[#8b6538] dark:text-[#d4ad7c]">尚未匯入成份權重約 {analysis.attributionUnimportedWeightPct.toFixed(1)}%。</p> : null}
            {analysis.attributionExclusions.length ? (
              <div className="mt-3 rounded-2xl border border-[#b98b57]/20 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold"><AlertTriangle size={14} />未納入本次歸因的已匯入成份</p>
                <div className="mt-2 space-y-1">
                  {analysis.attributionExclusions.slice(0, 12).map((row) => (
                    <div key={row.market + ":" + row.symbol} className="flex justify-between gap-3 text-[11px] leading-5">
                      <span className="min-w-0 truncate">{row.symbol} · {row.name} · {exclusionLabels[row.reason]}{row.quoteDate ? " (" + row.quoteDate + ")" : ""}</span>
                      <strong className="shrink-0">{row.weightPct.toFixed(2)}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle number={9} title="成份股相關性／ETF 重疊" status={analysis.overlapComparisons.length ? "available" : "unavailable"} />
            {analysis.overlapComparisons.length ? (
              <div className="mt-4 space-y-3">
                {analysis.overlapComparisons.slice(0, 6).map((row) => {
                  const band = overlapProductBand(row.overlapWeightPct);
                  return (
                    <div key={row.etfMarket + ":" + row.etfSymbol} className="rounded-2xl border border-black/6 p-3 dark:border-white/8">
                      <div className="flex items-start justify-between gap-3">
                        <span><strong className="block text-sm">{row.etfSymbol} · {row.etfName}</strong><span className="text-[11px] text-black/38 dark:text-white/38">成份日 {row.asOf} · 共同 {row.sharedCount} 檔</span></span>
                        <span className="text-right"><strong className="block">{row.overlapWeightPct.toFixed(1)}%</strong><Badge tone={ruleTone(band)}>{bandLabel(band, "overlap")}</Badge></span>
                      </div>
                      {row.topShared.length ? <p className="mt-2 text-[11px] text-black/40 dark:text-white/40">主要重疊：{row.topShared.slice(0, 5).map((item) => item.symbol + " " + item.overlapWeightPct.toFixed(1) + "%").join(" · ")}</p> : null}
                    </div>
                  );
                })}
                <InfoDisclosure summary="重疊率如何解讀">
                  overlap &gt;70% 描述為高度重複曝險。這裡比較的是成份持股重疊，不代表兩檔 ETF 的歷史績效相關係數。
                </InfoDisclosure>
              </div>
            ) : (
              <p className="mt-4 text-xs text-black/42 dark:text-white/42">unavailable：至少需要另一檔 ETF 的 composition 才能比較。</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <SectionTitle number={10} title="ETF 結構與追蹤品質" status="partial" />
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between gap-3"><span>Composition as-of</span><strong>{composition.asOf}</strong></div>
              <div className="flex justify-between gap-3"><span>成份來源類型</span><strong>{composition.sourceType}</strong></div>
              <div className="flex items-center justify-between gap-3"><span>來源</span><a className="inline-flex items-center gap-1 font-semibold underline underline-offset-2" href={composition.sourceUrl} target="_blank" rel="noreferrer">{composition.sourceName}<ExternalLink size={12} /></a></div>
              {["費用率", "基金規模 AUM", "成交量／買賣價差", "折溢價", "追蹤誤差", "指數規則", "換股頻率", "配息／累積型態"].map((label) => (
                <div key={label} className="flex justify-between gap-3 border-t border-black/5 pt-2 dark:border-white/6"><span>{label}</span><strong className="text-black/35 dark:text-white/35">unavailable</strong></div>
              ))}
            </div>
            <InfoDisclosure summary="為什麼部分欄位 unavailable" className="mt-3">
              目前 repo 沒有可追溯且穩定更新的免費官方欄位，因此不猜數字；只有找到可驗證公開來源才會接入。
            </InfoDisclosure>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
