"use client";

import { useState } from "react";
import type { AppState } from "@/lib/types";
import { CompanySnapshotResearch } from "./company-snapshot-research";
import { MaterialEventsResearch } from "./material-events-research";
import { RevenueResearch } from "./revenue-research";
import { ValuationResearch } from "./valuation-research";
import { Scanner } from "./scanner";
import { SectorPulseResearch } from "./sector-pulse-research";
import { Journal } from "./journal";
import { EtfResearch } from "./etf-research";

type ResearchTab = "snapshot" | "etf" | "materialEvents" | "sectorPulse" | "revenue" | "valuation" | "scanner" | "journal";

export function Research({ state, onChange, researchKey }: { state: AppState; onChange: (state: AppState) => boolean; researchKey?: string }) {
  const [tab, setTab] = useState<ResearchTab>("snapshot");
  const [snapshotKey, setSnapshotKey] = useState(researchKey);
  const [snapshotRequestId, setSnapshotRequestId] = useState(0);

  function openStockFromEtf(key: string) {
    setSnapshotKey(key);
    setSnapshotRequestId((value) => value + 1);
    setTab("snapshot");
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex max-w-full overflow-x-auto rounded-2xl border border-black/6 bg-white/70 p-1 dark:border-white/8 dark:bg-white/4">
        {[
          ["snapshot", "個股總覽"],
          ["etf", "ETF 分析"],
          ["materialEvents", "持股重訊"],
          ["sectorPulse", "族群脈動"],
          ["revenue", "官方營收"],
          ["valuation", "官方估值"],
          ["scanner", "策略 Scanner"],
          ["journal", "投資筆記"]
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as ResearchTab)}
            className={`min-h-10 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition ${tab === key ? "bg-[#1f332a] text-white shadow-sm dark:bg-[#dce9e2] dark:text-[#122018]" : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "snapshot" ? <CompanySnapshotResearch key={snapshotRequestId} state={state} requestedKey={snapshotKey} /> : null}
      {tab === "etf" ? <EtfResearch state={state} onOpenStock={openStockFromEtf} /> : null}
      {tab === "materialEvents" ? <MaterialEventsResearch state={state} /> : null}
      {tab === "sectorPulse" ? <SectorPulseResearch state={state} /> : null}
      {tab === "revenue" ? <RevenueResearch state={state} /> : null}
      {tab === "valuation" ? <ValuationResearch state={state} /> : null}
      {tab === "scanner" ? <Scanner state={state} /> : null}
      {tab === "journal" ? <Journal state={state} onChange={onChange} /> : null}
    </div>
  );
}
