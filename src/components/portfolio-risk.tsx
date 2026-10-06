"use client";

import { AlertTriangle, Info, Layers3, ShieldCheck } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AppState } from "@/lib/types";
import { buildPortfolioRiskNotices, calculatePortfolioRisk, portfolioRiskNoticeThresholds, type RiskSlice } from "@/lib/portfolio-risk";
import { money } from "@/lib/utils";
import { Badge, Card, CardContent, InfoDisclosure } from "./ui";

function pct(value: number) {
  return `${value.toFixed(2)}%`;
}

function ExposureRow({ label, valueTwd, portfolioPct, helper }: {
  label: string;
  valueTwd: number;
  portfolioPct: number;
  helper?: string;
}) {
  const width = Math.max(0, Math.min(portfolioPct, 100));
  return (
    <div className="rounded-2xl border border-black/6 p-3.5 dark:border-white/8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{label}</p>
          {helper ? <p className="mt-1 text-xs text-black/40 dark:text-white/40">{helper}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">{pct(portfolioPct)}</p>
          <p className="mt-1 text-xs text-black/35 dark:text-white/35">{money(valueTwd)}</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/8">
        <div className="h-full rounded-full bg-[#486b58] dark:bg-[#a8c4b2]" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function SliceList({ rows, empty }: { rows: RiskSlice[]; empty: string }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-black/40 dark:text-white/40">{empty}</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <ExposureRow key={row.key} label={row.label} valueTwd={row.valueTwd} portfolioPct={row.portfolioPct} />
      ))}
    </div>
  );
}

