"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, RefreshCw } from "lucide-react";
import type { AppState, EtfComposition } from "@/lib/types";
import { analyzeEtf } from "@/lib/etf-research";
import { loadBundledTwQuotes, type TwQuoteCache } from "@/lib/market-data";
import { Badge, Card, CardContent, GhostButton } from "./ui";
import { EtfDeepAnalysis } from "./etf-deep-analysis";

const framework = [
  {
    title: "1. 指數／策略規則",
    standard: "規則公開、可重現、知道何時納入／剔除／再平衡；規則不透明就先視為資料不足。",
    auto: false
  },
  {
    title: "2. 總成本",
    standard: "同類 ETF 比總費用率、交易成本與稅負；廣泛市值型若年成本明顯高於同類，需要能解釋差異。",
    auto: false
  },
  {
    title: "3. 流動性與買賣價差",
    standard: "常態價差 ≤0.2% 可視為流動性佳；0.2–0.5% 需注意；>0.5% 下單成本可能明顯。",
    auto: false
  },
  {
    title: "4. 追蹤品質",
    standard: "看 tracking difference 與 tracking error；廣泛指數 ETF 若長期偏離指數 >0.5% 或波動式偏離，需查原因。",
    auto: false
  },
  {
    title: "5. 成份資料完整度",
    standard: "權重覆蓋 ≥95% 才適合做穿透分析；80–95% 僅部分可信；<80% 不應用來下完整曝險結論。",
    auto: true
  },
  {
    title: "6. 單一成份股集中度",
    standard: "產品規則：單一持股 <10% 低；10–20% 中；20–30% 高；>30% 非常集中。",
    auto: true
  },
  {
    title: "7. Top 10／HHI 集中度",
    standard: "產品規則：Top 10 <40% 較分散；40–60% 中度集中；>60% 高集中。HHI 越高，代表有效持股數越少。",
    auto: true
  },
  {
    title: "8. 產業集中度",
    standard: "最大產業 <30% 較分散；30–50% 明顯偏重；>50% 幾乎可視為產業／主題型曝險。",
    auto: true
  },
  {
    title: "9. 與自己持股的重疊",
    standard: "ETF 成份與直接持股重疊 <20% 較低；20–40% 中度；>40% 要確認是不是重複押同一批公司。",
    auto: true
  },
  {
    title: "10. 成份股基本面與再平衡",
    standard: "不要只看 ETF 名稱；逐一看主要成份股營收、獲利、估值、財務品質與再平衡後是否出現風格漂移。",
    auto: false
  }
] as const;

function compositionKey(composition: EtfComposition) {
  return `${composition.etfMarket}:${composition.etfSymbol.trim().toUpperCase()}`;
}

