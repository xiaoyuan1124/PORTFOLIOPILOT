"use client";

import { BarChart3, CircleHelp, Layers3, ShieldCheck } from "lucide-react";
import type { AppState } from "@/lib/types";
import { calculatePortfolioRisk, type RiskSlice } from "@/lib/portfolio-risk";
import { money } from "@/lib/utils";
import { Badge, Card, CardContent } from "./ui";

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

export function PortfolioRisk({ state }: { state: AppState }) {
  const risk = calculatePortfolioRisk(state.holdings, state.etfCompositions, state.usdTwd);

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
                  直接持股與 ETF 已知成分合併計算。未解析 ETF 不會被猜成任何公司、產業或市場；集中度百分比一律以完整投資組合（含現金）為分母。
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
            <div className="mt-4 space-y-2.5">
              {risk.companyExposures.slice(0, 15).map((exposure) => (
                <ExposureRow
                  key={`${exposure.market}:${exposure.symbol}`}
                  label={exposure.name}
                  valueTwd={exposure.totalValueTwd}
                  portfolioPct={exposure.portfolioPct}
                  helper={`${exposure.symbol} · ${exposure.market} · 直接 ${money(exposure.directValueTwd)} / ETF ${money(exposure.implicitValueTwd)}`}
                />
              ))}
              {!risk.companyExposures.length ? <p className="py-8 text-center text-sm text-black/40 dark:text-white/40">目前沒有已解析的公司曝險。</p> : null}
            </div>
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
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><BarChart3 size={18} /><h3 className="font-semibold">集中度數學</h3></div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50 dark:text-white/50">
                HHI 只對「已解析的公司曝險」計算，範圍 0–10,000，數字越高代表已解析部位越集中。它不是投資建議或風險評級；未解析 ETF 與現金不會被硬塞進公司 HHI。
              </p>
            </div>
            <CircleHelp size={18} className="text-black/30 dark:text-white/30" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="mini-metric"><span>Resolved company HHI</span><strong>{risk.resolvedCompanyHhi === null ? "—" : risk.resolvedCompanyHhi.toFixed(0)}</strong></div>
            <div className="mini-metric"><span>等效公司數</span><strong>{risk.effectiveCompanyCount === null ? "—" : risk.effectiveCompanyCount.toFixed(2)}</strong></div>
            <div className="mini-metric"><span>Top 3 產業</span><strong>{pct(risk.top3SectorPct)}</strong></div>
            <div className="mini-metric"><span>現金</span><strong>{pct(risk.cashPct)}</strong></div>
          </div>
          <div className="mt-4 rounded-2xl border border-black/6 p-4 text-xs leading-6 text-black/45 dark:border-white/8 dark:text-white/45">
            已解析公司曝險 {money(risk.resolvedCompanyValueTwd)}（占總資產 {pct(risk.resolvedCompanyPct)}）；證券投資部位 {money(risk.investedValueTwd)}；未解析 ETF {money(risk.unresolvedEtfValueTwd)}。若 ETF 成分資料不完整，先補資料再解讀 HHI 與產業／市場分布。
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
