"use client";

import { useMemo, useState } from "react";
import type { AppState } from "@/lib/types";
import type { HoldingLookupCandidate } from "@/lib/holding-autofill";
import { CompanySnapshotResearch } from "./company-snapshot-research";
import { MaterialEventsResearch } from "./material-events-research";
import { RevenueResearch } from "./revenue-research";
import { ValuationResearch } from "./valuation-research";
import { Scanner } from "./scanner";
import { SectorPulseResearch } from "./sector-pulse-research";
import { Journal } from "./journal";
import { EtfResearch } from "./etf-research";
import { Watchlist } from "./watchlist";
import { DecisionScanner } from "./decision-scanner";
import { Star,ChartNoAxesCombined,ScanSearch,Search,Layers3,FileText,TrendingUp,Scale,FlaskConical } from "lucide-react";

export type ResearchTab = "snapshot" | "etf" | "materialEvents" | "sectorPulse" | "revenue" | "valuation" | "watchlist" | "scanner" | "journal";
type ResearchArea = "security" | "market" | "strategy" | "notes";

const areas: Array<{ key: ResearchArea; label: string; defaultTab: ResearchTab }> = [
  { key: "security", label: "標的", defaultTab: "snapshot" },
  { key: "market", label: "市場", defaultTab: "materialEvents" },
  { key: "strategy", label: "選股", defaultTab: "watchlist" },
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
    { key: "watchlist", label: "自選清單" },
    { key: "scanner", label: "選股 Scanner" }
  ],
  notes: [
    { key: "journal", label: "投資筆記" }
  ]
};

function areaForTab(tab: ResearchTab): ResearchArea {
  if (tab === "snapshot" || tab === "etf") return "security";
  if (tab === "materialEvents" || tab === "sectorPulse" || tab === "revenue" || tab === "valuation") return "market";
  if (tab === "watchlist" || tab === "scanner") return "strategy";
  return "notes";
}

