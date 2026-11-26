"use client";
import {useEffect,useState} from "react";
import {loadBundledBenchmarks,benchmarkById} from "@/lib/benchmark";
import {validDate,taipeiDate} from "@/lib/stock-decision";
import {Card,CardContent} from "./ui";
import {useResumeRefreshKey} from "./use-resume-refresh-key";
export function WorkbenchMarket({onExplore}:{onExplore:()=>void}){
 const [data,setData]=useState<{date:string;value:number;pct:number}|null>(null);
 const [error,setError]=useState("");
 const resume=useResumeRefreshKey();
 useEffect(()=>{let active=true;void loadBundledBenchmarks().then(cache=>{
 const series=benchmarkById(cache,"TWSE:TAIEX-PRICE");
 const byDate=new Map<string,number>();const bad=new Set<string>();const today=taipeiDate();
 for(const p of series?.points??[]){if(!validDate(p.date)||p.date>today||!Number.isFinite(p.value)||p.value<=0)continue;if(byDate.has(p.date)&&byDate.get(p.date)!==p.value)bad.add(p.date);byDate.set(p.date,p.value);}
 const rows=[...byDate].sort(([a],[b])=>a.localeCompare(b));const a=rows.at(-2),b=rows.at(-1);
 if(!a||!b||bad.size||b[0]!==series?.asOf)throw new Error("大盤日期或行情不足");
 if(active){setData({date:b[0],value:b[1],pct:(b[1]/a[1]-1)*100});setError("");}
 }).catch(()=>{if(active){setData(null);setError("官方指數暫時無法取得");}});return()=>{active=false;};},[resume]);
 return <Card><CardContent className="space-y-2 p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">市場收盤</h2><button type="button" className="min-h-10 text-xs underline" onClick={onExplore}>市場詳情</button></div><div className="flex items-end justify-between gap-2"><div><p className="text-xs opacity-70">台股加權指數</p><strong className="text-xl tabular-nums">{data?data.value.toLocaleString("zh-TW",{maximumFractionDigits:2}):"—"}</strong></div>{data?<strong className={"text-sm tabular-nums "+(data.pct>0?"wb-price-up":data.pct<0?"wb-price-down":"")}>{data.pct>=0?"+":""}{data.pct.toFixed(2)}%</strong>:null}</div><p className="text-xs opacity-70">{data?"TWSE 官方收盤 · "+data.date:error||"讀取中"} · 非即時行情</p></CardContent></Card>;
}
