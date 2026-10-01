"use client";

import { useMemo, useState } from "react";
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
type ResearchArea = "security" | "market" | "strategy" | "notes";

const areas: Array<{ key: ResearchArea; label: string; defaultTab: ResearchTab }> = [
  { key: "security", label: "標的", defaultTab: "snapshot" },
  { key: "market", label: "市場", defaultTab: "materialEvents" },
  { key: "strategy", label: "策略", defaultTab: "scanner" },
  { key: "notes", label: "筆記", defaultTab: "journal" }
];

const tabsByArea: Record<ResearchArea, Array<{ key: ResearchTab; label: string }>> = {
  security: [
    { key: "snapshot", label: "標的總覽" },
    { key: "etf", label: "ETF 深度" }
  ],
  market: [
    { key: "materialEvents", label: "持股重訊" },
    { key: "sectorPulse", label: "族群脈動" },
    { key: "revenue", label: "公司營收" },
    { key: "valuation", label: "市場估值" }
  ],
  strategy: [
    { key: "scanner", label: "選股 Scanner" }
  ],
  notes: [
    { key: "journal", label: "投資筆記" }
  ]
};

function areaForTab(tab: ResearchTab): ResearchArea {
  if (tab === "snapshot" || tab === "etf") return "security";
  if (tab === "materialEvents" || tab === "sectorPulse" || tab === "revenue" || tab === "valuation") return "market";
  if (tab === "scanner") return "strategy";
  return "notes";
}

export function Research({ state, onChange, researchKey, researchType }: { state: AppState; onChange: (state: AppState) => boolean; researchKey?: string; researchType?: "stock" | "etf" }) {
  const [tab, setTab] = useState<ResearchTab>(researchType === "etf" ? "etf" : "snapshot");
  const [snapshotKey, setSnapshotKey] = useState(researchKey);
  const [snapshotRequestId, setSnapshotRequestId] = useState(0);
  const area = useMemo(() => areaForTab(tab), [tab]);

  function openStockFromEtf(key: string) {
    setSnapshotKey(key);
    setSnapshotRequestId((value) => value + 1);
    setTab("snapshot");
  }

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