function fmtPct(value: number, digits = 2) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function fmtPoint(value: number, digits = 3) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}pt`;
}

function metricTone(value: number, goodMax: number, warnMax: number) {
  if (value <= goodMax) return "good" as const;
  if (value <= warnMax) return "warn" as const;
  return "neutral" as const;
}

export function EtfResearch({
  state,
  onOpenStock
}: {
  state: AppState;
  onOpenStock?: (researchKey: string) => void;
}) {
  const [quotes, setQuotes] = useState<TwQuoteCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoteError, setQuoteError] = useState("");
  const heldEtfKeys = useMemo(
    () => new Set(
      state.holdings
        .filter((holding) => holding.type === "etf")
        .map((holding) => `${holding.market}:${holding.symbol.trim().toUpperCase()}`)
    ),
    [state.holdings]
  );
  const compositions = useMemo(
    () => [...state.etfCompositions].sort((a, b) => {
      const aHeld = heldEtfKeys.has(compositionKey(a)) ? 1 : 0;
      const bHeld = heldEtfKeys.has(compositionKey(b)) ? 1 : 0;
      return bHeld - aHeld || a.etfSymbol.localeCompare(b.etfSymbol);
    }),
    [heldEtfKeys, state.etfCompositions]
  );
  const [selectedKey, setSelectedKey] = useState(() => compositions[0] ? compositionKey(compositions[0]) : "");

  async function reload() {
    setLoading(true);
    setQuoteError("");
    try {
      setQuotes(await loadBundledTwQuotes());
    } catch (cause) {
      setQuotes(null);
      setQuoteError(cause instanceof Error ? cause.message : "無法載入官方台股收盤資料。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void loadBundledTwQuotes()
      .then((cache) => {
        if (!active) return;
        setQuotes(cache);
        setQuoteError("");
      })
      .catch((cause) => {
        if (!active) return;
        setQuoteError(cause instanceof Error ? cause.message : "無法載入官方台股收盤資料。");
      })
      .finally(() => {
        if (active) setLoading(false);
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
            <p className="mt-2 max-w-3xl text-sm leading-6 opacity-70">
              成份權重沿用你匯入的可追溯資料；當日歸因只使用同一最新交易日、可唯一匹配的官方台股收盤漲跌。缺資料不補猜。
            </p>
          </div>
          <GhostButton disabled={loading} onClick={() => void reload()} className="border-white/20 bg-white/10 text-white dark:border-black/10 dark:bg-black/5 dark:text-[#122018]">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {loading ? "讀取行情" : "更新歸因"}
          </GhostButton>
        </div>
      </div>

      {quoteError ? (
        <div className="flex gap-2 rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{quoteError}</span>
        </div>
      ) : null}

      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
        {compositions.map((composition) => {
          const key = compositionKey(composition);
          const active = selected ? compositionKey(selected) === key : false;
          return (
            <button
              key={key}
              onClick={() => setSelectedKey(key)}
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
              <p className="mt-1 text-[11px] text-black/40 dark:text-white/40">成分日 {composition.asOf}</p>
            </button>
          );
        })}
      </div>

      {!selected ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-semibold">目前沒有 ETF 成份資料</p>
            <p className="mt-2 text-xs leading-5 text-black/45 dark:text-white/45">
              先到「投資組合 → ETF 穿透」匯入帶來源與資料日的成份 CSV；ETF 研究不會從名稱猜成份股。
            </p>
          </CardContent>
        </Card>
      ) : null}

      {selected && result ? (
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
                  <p className="mt-2 max-w-3xl text-xs leading-5 text-black/45 dark:text-white/45">
                    估算式：成份權重 × 成份股當日漲跌 = 對 ETF 的近似貢獻百分點。這不是基金公司官方 NAV 歸因，未涵蓋現金、期貨、費用、匯率與未取得行情的成份。
                  </p>
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
                  {sortedConstituents.slice(0, 30).map((item, index) => (
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

          <EtfDeepAnalysis composition={selected} compositions={compositions} quotes={quotes} />

          <Card>
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">ETF selection framework</p>
              <h3 className="mt-1 text-lg font-semibold">10 個挑 ETF 時應該看的面向</h3>
              <p className="mt-2 text-xs leading-5 text-black/45 dark:text-white/45">
                門檻是研究用的初步警示線，不是買賣評分；主題型 ETF 本來就可能高度集中，重點是你是否清楚自己承擔什麼曝險。
              </p>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {framework.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-black/6 p-4 dark:border-white/8">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <Badge tone={item.auto ? "good" : "neutral"}>{item.auto ? "目前可自動看" : "需補資料"}</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-black/45 dark:text-white/45">{item.standard}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="mini-metric"><span>Top 1</span><strong>{result.top1WeightPct.toFixed(1)}%</strong><div className="mt-2"><Badge tone={metricTone(result.top1WeightPct, 10, 20)}>{result.top1WeightPct < 10 ? "低" : result.top1WeightPct < 20 ? "中" : result.top1WeightPct <= 30 ? "高" : "非常集中"}</Badge></div></div>
                <div className="mini-metric"><span>Top 10</span><strong>{result.top10WeightPct.toFixed(1)}%</strong><div className="mt-2"><Badge tone={metricTone(result.top10WeightPct, 40, 60)}>{result.top10WeightPct < 40 ? "較分散" : result.top10WeightPct <= 60 ? "中度集中" : "高度集中"}</Badge></div></div>
                <div className="mini-metric"><span>最大產業</span><strong>{result.topSector ? `${result.topSector.weightPct.toFixed(1)}%` : "—"}</strong><div className="mt-2"><Badge tone={metricTone(result.topSector?.weightPct ?? 0, 30, 50)}>{(result.topSector?.weightPct ?? 0) <= 30 ? "較分散" : (result.topSector?.weightPct ?? 0) <= 50 ? "偏重" : "高度集中"}</Badge></div></div>
                <div className="mini-metric"><span>直接持股重疊</span><strong>{result.directPortfolioOverlapWeightPct.toFixed(1)}%</strong><div className="mt-2"><Badge tone={metricTone(result.directPortfolioOverlapWeightPct, 20, 40)}>{result.directPortfolioOverlapWeightPct <= 20 ? "較低" : result.directPortfolioOverlapWeightPct <= 40 ? "中度" : "高度重疊"}</Badge></div></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <p className="text-sm font-semibold">資料邊界</p>
              <p className="mt-2 text-xs leading-5 text-black/45 dark:text-white/45">
                成份資料來源：{selected.sourceName} · 資料日 {selected.asOf}。目前每日歸因只涵蓋可唯一比對的台股成份；US 成份股尚未接免費且授權清楚的日行情來源。估算報酬也不含基金現金、期貨、借券、費用、匯率與申贖影響，因此不能當成官方 ETF NAV 報酬。
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
