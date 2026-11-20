"use client";
import {useEffect,useMemo,useState} from "react";
import type {DatedCandle} from "@/lib/candle-research";
import {
 loadBundledStrategyOhlcv,strategyCandlesFromCache,strategyOhlcvMissingMonths,
 type StrategyOhlcvCache
} from "@/lib/strategy-ohlcv-data";
import {
 aggregateOfficialCandles,officialCandleKD,officialDailyVolumeRatio,type CandlePeriod
} from "@/lib/candle-research";
import {useResumeRefreshKey} from "./use-resume-refresh-key";

function CandleView({rows}:{rows:DatedCandle[]}) {
 if(!rows.length)return null;
 const W=700,H=190;
 const low=Math.min(...rows.map(r=>r.low)),high=Math.max(...rows.map(r=>r.high));
 const range=Math.max(0.01,high-low);
 const maxVolume=Math.max(1,...rows.map(r=>r.volume));
 const cell=W/rows.length;
 const priceY=(n:number)=>126-(n-low)/range*112;
 return <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="185" role="img" aria-label="真實交易日開高低收 K 線與成交股數圖">
  <line x1={0} y1={128} x2={W} y2={128} stroke="currentColor" opacity={0.12}/>
  {rows.map((bar,i)=>{
   const cx=cell*(i+0.5),rise=bar.close>=bar.open,color=rise?"#b94c4c":"#387f62";
   const bodyTop=Math.min(priceY(bar.open),priceY(bar.close));
   const bodyHeight=Math.max(1.8,Math.abs(priceY(bar.open)-priceY(bar.close)));
   return <g key={bar.date}>
    <line x1={cx} x2={cx} y1={priceY(bar.high)} y2={priceY(bar.low)} stroke={color} strokeWidth={1.5}/>
    <rect x={cx-Math.max(2,cell*0.28)} y={bodyTop} width={Math.max(4,cell*0.56)} height={bodyHeight} fill={rise?color:"none"} stroke={color} strokeWidth={1}/>
    <rect x={cx-Math.max(2,cell*0.28)} y={180-(bar.volume/maxVolume)*44} width={Math.max(4,cell*0.56)} height={(bar.volume/maxVolume)*44} fill={color} opacity={0.5}/>
   </g>;
  })}
  <text x="4" y="9" fontSize="10" fill="currentColor" opacity=".65">{high.toFixed(2)}</text>
  <text x="4" y="124" fontSize="10" fill="currentColor" opacity=".65">{low.toFixed(2)}</text>
  <text x="4" y="187" fontSize="10" fill="currentColor" opacity=".65">{rows[0]?.date?.slice(5)}</text>
  <text x={W-5} y="187" fontSize="10" fill="currentColor" opacity=".65" textAnchor="end">{rows.at(-1)?.date?.slice(5)}</text>
 </svg>;
}
const fmt=(v:number)=>Number.isFinite(v)?v.toLocaleString("zh-TW",{maximumFractionDigits:2}):"—";
export function OfficialOhlcvPanel({market,symbol,quoteDate}:{
 market:"TWSE"|"TPEx";symbol:string;quoteDate:string|null
}) {
 const [opened,setOpened]=useState(false);
 const [cache,setCache]=useState<StrategyOhlcvCache|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [period,setPeriod]=useState<CandlePeriod>("D");
 const [picked,setPicked]=useState("");
 const resume=useResumeRefreshKey();
 useEffect(()=>{
  if(!opened||market!=="TWSE")return;
  let active=true;
  // The official Strategy Lab cache is shared; this does not start a second
  // scraper or fetch any user's holdings to a server.
  void loadBundledStrategyOhlcv().then(data=>{
   if(active){setCache(data);setLoading(false);setError("");}
  }).catch(cause=>{
   if(active){setError(cause instanceof Error?cause.message:"官方 OHLCV 不可用");setLoading(false);}
  });
  return ()=>{active=false;};
 },[opened,market,resume]);
 const raw=cache?strategyCandlesFromCache(cache,market,symbol):null;
 const missing=cache?strategyOhlcvMissingMonths(cache,market,symbol):[];
 const daily=useMemo(()=>raw?aggregateOfficialCandles(raw,"D"):[],[raw]);
 const candles=useMemo(()=>aggregateOfficialCandles(daily,period),[daily,period]);
 const last24=candles.slice(-24);
 const shown=last24.find(bar=>bar.date===picked)??last24.at(-1)??null;
 const latest=daily.at(-1)??null;
 const dataBehind=Boolean(latest&&quoteDate&&latest.date<quoteDate);
 const kd=daily.length&&missing.length===0?officialCandleKD(candles):null;
 const volumeRatio=daily.length&&missing.length===0?officialDailyVolumeRatio(daily):null;
 return <details className="mt-2 rounded-xl border border-black/8 px-3 py-2 dark:border-white/10" data-ux-role="official-ohlcv" onToggle={e=>{setOpened(e.currentTarget.open);if(e.currentTarget.open)setLoading(true);}}>
  <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">官方開高低收／成交量 K 線（部分上市股）</summary>
  <p className="mt-1 text-[11px] text-black/45 dark:text-white/45">沿用 Strategy Lab 的 TWSE STOCK_DAY 來源，僅對目前已涵蓋的上市證券提供；並非全市場或分時行情。</p>
  {market!=="TWSE"?<p className="mt-2 text-xs text-black/45 dark:text-white/45">此 OHLCV 資料集尚未涵蓋上櫃 TPEx；不以收盤價偽造 K 線。</p>:null}
  {market==="TWSE"&&loading?<p className="mt-2 text-xs">讀取可驗證日 K 資料…</p>:null}
  {market==="TWSE"&&!loading&&!raw?<p className="mt-2 text-xs text-black/45 dark:text-white/45">{error||"目前這檔股票尚未納入官方 OHLCV 快取，不顯示 K 棒。"} </p>:null}
  {raw&&latest?<div className="mt-2 space-y-2">
   <div className="flex items-center justify-between gap-2">
    <label className="sr-only" htmlFor={"ohlcv-period-"+symbol}>K 棒週期</label>
    <select className="field min-h-11 max-w-[145px]" id={"ohlcv-period-"+symbol} value={period} onChange={e=>{setPeriod(e.target.value as CandlePeriod);setPicked("");}}>
      <option value="D">日 K</option><option value="W">週 K</option><option value="M">月 K</option>
    </select>
    <span className="text-[11px] text-black/45 dark:text-white/45">官方資料日 {latest.date}</span>
   </div>
   {dataBehind?<p className="text-xs text-amber-700 dark:text-amber-300">OHLCV 僅至 {latest.date}，收盤快取已至 {quoteDate}；兩者日期不同，不可當成今日 K。</p>:null}
   {missing.length?<p className="text-xs text-amber-700 dark:text-amber-300">官方部分月份抓取失敗：{missing.join("、")}。不跨缺口輸出 KD／量比。</p>:null}
   <CandleView rows={last24}/>
   <div className="grid grid-cols-2 gap-2 text-xs">
    <label>查看 K 棒日期
     <select className="field mt-1 min-h-11 w-full" value={shown?.date??""} onChange={e=>setPicked(e.target.value)}>
      {last24.map(r=><option key={r.date} value={r.date}>{r.date}</option>)}
     </select>
    </label>
    <div className="mini-metric"><span>成交股數</span><strong>{shown?shown.volume.toLocaleString("zh-TW"):"—"}</strong></div>
    <div className="mini-metric"><span>開／高</span><strong>{shown?`${fmt(shown.open)}／${fmt(shown.high)}`:"—"}</strong></div>
    <div className="mini-metric"><span>低／收</span><strong>{shown?`${fmt(shown.low)}／${fmt(shown.close)}`:"—"}</strong></div>
    <div className="mini-metric"><span>KD (9,3,3) {period}</span><strong>{kd?`${kd.k.toFixed(1)}／${kd.d.toFixed(1)}`:"不足／缺口"}</strong></div>
    <div className="mini-metric"><span>日量比（對前20交易日）</span><strong>{volumeRatio===null?"不足／缺口":volumeRatio.toFixed(2)+" 倍"}</strong></div>
   </div>
   <p className="text-[11px] leading-5 text-black/45 dark:text-white/45">週／月 K 由官方日 K 的第一筆開盤、區間最高與最低、最後收盤及每日成交股數總和形成；不是還原股利價。週／月 KD 分別使用週／月 K 棒，量比始終是最近完整日量與前 20 個有效交易日的均量。資料缺失或上市股未涵蓋時不產生訊號。</p>
  </div>:null}
 </details>;
}
