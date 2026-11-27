"use client";
import {useMemo,useState} from "react";
import {TechnicalAnalysis} from "./technical-analysis";
import type {TwPriceHistorySeries} from "@/lib/price-history-data";
import {buildWorkbenchBars,type ChartPeriod} from "@/lib/workbench-chart";
import {taipeiDate} from "@/lib/stock-decision";
const periods=[["day","日"],["week","週"],["month","月"]] as const;
const maKeys=["ma20","ma60","ma240"] as const;
const maColors={ma20:"#c08a34",ma60:"#7999d8",ma240:"#a98bc9"};
const fmt=(n:number|null)=>n===null?"—":n.toLocaleString("zh-TW",{maximumFractionDigits:2});
export function WorkbenchPriceChart({history}:{history:TwPriceHistorySeries}){
 const [pro,setPro]=useState(true);
 return <div className="space-y-2 min-w-0" data-testid="workbench-price-chart"><button type="button" className="min-h-11 rounded border border-current/20 px-3 text-sm" onClick={()=>setPro(v=>!v)}>{pro?"切換簡易圖":"開啟專業技術分析"}</button>{pro?<TechnicalAnalysis key={history.market+":"+history.symbol} history={history}/>:<SimpleWorkbenchPriceChart history={history}/>}</div>;
}
function SimpleWorkbenchPriceChart({history}:{history:TwPriceHistorySeries}){
 const [period,setPeriod]=useState<ChartPeriod>("day");
 const [mode,setMode]=useState<"close"|"candle">("candle");
 const [count,setCount]=useState(60);
 const [mas,setMas]=useState<(typeof maKeys)[number][]>(["ma20","ma60"]);
 const [cursor,setCursor]=useState<string|null>(null);
 const asOf=taipeiDate();
 const bars=useMemo(()=>buildWorkbenchBars(history.points,history.candles??[],asOf,period),[history,asOf,period]);
 const rows=bars.slice(-count);
 const candleCount=rows.filter(b=>b.open!==null).length;
 const selected=rows.find(b=>b.date===cursor)??rows.at(-1);
 const values=rows.flatMap(b=>[b.close,...(mode==="candle"&&b.open!==null?[b.low!,b.high!]:[]),...mas.flatMap(k=>b[k]===null?[]:[b[k]])]);
 const lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*.08,Math.abs(hi)*.001,.01);
 const min=lo-pad,max=hi+pad;
 const x=(i:number)=>15+(i+.5)*490/Math.max(1,rows.length);
 const y=(v:number)=>16+(max-v)*155/(max-min);
 const maxVolume=Math.max(1,...rows.map(b=>b.volume??0));
 const series=(key:"close"|typeof maKeys[number])=>{let d="",prev=false;rows.forEach((b,i)=>{const v=b[key];if(v===null){prev=false;return;}d+=(prev?" L":" M")+x(i)+" "+y(v);prev=true;});return d;};
 const selectedIndex=selected?rows.indexOf(selected):-1;
 if(!rows.length)return <p role="status" className="p-3 text-xs">歷史價格缺少有效資料或存在衝突，暫不繪圖。</p>;
 return <section className="space-y-2" data-testid="simple-workbench-price-chart">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div role="group" aria-label="K線週期" className="workbench-subtabs">{periods.map(([key,label])=><button type="button" key={key} aria-pressed={period===key} onClick={()=>{setPeriod(key);setCursor(null);}}>{label}K</button>)}</div>
   <div role="group" aria-label="圖表類型" className="workbench-subtabs">{[["candle","K線"],["close","收盤線"]].map(([key,label])=><button type="button" key={key} aria-pressed={mode===key} onClick={()=>setMode(key as typeof mode)}>{label}</button>)}</div>
   <label className="text-xs">顯示 <select aria-label="圖表筆數" className="rounded border border-current/15 bg-transparent p-2" value={count} onChange={e=>{setCount(Number(e.target.value));setCursor(null);}}>{[30,60,120,240].map(n=><option key={n} value={n}>{n} 筆</option>)}</select></label>
  </div>
  <div className="flex flex-wrap gap-3" role="group" aria-label="日均線">{maKeys.map(k=><label className="flex items-center gap-1 text-xs" key={k}><input type="checkbox" checked={mas.includes(k)} onChange={e=>setMas(old=>e.target.checked?[...old,k]:old.filter(v=>v!==k))}/><span style={{color:maColors[k]}}>{k.slice(2)}日MA</span></label>)}</div>
  <p className="text-xs opacity-75">{rows[0]?.start} ～ {rows.at(-1)?.date} · {rows.length} 筆 · {candleCount} 筆有完整區間OHLCV</p>
  {mode==="candle"&&candleCount<rows.length?<p className="text-xs text-amber-700 dark:text-amber-300" role="status">缺少開高低或成交量的期間僅畫收盤點，不以收盤價捏造 K 線。週／月為快取內可見交易日聚合，首尾可能是未完整週期。</p>:null}
  <svg role="img" aria-label="官方歷史價格、日均線與成交股數圖" viewBox="0 0 590 246" className="w-full overflow-visible" style={{maxHeight:340}}>
   {[0,1,2,3].map(i=>{const v=max-(max-min)*i/3;return <g key={i}><line x1={15} x2={505} y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".12"/><text x={514} y={y(v)+4} fontSize="13" fill="currentColor" opacity=".75">{fmt(v)}</text></g>;})}
   {mode==="close"?<path d={series("close")} fill="none" stroke="currentColor" strokeWidth="1.8"/>:rows.map((b,i)=>b.open===null?<circle key={b.date} cx={x(i)} cy={y(b.close)} r={Math.min(2.2,240/rows.length)} fill="currentColor"/>:<g key={b.date} className={b.close>b.open?"wb-price-up":b.close<b.open?"wb-price-down":"wb-price-flat"}><line x1={x(i)} x2={x(i)} y1={y(b.high!)} y2={y(b.low!)} stroke="currentColor"/><rect x={x(i)-Math.max(.5,Math.min(6,165/rows.length))} y={Math.min(y(b.open),y(b.close))} width={Math.max(1,Math.min(12,330/rows.length))} height={Math.max(1,Math.abs(y(b.open)-y(b.close)))} fill="currentColor"/></g>)}
   {mas.map(k=><path key={k} d={series(k)} fill="none" stroke={maColors[k]} strokeWidth="1.5"/>)}
   {rows.map((b,i)=>b.volume!==null?<rect key={b.date} x={x(i)-Math.max(.5,Math.min(6,165/rows.length))} y={216-32*b.volume/maxVolume} width={Math.max(1,Math.min(12,330/rows.length))} height={32*b.volume/maxVolume} fill="currentColor" opacity=".25"/>:null)}
   <line x1={15} x2={505} y1={216} y2={216} stroke="currentColor" opacity=".18"/>
   {selectedIndex>=0?<line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={12} y2={216} stroke="currentColor" strokeDasharray="3 3" opacity=".55"/>:null}
   <text x="15" y="237" fontSize="13" fill="currentColor">{rows[0]?.date.slice(5)}</text><text x="505" y="237" fontSize="13" textAnchor="end" fill="currentColor">{rows.at(-1)?.date.slice(5)}</text><text x="514" y="208" fontSize="11" fill="currentColor">量（股）</text>
  </svg>
  <label className="block text-xs">查看日期：{selected?.date}<input type="range" min={0} max={Math.max(0,rows.length-1)} value={Math.max(0,selectedIndex)} onChange={e=>setCursor(rows[Number(e.target.value)]?.date??null)} className="block min-h-10 w-full" aria-label="查看圖表日期"/></label>
  {selected?<div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-5">{[["開",selected.open],["高",selected.high],["低",selected.low],["收",selected.close],["成交股數",selected.volume]].map(([label,value])=><div key={String(label)} className="mini-metric"><span>{label}</span><strong>{fmt(value as number|null)}</strong></div>)}</div>:null}
  <p className="text-xs opacity-65">未還原權息；均線按日收盤計算，在週／月圖顯示區間末日數值。缺值不補猜，資料來源為既有官方歷史行情快取。</p>
 </section>;
}