function CompanyExposureChart({
  rows,
  portfolioValueTwd
}: {
  rows: ReturnType<typeof calculatePortfolioRisk>["companyExposures"];
  portfolioValueTwd: number;
}) {
  const data = rows.slice(0, 8).map((row) => ({
    label: row.symbol,
    directPct: portfolioValueTwd > 0 ? row.directValueTwd / portfolioValueTwd * 100 : 0,
    implicitPct: portfolioValueTwd > 0 ? row.implicitValueTwd / portfolioValueTwd * 100 : 0
  }));

  if (!data.length) return null;

  return (
    <div className="mt-4 h-[250px] w-full" aria-label="前八大公司真實曝險百分比圖">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(value) => Number(value).toFixed(0) + "%"} />
          <YAxis dataKey="label" type="category" width={54} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: "rgba(69,107,88,.07)" }}
            formatter={(value, name) => [Number(value).toFixed(2) + "%", name === "directPct" ? "直接持股" : "ETF 隱含"]}
          />
          <Bar dataKey="directPct" stackId="company" fill="#456b58" radius={[5, 0, 0, 5]} />
          <Bar dataKey="implicitPct" stackId="company" fill="#9b8063" radius={[0, 5, 5, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PortfolioRisk({ state }: { state: AppState }) {
  const risk = calculatePortfolioRisk(state.holdings, state.etfCompositions, state.usdTwd);
  const notices = buildPortfolioRiskNotices(risk);

  return (
    <div className="space-y-4 md:space-y-6">
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#edf2ee] text-[#335b46] dark:bg-[#17201b] dark:text-[#a8dab8]">
                <ShieldCheck size={19} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Portfolio Risk · Local-first</p>
                <h3 className="mt-1 text-xl font-semibold">曝險與集中度</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50 dark:text-white/50">
                  先看穿透後真正集中在哪些公司與產業；未解析 ETF 保留為未知，不硬猜。
                </p>
              </div>
            </div>
            <Badge tone={risk.riskCoveragePct >= 99.999 ? "good" : "warn"}>證券曝險覆蓋 {pct(risk.riskCoveragePct)}</Badge>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">最大單一公司</p><p className="mt-2 text-xl font-semibold">{risk.largestCompany ? pct(risk.largestCompany.portfolioPct) : "—"}</p><p className="mt-1 text-xs text-black/35 dark:text-white/35">{risk.largestCompany ? `${risk.largestCompany.name} · ${money(risk.largestCompany.totalValueTwd)}` : "沒有已解析公司曝險"}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">Top 5 公司合計</p><p className="mt-2 text-xl font-semibold">{pct(risk.top5CompanyPct)}</p><p className="mt-1 text-xs text-black/35 dark:text-white/35">完整投資組合為分母</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">最大產業</p><p className="mt-2 text-xl font-semibold">{risk.largestSector ? pct(risk.largestSector.portfolioPct) : "—"}</p><p className="mt-1 text-xs text-black/35 dark:text-white/35">{risk.largestSector?.label ?? "沒有已解析產業曝險"}</p></CardContent></Card>
        <Card><CardContent><p className="text-xs text-black/40 dark:text-white/40">未解析 ETF</p><p className="mt-2 text-xl font-semibold">{pct(risk.unresolvedEtfPct)}</p><p className="mt-1 text-xs text-black/35 dark:text-white/35">{money(risk.unresolvedEtfValueTwd)} 不做推估</p></CardContent></Card>
      </section>


      <Card>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Risk Notices</p>
              <h3 className="mt-1 font-semibold">集中度與重複曝險提醒</h3>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-black/42 dark:text-white/42">
                用固定產品閾值把值得檢查的曝險先浮上來；這些是注意提示，不是買賣建議或個人化風險評級。
              </p>
            </div>
            <Badge tone={notices.some((notice) => notice.severity === "attention") ? "warn" : "good"}>
              {notices.length ? `${notices.length} 項提醒` : "沒有觸發提醒"}
            </Badge>
          </div>

          {notices.length ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {notices.map((notice) => {
                const attention = notice.severity === "attention";
                const Icon = attention ? AlertTriangle : Info;
                return (
                  <div
                    key={notice.id}
                    className={attention
                      ? "rounded-2xl border border-[#b98b57]/22 bg-[#f5ece1]/65 p-3.5 dark:border-[#b98b57]/18 dark:bg-[#2a2117]/65"
                      : "rounded-2xl border border-black/6 bg-black/[.018] p-3.5 dark:border-white/8 dark:bg-white/[.025]"}
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon size={16} className={attention ? "mt-0.5 shrink-0 text-[#8b6538] dark:text-[#e0bd8c]" : "mt-0.5 shrink-0 text-black/35 dark:text-white/35"} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{notice.title}</p>
                        <p className="mt-1 text-xs leading-5 text-black/48 dark:text-white/48">{notice.detail}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-[#6c8c79]/20 bg-[#edf2ee] px-4 py-3 text-sm text-[#335b46] dark:border-[#6c8c79]/18 dark:bg-[#17201b] dark:text-[#a8dab8]">
              目前沒有超過 PortfolioPilot 的集中度注意閾值，也沒有偵測到達門檻的直接持股＋ETF 重複曝險。
            </div>
          )}

          <InfoDisclosure summary="提醒閾值怎麼設定" className="mt-3">
            最大單一公司 ≥ {portfolioRiskNoticeThresholds.largestCompanyPct}%、
            前五大公司 ≥ {portfolioRiskNoticeThresholds.top5CompanyPct}%、
            最大產業 ≥ {portfolioRiskNoticeThresholds.largestSectorPct}%、
            直接＋ETF 的同一公司總曝險 ≥ {portfolioRiskNoticeThresholds.duplicateCompanyPct}% 時顯示注意提醒。
            未解析 ETF ≥ {portfolioRiskNoticeThresholds.unresolvedEtfPct}% 或證券曝險覆蓋低於 {portfolioRiskNoticeThresholds.riskCoveragePct}% 時則另外顯示資料完整度提醒。
          </InfoDisclosure>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Company Concentration</p>
                <h3 className="mt-1 font-semibold">公司曝險</h3>
              </div>
              <Layers3 size={18} className="text-black/30 dark:text-white/30" />
            </div>
            {risk.companyExposures.length ? (
              <>
                <CompanyExposureChart rows={risk.companyExposures} portfolioValueTwd={risk.portfolioValueTwd} />
                <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-black/42 dark:text-white/42">
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#456b58]" />直接持股</span>
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#9b8063]" />ETF 隱含</span>
                </div>
                <div className="mt-4 space-y-2.5">
                  {risk.companyExposures.slice(0, 8).map((exposure) => (
                    <ExposureRow
                      key={`${exposure.market}:${exposure.symbol}`}
                      label={exposure.name}
                      valueTwd={exposure.totalValueTwd}
                      portfolioPct={exposure.portfolioPct}
                      helper={`${exposure.symbol} · 直接 ${money(exposure.directValueTwd)} / ETF ${money(exposure.implicitValueTwd)}`}
                    />
                  ))}
                </div>
                {risk.companyExposures.length > 8 ? (
                  <InfoDisclosure summary={`查看其餘 ${risk.companyExposures.length - 8} 個公司曝險`} className="mt-3">
                    <div className="space-y-2.5">
                      {risk.companyExposures.slice(8).map((exposure) => (
                        <ExposureRow
                          key={`${exposure.market}:${exposure.symbol}:more`}
                          label={exposure.name}
                          valueTwd={exposure.totalValueTwd}
                          portfolioPct={exposure.portfolioPct}
                          helper={`${exposure.symbol} · 直接 ${money(exposure.directValueTwd)} / ETF ${money(exposure.implicitValueTwd)}`}
                        />
                      ))}
                    </div>
                  </InfoDisclosure>
                ) : null}
              </>
            ) : <p className="py-8 text-center text-sm text-black/40 dark:text-white/40">目前沒有已解析的公司曝險。</p>}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Sector Exposure</p>
              <h3 className="mt-1 font-semibold">產業曝險</h3>
              <div className="mt-4"><SliceList rows={risk.sectorExposures.slice(0, 12)} empty="目前沒有可分類的產業曝險。" /></div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40 dark:text-white/40">Market Exposure</p>
              <h3 className="mt-1 font-semibold">市場／地區曝險</h3>
              <div className="mt-4"><SliceList rows={risk.marketExposures} empty="目前沒有可分類的市場曝險。" /></div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardContent>
          <h3 className="font-semibold">集中度摘要</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="mini-metric"><span>Resolved company HHI</span><strong>{risk.resolvedCompanyHhi === null ? "—" : risk.resolvedCompanyHhi.toFixed(0)}</strong></div>
            <div className="mini-metric"><span>等效公司數</span><strong>{risk.effectiveCompanyCount === null ? "—" : risk.effectiveCompanyCount.toFixed(2)}</strong></div>
            <div className="mini-metric"><span>Top 3 產業</span><strong>{pct(risk.top3SectorPct)}</strong></div>
            <div className="mini-metric"><span>現金</span><strong>{pct(risk.cashPct)}</strong></div>
          </div>
          <InfoDisclosure summary="HHI 與覆蓋率怎麼解讀" className="mt-4">
            HHI 只對已解析的公司曝險計算，範圍 0–10,000，數字越高代表已解析部位越集中；它不是投資建議或風險評級。已解析公司曝險 {money(risk.resolvedCompanyValueTwd)}（占總資產 {pct(risk.resolvedCompanyPct)}），證券投資部位 {money(risk.investedValueTwd)}，未解析 ETF {money(risk.unresolvedEtfValueTwd)}。未解析 ETF 與現金不會被硬塞進公司 HHI。
          </InfoDisclosure>
        </CardContent>
      </Card>
    </div>
  );
}
