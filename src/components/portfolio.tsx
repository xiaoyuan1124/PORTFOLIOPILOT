"use client";

import { useMemo, useState } from "react";
import type { AppState } from "@/lib/types";
import type { HoldingLookupCandidate } from "@/lib/holding-autofill";
import { ActivityLedger } from "./activity-ledger";
import { AllocationTargets } from "./allocation-targets";
import { DividendCenter } from "./dividend-center";
import { EtfLookThrough } from "./etf-lookthrough";
import { HoldingsPanel } from "./holdings";
import { PortfolioRisk } from "./portfolio-risk";
import { Performance } from "./performance";

export type PortfolioTab = "holdings" | "lookthrough" | "risk" | "targets" | "dividends" | "activity" | "performance";
type PortfolioArea = "overview" | "activity" | "performance" | "planning";

const areas: Array<{ key: PortfolioArea; label: string; defaultTab: PortfolioTab }> = [
  { key: "overview", label: "總覽", defaultTab: "holdings" },
  { key: "activity", label: "活動", defaultTab: "activity" },
  { key: "performance", label: "績效", defaultTab: "performance" },
  { key: "planning", label: "規劃", defaultTab: "targets" }
];

const tabsByArea: Record<PortfolioArea, Array<{ key: PortfolioTab; label: string }>> = {
  overview: [
    { key: "holdings", label: "持股" },
    { key: "lookthrough", label: "ETF 穿透" },
    { key: "risk", label: "風險曝險" }
  ],
  activity: [
    { key: "activity", label: "交易／現金流" },
    { key: "dividends", label: "股息" }
  ],
  performance: [
    { key: "performance", label: "績效" }
  ],
  planning: [
    { key: "targets", label: "配置目標" }
  ]
};

function areaForTab(tab: PortfolioTab): PortfolioArea {
  if (tab === "holdings" || tab === "lookthrough" || tab === "risk") return "overview";
  if (tab === "activity" || tab === "dividends") return "activity";
  if (tab === "performance") return "performance";
  return "planning";
}

export function Portfolio({
  state,
  onChange,
  onResearch,
  requestedTab,
  requestedHoldingCandidate
}: {
  state: AppState;
  onChange: (state: AppState) => boolean;
  onResearch?: (researchKey: string, researchType: "stock" | "etf") => void;
  requestedTab?: PortfolioTab;
  requestedHoldingCandidate?: HoldingLookupCandidate;
}) {
  const [tab, setTab] = useState<PortfolioTab>(requestedTab ?? "holdings");
  const area = useMemo(() => areaForTab(tab), [tab]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded-2xl border border-black/6 bg-white/70 p-1 dark:border-white/8 dark:bg-white/4">
        {areas.map((item) => {
          const active = area === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.defaultTab)}
              className={`min-h-11 rounded-xl px-2 text-sm font-semibold transition ${active ? "bg-[#1f332a] text-white shadow-sm dark:bg-[#dce9e2] dark:text-[#122018]" : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tabsByArea[area].length > 1 ? (
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {tabsByArea[area].map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`min-h-9 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition ${tab === item.key ? "border-[#315f49]/25 bg-[#e7f1e9] text-[#245238] dark:border-[#8ec7a3]/25 dark:bg-[#173426] dark:text-[#a9d7b7]" : "border-black/7 bg-white/55 text-black/45 dark:border-white/8 dark:bg-white/4 dark:text-white/45"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "holdings" ? <HoldingsPanel state={state} onChange={onChange} onResearch={onResearch} requestedCandidate={requestedHoldingCandidate} /> : null}
      {tab === "lookthrough" ? <EtfLookThrough state={state} onChange={onChange} /> : null}
      {tab === "risk" ? <PortfolioRisk state={state} /> : null}
      {tab === "targets" ? <AllocationTargets state={state} onChange={onChange} /> : null}
      {tab === "dividends" ? <DividendCenter state={state} /> : null}
      {tab === "activity" ? <ActivityLedger state={state} onChange={onChange} /> : null}
      {tab === "performance" ? <Performance state={state} /> : null}
    </div>
  );
}