export function Research({
  state,
  onChange,
  researchKey,
  researchType,
  onAddHolding,
  onQuantResearch,
  requestedTab,
  workbench=false,
  onOpenLab,
  onOpenRecords,
  onOpenSecurity,
  onOpenExplore
}: {
  state: AppState;
  onChange: (state: AppState) => boolean;
  researchKey?: string;
  researchType?: "stock" | "etf";
  onAddHolding?: (candidate: HoldingLookupCandidate) => void;
  onQuantResearch?: (key: string) => void;
  requestedTab?:ResearchTab;
  workbench?:boolean;
  onOpenLab?:()=>void;
  onOpenRecords?:()=>void;
  onOpenSecurity?:(key:string,type:"stock"|"etf")=>void;
  onOpenExplore?:()=>void;
}) {
  const [tab, setTab] = useState<ResearchTab>(requestedTab??(researchType === "etf" ? "etf" : "snapshot"));
  const [snapshotKey, setSnapshotKey] = useState(researchKey);
  const [snapshotRequestId, setSnapshotRequestId] = useState(0);
  const [etfRequestedSymbol, setEtfRequestedSymbol] = useState<string | undefined>(
    researchType === "etf" && researchKey ? researchKey.split(":").at(-1) : undefined
  );
  const area = useMemo(() => areaForTab(tab), [tab]);

  function openStockFromEtf(key: string) {
    if(workbench&&onOpenSecurity){onOpenSecurity(key,"stock");return;}
    setSnapshotKey(key);
    setSnapshotRequestId((value) => value + 1);
    setTab("snapshot");
  }

  function openFromWatchlist(key: string, type: "stock" | "etf") {
    if(workbench&&onOpenSecurity){onOpenSecurity(key,type);return;}
    if (type === "etf") {
      setEtfRequestedSymbol(key.split(":").at(-1));
      setTab("etf");
      return;
    }
    setSnapshotKey(key);
    setSnapshotRequestId((value) => value + 1);
    setTab("snapshot");
  }

  const tools=[{key:"sectorPulse",label:"產業強弱",icon:TrendingUp},{key:"scanner",label:"選股 Scanner",icon:ScanSearch},{key:"snapshot",label:"個股研究",icon:Search},{key:"etf",label:"ETF 深度",icon:Layers3},{key:"materialEvents",label:"持股重訊",icon:FileText},{key:"revenue",label:"公司營收",icon:ChartNoAxesCombined},{key:"valuation",label:"市場估值",icon:Scale}] as const;
  return (
    <div className="space-y-4">
      {workbench&&requestedTab==="watchlist"?<div className="flex items-center gap-2 text-sm opacity-75"><Star size={16}/>管理自選股票與 ETF，或批次檢查買進條件。</div>:null}
      {workbench&&requestedTab==="journal"?<button type="button" className="min-h-11 text-sm font-medium" onClick={onOpenRecords}>← 返回交易紀錄</button>:null}
      {workbench&&researchKey&&onOpenExplore?<button type="button" className="min-h-11 text-sm font-medium" onClick={onOpenExplore}>← 返回上一區</button>:null}
      {workbench&&!researchKey&&requestedTab!=="watchlist"&&requestedTab!=="journal"?<div className="workbench-tools" role="group" aria-label="探索工具">
        {tools.map(item=><button key={item.key} type="button" aria-pressed={tab===item.key} onClick={()=>setTab(item.key)}><item.icon size={17}/><span>{item.label}</span></button>)}
        {onOpenLab?<button type="button" onClick={onOpenLab}><FlaskConical size={17}/><span>策略實驗室</span></button>:null}
      </div>:null}
      {!workbench?<div className="grid grid-cols-4 gap-1 rounded-2xl border border-black/6 bg-white/70 p-1 dark:border-white/8 dark:bg-white/4">
        {areas.map((item) => {
          const active = area === item.key;
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.defaultTab)}
              aria-pressed={active}
              className={`min-h-11 rounded-xl px-2 text-sm font-semibold transition ${active ? "bg-[#1f332a] text-white shadow-sm dark:bg-[#dce9e2] dark:text-[#122018]" : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>:null}

      {!workbench&&tabsByArea[area].length > 1 ? (
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {tabsByArea[area].map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
              className={`min-h-11 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition ${tab === item.key ? "border-[#315f49]/25 bg-[#e7f1e9] text-[#245238] dark:border-[#8ec7a3]/25 dark:bg-[#173426] dark:text-[#a9d7b7]" : "border-black/7 bg-white/55 text-black/45 dark:border-white/8 dark:bg-white/4 dark:text-white/45"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "snapshot" ? <CompanySnapshotResearch key={snapshotRequestId} state={state} requestedKey={snapshotKey} onQuantResearch={onQuantResearch} onChange={onChange} workbench={workbench} /> : null}
      {tab === "etf" ? <EtfResearch key={etfRequestedSymbol ?? "default"} state={state} onOpenStock={openStockFromEtf} requestedSymbol={etfRequestedSymbol} /> : null}
      {tab === "materialEvents" ? <MaterialEventsResearch state={state} /> : null}
      {tab === "sectorPulse" ? <SectorPulseResearch state={state} /> : null}
      {tab === "revenue" ? <RevenueResearch state={state} /> : null}
      {tab === "valuation" ? <ValuationResearch state={state} /> : null}
      {tab === "watchlist" ? <><Watchlist state={state} onChange={onChange} onOpenResearch={openFromWatchlist} onAddHolding={onAddHolding} workbench={workbench}/>{workbench?<DecisionScanner key={(state.watchlist??[]).map(w=>w.venue+":"+w.symbol).sort().join("|")} state={state} onOpenStock={openStockFromEtf} defaultScope="watch" trackChanges/>:null}</> : null}
      {tab === "scanner" ? <Scanner state={state} onOpenStock={openStockFromEtf} /> : null}
      {tab === "journal" ? <Journal state={state} onChange={onChange} /> : null}
    </div>
  );
}
