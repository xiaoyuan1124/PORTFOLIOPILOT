"use client";

import { useEffect, useState } from "react";
import type { AppState } from "@/lib/types";
import { ActivityLedger } from "./activity-ledger";
import { AllocationTargets } from "./allocation-targets";
import { DividendCenter } from "./dividend-center";
import { EtfLookThrough } from "./etf-lookthrough";
import { HoldingsPanel } from "./holdings";
import { PortfolioRisk } from "./portfolio-risk";
import { Performance } from "./performance";

export type PortfolioTab = "holdings" | "lookthrough" | "risk" | "targets" | "dividends" | "activity" | "performance";

const tabs: Array<{ key: PortfolioTab; label: string }> = [
  { key: "holdings", label: "持股" },
  { key: "lookthrough", label: "ETF 穿透" },
  { key: "risk", label: "風險曝險" },
  { key: "targets", label: "配置目標" },
  { key: "dividends", label: "股息" },
  { key: "activity", label: "交易／現金流" },
  { key: "performance", label: "績效" }
];

export function Portfolio({
  state,
  onChange,
  onResearch,
  requestedTab,
  requestId = 0
}: {
  state: AppState;
  onChange: (state: AppState) => boolean;
  onResearch?: (researchKey: string) => void;
  requestedTab?: PortfolioTab;
  requestId?: number;
}) {
  const [tab, setTab] = useState<PortfolioTab>(requestedTab ?? "holdings");

  useEffect(() => {
    if (requestedTab) setTab(requestedTab);
  }, [requestId, requestedTab]);

  return (
    <div className="space-y-4">
      <div className="inline-flex max-w-full overflow-x-auto rounded-2xl border border-black/6 bg-white/70 p-1 dark:border-white/8 dark:bg-white/4">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`min-h-10 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition ${tab === item.key ? "bg-[#1f332a] text-white shadow-sm dark:bg-[#dce9e2] dark:text-[#122018]" : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "holdings" ? <HoldingsPanel state={state} onChange={onChange} onResearch={onResearch} /> : null}
      {tab === "lookthrough" ? <EtfLookThrough state={state} onChange={onChange} /> : null}
      {tab === "risk" ? <PortfolioRisk state={state} /> : null}
      {tab === "targets" ? <AllocationTargets state={state} onChange={onChange} /> : null}
      {tab === "dividends" ? <DividendCenter state={state} /> : null}
      {tab === "activity" ? <ActivityLedger state={state} onChange={onChange} /> : null}
      {tab === "performance" ? <Performance state={state} /> : null}
    </div>
  );
}
