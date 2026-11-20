"use client";
import {useEffect,useState} from "react";
import {
 institutionalRollingFor,loadInstitutionalRolling,
 type InstitutionalPeriod,type InstitutionalRollingCache
} from "@/lib/institutional-rolling-data";
import {useResumeRefreshKey} from "./use-resume-refresh-key";

const periods=[5,10,20,60] as const;
function shares(value:number|null){
 if(value===null)return "尚無完整資料";
 const prefix=value>0?"+":"";
 return prefix+Math.round(value).toLocaleString("zh-TW");
}
export function InstitutionalRollingPanel({market,symbol,quoteDate}:{
 market:"TWSE"|"TPEx";symbol:string;quoteDate:string|null
}) {
 const [cache,setCache]=useState<InstitutionalRollingCache|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const resume=useResumeRefreshKey();
 useEffect(()=>{
  let active=true;
  void loadInstitutionalRolling().then(value=>{
   if(active){setCache(value);setError("");setLoading(false);}
  }).catch(cause=>{
   if(active){setError(cause instanceof Error?cause.message:"無法讀取法人歷史");setLoading(false);}
  });
  return ()=>{active=false;};
 },[resume]);
 const row=cache?institutionalRollingFor(cache,market,symbol):null;
 return <details className="rounded-xl border border-black/8 px-3 py-2 dark:border-white/10" data-ux-role="institutional-rollup">
  <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">法人 5／10／20／60 日買賣超</summary>
  {loading?<p className="mt-2 text-xs text-black/45 dark:text-white/45">核對官方逐日快取…</p>:null}
  {!loading&&!row?<p className="mt-2 text-xs text-black/45 dark:text-white/45">
   {error||"該證券暫無足夠的可核對法人歷史。"} 不推算尚未取得的買賣超。
  </p>:null}
  {row&&cache?<div className="mt-2 space-y-2">
   <p className="text-[11px] text-black/50 dark:text-white/50">
    官方最後交易日 {cache.asOf} · {market} · 單位：股
    {quoteDate&&cache.asOf<quoteDate?<span className="text-amber-700 dark:text-amber-300"> · 法人資料晚於收盤價更新</span>:null}
   </p>
   <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 text-xs">
    <span className="text-black/45 dark:text-white/45">期間</span><span>外資淨買超</span><span>投信淨買超</span>
    {periods.map(n=>{
      const k=n as InstitutionalPeriod;
      const win=cache.windows[String(k) as "5"|"10"|"20"|"60"];
      const f=row[`foreign${k}d` as const],t=row[`trust${k}d` as const];
      return <div key={n} className="contents">
       <span className="tabular-nums">{n}D</span>
       <span className="tabular-nums">{win.status==="verified"?shares(f):"資料不足"}</span>
       <span className="tabular-nums">{win.status==="verified"?shares(t):"資料不足"}</span>
      </div>;
    })}
   </div>
   <p className="text-[11px] leading-5 text-black/45 dark:text-white/45">
    {cache.windows["20"].status!=="verified"?"20 日完整官方交易日資料尚未建立；":""}
    {cache.windows["60"].status!=="verified"?"60 日歷史將隨已驗證日資料累積，":""}
    期間為實際官方交易日，缺少任一證券該日報表則保留缺值。
    數值是每日法人買賣超流量的累計，非法人持股存量、推估成本或盤中即時買賣。
   </p>
  </div>:null}
 </details>;
}
