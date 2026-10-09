"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, FileText, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { localDateKey } from "@/lib/calc";
import { accountName, downloadText } from "@/lib/local-data";
import { loadBundledTwQuotes, type TwQuoteCache } from "@/lib/market-data";
import {
  buildPortfolioReport,
  portfolioReportToCsv,
  portfolioReportToMarkdown
} from "@/lib/portfolio-report";
import type { AppState } from "@/lib/types";
import { money } from "@/lib/utils";
import { Badge, Button, Card, CardContent, CardHeader, GhostButton, InfoDisclosure } from "./ui";

function pct(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

export function PortfolioReportView({ state }: { state: AppState }) {
  const [quotes, setQuotes] = useState<TwQuoteCache | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [loading, setLoading] = useState(true);
  const asOf = localDateKey();
  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => localDateKey().slice(0, 7));
  const accountOptions = useMemo(
    () => [...new Set([
      ...state.holdings.map((holding) => accountName(holding.account)),
      ...state.activities.map((activity) => accountName(activity.account))
    ])].sort((a, b) => a.localeCompare(b, "zh-TW")),
    [state.activities, state.holdings]
  );

  async function reloadQuotes() {
    setLoading(true);
    setQuoteError("");
    try {
      setQuotes(await loadBundledTwQuotes());
    } catch (cause) {
      setQuotes(null);
      setQuoteError(cause instanceof Error ? cause.message : "官方收盤資料暫時不可用。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void loadBundledTwQuotes()
      .then((value) => {
        if (!active) return;
        setQuotes(value);
        setQuoteError("");
      })
      .catch((cause) => {
        if (!active) return;
        setQuotes(null);
        setQuoteError(cause instanceof Error ? cause.message : "官方收盤資料暫時不可用。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const report = useMemo(
    () => buildPortfolioReport(state, asOf, quotes, {
      account: selectedAccount || null,
      month: selectedMonth
    }),
    [asOf, quotes, state, selectedAccount, selectedMonth]
  );

  function exportCsv() {
    downloadText(
      `portfoliopilot-report-${report.asOf}-${report.monthKey}.csv`,
      portfolioReportToCsv(report),
      "text/csv;charset=utf-8"
    );
    toast.success("投資報告 CSV 已匯出");
  }

  function exportMarkdown() {
    downloadText(
      `portfoliopilot-report-${report.asOf}-${report.monthKey}.md`,
      portfolioReportToMarkdown(report),
      "text/markdown;charset=utf-8"
    );
    toast.success("投資報告 Markdown 已匯出");
  }

  function printReport() {
    window.print();
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #portfolio-report-print, #portfolio-report-print * { visibility: visible !important; }
          #portfolio-report-print {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
          }
          #portfolio-report-actions, #portfolio-report-filters { display: none !important; }
          #portfolio-report-print .dark\\:text-white\\/45,
          #portfolio-report-print .dark\\:text-white\\/40,
          #portfolio-report-print .dark\\:text-white\\/35 { color: rgba(0,0,0,.55) !important; }
        }
      `}</style>

      <div id="portfolio-report-print" className="space-y-4 md:space-y-6">
        <Card>
          <CardContent>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Portfolio Report · Local-first</p>
                <h2 className="mt-1 text-xl font-semibold">投資組合報告</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50 dark:text-white/50">
                  以目前本機持股、交易紀錄、績效邊界與可用官方收盤資料產生。沒有後端，也不把缺資料補成推估值。
                </p>
              </div>
              <div id="portfolio-report-actions" className="flex flex-wrap gap-2">
                <GhostButton disabled={loading} onClick={() => void reloadQuotes()}>
                  <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                  {loading ? "同步中" : "重讀官方價"}
                </GhostButton>
                <Button onClick={exportCsv}><Download size={15} />CSV</Button>
                <GhostButton onClick={exportMarkdown}><FileText size={15} />Markdown</GhostButton>
                <GhostButton onClick={printReport}><Printer size={15} />列印／另存 PDF</GhostButton>
              </div>
            </div>
            <div id="portfolio-report-filters" className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="min-w-0 text-xs font-semibold">
                帳戶範圍
                <select
                  value={selectedAccount}
                  onChange={(event) => setSelectedAccount(event.target.value)}
                  className="field mt-2 min-h-11 w-full min-w-0"
                >
                  <option value="">全部帳戶</option>
                  {accountOptions.map((account) => (
                    <option key={account} value={account}>{account}</option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs font-semibold">
                活動月份
                <input
                  type="month"
                  max={asOf.slice(0, 7)}
                  value={selectedMonth}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(next) && next <= asOf.slice(0, 7)) {
                      setSelectedMonth(next);
                    }
                  }}
                  className="field mt-2 min-h-11 w-full min-w-0"
                />
              </label>
            </div>
            <p className="mt-3 text-xs leading-5 text-black/50 dark:text-white/50">
              目前持股、市值、風險與最新交易日影響一律使用現有持倉；月份只篩選該月交易及現金流。
              {report.scope.account
                ? " 單一帳戶沒有完整的個別淨值／現金流邊界，因此不顯示全組合的 TWR、TWR Proxy 或 XIRR。"
                : " 績效指標為截至報告日的全組合結果，不是所選月份的單月報酬。"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge>帳戶 {report.scope.account ?? "全部"}</Badge>
              <Badge>活動 {report.monthKey}</Badge>
              <Badge>持倉估值 {report.scope.valuationAsOf}</Badge>
              <Badge tone={report.performance.exactTwrStatus === "exact" ? "good" : "warn"}>
                Exact TWR {report.performance.exactTwrStatus === "exact" ? "可用" : "資料不足"}
              </Badge>
              <Badge tone={quoteError ? "warn" : "neutral"}>
                {quoteError ? "日行情未納入" : report.daily ? `行情 ${report.daily.date}` : "等待可比較行情"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {quoteError ? (
          <div className="flex gap-2 rounded-2xl border border-[#b98b57]/25 bg-[#f5ece1] p-4 text-sm text-[#6f4c26] dark:border-[#b98b57]/20 dark:bg-[#2a2117] dark:text-[#e0bd8c]">
            <AlertTriangle size={17} className="mt-0.5 shrink-0" />
            <span>{quoteError} 報告其他區塊仍可正常產生。</span>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">總資產淨值</p><strong className="mt-2 block text-xl">{money(report.summary.totalTwd)}</strong><p className="mt-1 text-xs text-black/35 dark:text-white/35">成本 {money(report.summary.costTwd)}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">未實現損益</p><strong className="mt-2 block text-xl">{money(report.summary.unrealizedGainTwd)}</strong><p className="mt-1 text-xs text-black/35 dark:text-white/35">{pct(report.summary.unrealizedGainPct)}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">現金水位</p><strong className="mt-2 block text-xl">{money(report.summary.cashTwd)}</strong><p className="mt-1 text-xs text-black/35 dark:text-white/35">{pct(report.summary.cashPct)}</p></CardContent></Card>
          <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">證券曝險覆蓋</p><strong className="mt-2 block text-xl">{pct(report.risk.riskCoveragePct)}</strong><p className="mt-1 text-xs text-black/35 dark:text-white/35">未解析 ETF 不硬猜</p></CardContent></Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><h3 className="font-semibold">{report.scope.performanceIsPortfolioWide ? "全組合績效（截至報告日）" : "帳戶績效（資料不足）"}</h3></CardHeader>
            <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
              <div className="mini-metric"><span>Exact TWR</span><strong>{pct(report.performance.exactTwrPct)}</strong><small className="mt-1 block font-normal text-black/35 dark:text-white/35">{report.performance.exactTwrStartDate ? `${report.performance.exactTwrStartDate} 起` : report.performance.exactTwrStatus}</small></div>
              <div className="mini-metric"><span>TWR Proxy</span><strong>{pct(report.performance.twrProxyPct)}</strong><small className="mt-1 block font-normal text-black/35 dark:text-white/35">Modified Dietz</small></div>
              <div className="mini-metric"><span>XIRR</span><strong>{pct(report.performance.xirrPct)}</strong><small className="mt-1 block font-normal text-black/35 dark:text-white/35">資金加權年化</small></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h3 className="font-semibold">{report.monthKey} 活動</h3></CardHeader>
            <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
              <div className="mini-metric"><span>入金 / 出金</span><strong>{money(report.month.depositsTwd)} / {money(report.month.withdrawalsTwd)}</strong></div>
              <div className="mini-metric"><span>股息 / 獨立費用</span><strong>{money(report.month.dividendsTwd)} / {money(report.month.standaloneFeesTwd)}</strong></div>
              <div className="mini-metric"><span>買進 / 賣出</span><strong>{report.month.buyCount} / {report.month.sellCount} 筆</strong></div>
              <div className="mini-metric"><span>該月活動總數</span><strong>{report.month.activityCount} 筆</strong></div>
            </CardContent>
          </Card>
        </section>

        {report.daily ? (
          <Card>
            <CardHeader><h3 className="font-semibold">最新交易日持倉影響 · {report.daily.date}</h3></CardHeader>
            <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
              <div className="mini-metric"><span>淨影響估算</span><strong>{money(report.daily.totalImpactTwd)}</strong><small className="mt-1 block font-normal text-black/35 dark:text-white/35">{report.daily.matchedHoldings}/{report.daily.eligibleHoldings} 檔納入</small></div>
              <div className="mini-metric"><span>最大推升</span><strong>{report.daily.topPositive ? `${report.daily.topPositive.symbol} · ${money(report.daily.topPositive.impactTwd)}` : "—"}</strong><small className="mt-1 block font-normal text-black/35 dark:text-white/35">{report.daily.topPositive?.name ?? "沒有正貢獻"}</small></div>
              <div className="mini-metric"><span>最大拖累</span><strong>{report.daily.topNegative ? `${report.daily.topNegative.symbol} · ${money(report.daily.topNegative.impactTwd)}` : "—"}</strong><small className="mt-1 block font-normal text-black/35 dark:text-white/35">{report.daily.topNegative?.name ?? "沒有負貢獻"}</small></div>
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
          <Card>
            <CardHeader><h3 className="font-semibold">最大持股</h3></CardHeader>
            <CardContent className="space-y-2 pt-4">
              {report.topHoldings.length ? report.topHoldings.map((holding, index) => (
                <div key={`${holding.symbol}:${holding.account}:${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-black/6 px-3 py-2.5 dark:border-white/8">
                  <span className="min-w-0"><strong className="block truncate text-sm">{index + 1}. {holding.symbol} · {holding.name}</strong><span className="text-xs text-black/38 dark:text-white/38">{holding.account} · {money(holding.valueTwd)}</span></span>
                  <strong className="shrink-0 text-sm tabular-nums">{pct(holding.portfolioPct)}</strong>
                </div>
              )) : <p className="py-8 text-center text-sm text-black/40 dark:text-white/40">尚無投資標的。</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h3 className="font-semibold">風險與注意提醒</h3></CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="mini-metric"><span>最大單一公司</span><strong>{report.risk.largestCompany ? `${report.risk.largestCompany.symbol} · ${pct(report.risk.largestCompany.portfolioPct)}` : "—"}</strong></div>
              <div className="mini-metric"><span>最大產業</span><strong>{report.risk.largestSector ? `${report.risk.largestSector.label} · ${pct(report.risk.largestSector.portfolioPct)}` : "—"}</strong></div>
              <div className="mini-metric"><span>Top 5 公司</span><strong>{pct(report.risk.top5CompanyPct)}</strong></div>
              {report.risk.notices.length ? (
                <InfoDisclosure summary={`查看 ${report.risk.notices.length} 項提醒`}>
                  <div className="space-y-2">
                    {report.risk.notices.map((notice) => (
                      <div key={notice.id} className="rounded-xl border border-black/6 p-3 text-xs leading-5 dark:border-white/8">
                        <strong>{notice.title}</strong>
                        <p className="mt-1 text-black/48 dark:text-white/48">{notice.detail}</p>
                      </div>
                    ))}
                  </div>
                </InfoDisclosure>
              ) : <p className="text-xs text-black/40 dark:text-white/40">目前沒有觸發 PortfolioPilot 的集中度注意閾值。</p>}
            </CardContent>
          </Card>
        </section>

        <p className="px-1 text-[11px] leading-5 text-black/35 dark:text-white/35">
          本報告只整理 PortfolioPilot 目前已有的本機資料與官方資料快取；Exact TWR、TWR Proxy、XIRR 與持倉影響各自保留原本定義，不互相冒充。內容不是投資建議。
        </p>
      </div>
    </div>
  );
}
