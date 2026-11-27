"use client";
import {useMemo,useState} from "react";
import {analyzePatterns,structureAt,type Signal} from "@/lib/technical-patterns";
import type {ChartBar} from "@/lib/workbench-chart";
const categories={candle:"K棒",pattern:"價格型態",divergence:"指標背離",structure:"趨勢"};
const fmt=(v:number|null)=>v===null?"—":v.toLocaleString("zh-TW",{maximumFractionDigits:2});
export function PatternResearch({bars,onDate}:{bars:readonly ChartBar[];onDate:(date:string)=>void}){
 const [filter,setFilter]=useState<"all"|Signal["category"]>("all");
 const [days,setDays]=useState(30);
 const signals=useMemo(()=>analyzePatterns(bars),[bars]),structure=useMemo(()=>structureAt(bars),[bars]);
 const start=bars.at(-days)?.date??bars[0]?.date??"";
 const rows=signals.filter(s=>s.confirmed>=start&&(filter==="all"||filter===s.category)).reverse();
 return <section className="min-w-0 space-y-3 border-t border-current/15 pt-3" data-testid="technical-pattern-research">
  <h3 className="text-sm font-semibold">自動技術型態與背離</h3>
  <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg border border-current/15 p-2"><strong>{structure.high??"—"}</strong><p>最近確認高點 {fmt(structure.highPrice)}</p></div><div className="rounded-lg border border-current/15 p-2"><strong>{structure.low??"—"}</strong><p>最近確認低點 {fmt(structure.lowPrice)}</p></div></div>
  <p className="text-xs">趨勢結構：{structure.status}｜HH 較高高點、HL 較高低點、LH 較低高點、LL 較低低點。</p>
  <div className="flex flex-wrap gap-1">{(["all","candle","pattern","divergence"] as const).map(k=><button type="button" key={k} className="min-h-10 rounded border border-current/15 px-2 text-xs" aria-pressed={filter===k} onClick={()=>setFilter(k)}>{k==="all"?"全部訊號":categories[k]}</button>)}</div>
  <label className="text-xs">觀察範圍 <select value={days} onChange={e=>setDays(Number(e.target.value))} className="rounded border bg-transparent p-2"><option value={30}>最近30根</option><option value={60}>最近60根</option><option value={120}>最近120根</option></select></label>
  <p className="text-xs opacity-75">截至 {bars.at(-1)?.date??"—"}｜{rows.length} 筆規則訊號；轉折需右側2根確認。原始未還原價格，除權息可能形成假訊號。</p>
  {!rows.length?<p role="status" className="text-xs">此範圍未偵測到符合規則的訊號，或完整 OHLC／指標暖機資料不足。</p>:rows.slice(0,20).map((s,i)=><article className="min-w-0 rounded-lg border border-current/15 p-2 text-xs space-y-1" key={s.id+":"+s.confirmed+":"+i}><div className="flex flex-wrap items-center justify-between gap-2"><strong>{s.name} · {s.direction==="bull"?"偏多線索":s.direction==="bear"?"偏空線索":"中性線索"}</strong><button className="min-h-10 rounded border px-2" type="button" onClick={()=>onDate(s.confirmed)}>定位K線</button></div><p>形成 {s.start} → 確認 {s.confirmed}</p><p>{s.evidence}</p><p>確認收盤 {fmt(s.price)} · 參考價 {fmt(s.reference)} · {s.invalid===null?"無單一失效價":(s.direction==="bull"?"跌破 ":"突破 ")+fmt(s.invalid)+" 須重新評估"}</p></article>)}
  {rows.length>20&&<p className="text-xs opacity-75">顯示最近20筆；可切換分類縮小範圍。</p>}
  <p className="text-xs opacity-75">型態確認指規則成立，不等於反轉或突破一定成功；尚未估計歷史勝率。</p>
 </section>;
}
