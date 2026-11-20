"use client";
import {useState} from "react";
import type {EtfComposition} from "@/lib/types";
import {compareEtfCompositions} from "@/lib/etf-overlap";

function key(x:EtfComposition){return `${x.etfMarket}:${x.etfSymbol.toUpperCase()}`;}
export function EtfOverlapCompare({selected,options}:{selected:EtfComposition;options:EtfComposition[]}) {
 const [compareKey,setCompareKey]=useState("");
 const others=options.filter(c=>key(c)!==key(selected));
 const comparison=others.find(c=>key(c)===compareKey)??others[0]??null;
 let overlap:ReturnType<typeof compareEtfCompositions>|null=null,error="";
 if(comparison)try{overlap=compareEtfCompositions(selected,comparison);}catch(e){error=e instanceof Error?e.message:"ETF 成分資料無效";}
 return <details className="rounded-xl border border-black/8 p-2 dark:border-white/10" data-ux-role="etf-overlap-comparison">
  <summary className="min-h-11 cursor-pointer px-2 py-2 text-sm font-semibold">ETF 共同持股與未知權重比較</summary>
  {!comparison?<p className="p-2 text-xs text-black/45 dark:text-white/45">需要至少兩檔具可驗證成分的 ETF 才能比較。</p>:<>
   <label className="mt-2 block text-xs">與哪一檔 ETF 比較？
    <select className="field mt-1 min-h-11 w-full" value={key(comparison)} onChange={e=>setCompareKey(e.target.value)}>
     {others.map(c=><option key={key(c)} value={key(c)}>{c.etfSymbol} · {c.etfName}</option>)}
    </select>
   </label>
   {overlap?<div className="mt-2 space-y-2 text-xs">
    <div className="grid grid-cols-2 gap-2">
     <div className="mini-metric"><span>已知共同持股權重下限</span><strong>{overlap.confirmedOverlapPct.toFixed(2)}%</strong></div>
     <div className="mini-metric"><span>已知共同公司數</span><strong>{overlap.confirmedCommonCount}</strong></div>
     <div className="mini-metric"><span>{selected.etfSymbol} 成分覆蓋／未知</span><strong>{overlap.coverageA.toFixed(1)}%／{overlap.unknownA.toFixed(1)}%</strong></div>
     <div className="mini-metric"><span>{comparison.etfSymbol} 成分覆蓋／未知</span><strong>{overlap.coverageB.toFixed(1)}%／{overlap.unknownB.toFixed(1)}%</strong></div>
    </div>
    <p className={!overlap.datesAligned?"text-amber-700 dark:text-amber-300":"text-black/45 dark:text-white/45"}>
      成分公布日：{selected.etfSymbol} {overlap.firstDate} · {comparison.etfSymbol} {overlap.secondDate}。
      {!overlap.datesAligned?" 不同日期，非同步持股快照。":""}
    </p>
    {overlap.shared.length?<div className="space-y-1">
      {overlap.shared.slice(0,8).map(r=><div key={r.key} className="flex items-center justify-between gap-2 border-b border-black/5 py-1.5 dark:border-white/8">
        <span className="min-w-0 truncate">{r.symbol} · {r.name}</span>
        <span className="shrink-0 tabular-nums">{r.weightA.toFixed(1)}%／{r.weightB.toFixed(1)}%</span>
      </div>)}
    </div>:null}
    <p className="text-[11px] leading-5 text-black/45 dark:text-white/45">重疊下限 = 每檔相同證券已知權重的較小值加總，不是 ETF 的完整相似度。未公布部分不能視為零重疊；經理人、費用及配息政策未由此資料證實。只以已驗證證券代號及市場比對。</p>
   </div>:<p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{error}</p>}
  </>}
 </details>;
}
