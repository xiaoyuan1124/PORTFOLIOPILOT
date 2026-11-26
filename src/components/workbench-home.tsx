"use client";
import {useMemo,useState} from "react";
import {Area,AreaChart,ResponsiveContainer,Tooltip,XAxis,YAxis,CartesianGrid} from "recharts";
import {ArrowRight,Eye,EyeOff,Star,Compass,ShieldAlert,Wallet} from "lucide-react";
import type {AppState} from "@/lib/types";
import {allocationByAccount,dailySnapshotDelta,localDateKey,officialPriceCoverage,portfolioCashSummary,portfolioSummary,snapshotsForRange,snapshotsThroughDate,topHoldings,type SnapshotRange} from "@/lib/calc";
import {calculatePortfolioRisk} from "@/lib/portfolio-risk";
import {money,percent} from "@/lib/utils";
import {DailyPortfolioDrivers} from "./daily-portfolio-drivers";
import {MarketStatusCenter} from "./market-status-center";
import {WorkbenchMarket} from "./workbench-market";
import {Card,CardContent} from "./ui";
import type {PortfolioTab} from "./portfolio";

const ranges:[SnapshotRange,string][]=[["1M","1月"],["3M","3月"],["YTD","今年"],["1Y","1年"],["ALL","全部"]];
export function WorkbenchHome({state,onNavigate,onAsset,onExplore,onWatch}:{state:AppState;onNavigate:(section:"portfolio"|"research"|"lab",key?:string,type?:"stock"|"etf")=>void;onAsset:(tab:PortfolioTab)=>void;onExplore:()=>void;onWatch:()=>void}){
  const [range,setRange]=useState<SnapshotRange>("3M");
  const [hidden,setHidden]=useState(false);
  const [chartMetric,setChartMetric]=useState<"total"|"cost"|"gain">("total");
  const today=localDateKey();
  const summary=portfolioSummary(state.holdings,state.usdTwd);
  const cash=portfolioCashSummary(state.holdings,state.usdTwd);
  const risk=calculatePortfolioRisk(state.holdings,state.etfCompositions,state.usdTwd);
  const coverage=officialPriceCoverage(state.holdings);
  const accounts=allocationByAccount(state.holdings,state.usdTwd);
  const positions=topHoldings(state.holdings,state.usdTwd,5);
  const current=useMemo(()=>snapshotsThroughDate(state.snapshots,today),[state.snapshots,today]);
  const daily=dailySnapshotDelta(current);
  const trend=useMemo(()=>snapshotsForRange(current,range).map(s=>({date:s.date,value:s[chartMetric]})),[current,range,chartMetric]);
  const mask=(n:number)=>hidden?"••••••":money(n);
  const yDomain=useMemo<[number,number]>(()=>{
    if(!trend.length)return [0,1];
    const min=Math.min(...trend.map(s=>s.value)),max=Math.max(...trend.map(s=>s.value));
    const pad=Math.max((max-min)*0.12,Math.abs(max)*0.0005,1);
    return [min-pad,max+pad];
  },[trend]);
  return <div className="workbench-home" data-testid="workbench-home">
    {state.dataMode==="demo"?<p role="status" className="workbench-home-wide rounded-lg border border-amber-500/30 p-3 text-xs">DEMO 示範資料，並非真實資產。</p>:null}
    <Card className="workbench-networth min-w-0"><CardContent className="space-y-3 p-4">
      <div className="flex items-center justify-between"><h2 className="text-sm font-medium opacity-70">總資產淨值</h2><button type="button" className="grid h-10 w-10 place-items-center" aria-label={hidden?"顯示資產金額":"隱藏資產金額"} onClick={()=>setHidden(v=>!v)}>{hidden?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>
      <p className="break-all text-3xl font-semibold tabular-nums sm:text-4xl" data-testid="workbench-networth">{mask(summary.total)}</p>
      <button type="button" onClick={()=>onAsset("performance")} className="text-xs underline underline-offset-2">查看扣除入出金影響的投資報酬</button>
      <p className="text-xs opacity-75">{daily?"最近一日淨值變動 "+(hidden?"••••":percent(daily.pct)):"尚無可比較的日快照"} · 含入出金，非投資報酬</p>
      <div className="workbench-subtabs" role="group" aria-label="資產圖表指標">{[["total","淨值"],["cost","目前成本"],["gain","未實現損益"]].map(([k,label])=><button key={k} type="button" aria-pressed={chartMetric===k} onClick={()=>setChartMetric(k as typeof chartMetric)}>{label}</button>)}</div>
      <div className="workbench-subtabs" role="group" aria-label="淨值期間">{ranges.map(([key,label])=><button key={key} type="button" aria-pressed={range===key} onClick={()=>setRange(key)}>{label}</button>)}</div>
      <div className="h-44 min-w-0 md:h-64">{hidden?<div className="grid h-full place-items-center text-xs opacity-65">資產圖表已隱藏</div>:trend.length>1?<ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{top:8,left:0,right:4,bottom:0}}><CartesianGrid strokeDasharray="3 3" opacity={.15} vertical={false}/><XAxis dataKey="date" tickFormatter={v=>String(v).slice(5)} tick={{fontSize:10,fill:"#78817b"}} minTickGap={24} axisLine={false} tickLine={false}/><YAxis width={68} domain={yDomain} tickCount={4} tick={{fontSize:10,fill:"#78817b"}} tickFormatter={v=>Number(v).toLocaleString("zh-TW",{maximumFractionDigits:0})} axisLine={false} tickLine={false}/><Tooltip formatter={v=>money(Number(v))} contentStyle={{background:"#fff",color:"#17212b",fontSize:12}}/><Area dataKey="value" name={chartMetric==="total"?"資產淨值":chartMetric==="cost"?"目前成本":"未實現損益"} stroke="#456b58" fill="#456b58" fillOpacity={.12} strokeWidth={2} isAnimationActive={false}/></AreaChart></ResponsiveContainer>:<div className="grid h-full place-items-center text-center text-xs opacity-65">累積兩筆日期快照後顯示走勢。</div>}</div>
      <div className="grid grid-cols-3 gap-2 border-t border-current/10 pt-3">{[["目前成本",summary.cost],["未實現損益",summary.gain],["現金水位",cash.cash]].map(([label,value])=><div key={String(label)} className="min-w-0"><p className="text-xs opacity-65">{label}</p><strong className="block break-all text-sm tabular-nums">{mask(Number(value))}</strong></div>)}</div>
      {current.length!==state.snapshots.length?<p role="status" className="text-xs text-amber-700 dark:text-amber-300">已排除未來日期的淨值快照。</p>:null}
      {!state.holdings.length?<button type="button" onClick={()=>onAsset("holdings")} className="min-h-11 w-full rounded-lg border border-current/15 text-sm font-semibold">新增第一筆持股 <ArrowRight className="inline" size={14}/></button>:null}
    </CardContent></Card>
    <div className="workbench-market min-w-0 space-y-2"><WorkbenchMarket onExplore={onExplore}/><MarketStatusCenter/></div>
    <Card className="workbench-priority min-w-0"><CardContent className="space-y-2 p-4">
      <h2 className="text-sm font-semibold">需要注意</h2>
      <button type="button" onClick={()=>onAsset("risk")} className="workbench-link-row"><ShieldAlert size={18}/><span className="min-w-0 flex-1"><strong className="block text-sm">最大公司曝險</strong><span className="block break-words text-xs opacity-70">{hidden?"金額及比重已隱藏":risk.largestCompany?risk.largestCompany.name+" · "+risk.largestCompany.portfolioPct.toFixed(1)+"%":"尚無持股"}</span></span><ArrowRight size={15}/></button>
      <button type="button" onClick={()=>onAsset("holdings")} className="workbench-link-row"><Wallet size={18}/><span className="min-w-0 flex-1"><strong className="block text-sm">官方台股報價</strong><span className="block text-xs opacity-70">{coverage.covered}/{coverage.total} 檔有官方價格</span>{coverage.manualOrUnknown>0||(coverage.covered>0&&!coverage.aligned)?<span className="block text-xs text-amber-700 dark:text-amber-300">來源或交易日不一致，請核對。</span>:null}</span><ArrowRight size={15}/></button>
      <button type="button" onClick={onWatch} className="workbench-link-row"><Star size={18}/><span className="flex-1 text-sm text-left">自選股票 · {(state.watchlist??[]).length} 檔</span><ArrowRight size={15}/></button>
      <button type="button" onClick={onExplore} className="workbench-link-row"><Compass size={18}/><span className="flex-1 text-sm text-left">探索市場與選股</span><ArrowRight size={15}/></button>
    </CardContent></Card>
    <div className="workbench-drivers min-w-0">{hidden?<Card><CardContent className="p-4 text-xs">今日損益貢獻已隱藏。</CardContent></Card>:<DailyPortfolioDrivers state={state} onNavigate={onNavigate}/>}</div>
    <Card className="workbench-home-wide min-w-0"><CardContent className="space-y-2 p-4">
      <details><summary className="cursor-pointer text-sm font-semibold">帳戶、產業與最大持股</summary>
        {hidden?<p className="mt-3 text-xs opacity-65">資產明細已隱藏。</p>:<div className="mt-3 grid gap-4 lg:grid-cols-3">
          <div><h3 className="mb-2 text-sm font-semibold">帳戶分布</h3>{accounts.map(x=><div key={x.name} className="workbench-link-row"><span className="min-w-0 flex-1 break-words text-xs">{x.name}</span><span className="text-xs tabular-nums">{money(x.value)} · {x.pct.toFixed(1)}%</span></div>)}{!accounts.length?<p className="text-xs opacity-65">尚無帳戶</p>:null}</div>
          <div><h3 className="mb-2 text-sm font-semibold">真實產業曝險</h3>{risk.sectorExposures.slice(0,6).map(x=><div className="workbench-link-row" key={x.key}><span className="min-w-0 flex-1 break-words text-xs">{x.label}</span><span className="text-xs tabular-nums">{x.portfolioPct.toFixed(1)}%</span></div>)}<p className="mt-2 text-xs opacity-65">已知成分覆蓋 {risk.riskCoveragePct.toFixed(1)}%</p><button type="button" onClick={()=>onAsset("lookthrough")} className="min-h-10 text-xs underline">完整 ETF 穿透</button></div>
          <div><h3 className="mb-2 text-sm font-semibold">最大持股</h3>{positions.map(x=><button type="button" key={x.holding.id} className="workbench-link-row" onClick={()=>{const venue=x.holding.priceSource;if(x.holding.market==="TW"&&(venue==="TWSE"||venue==="TPEx"))onNavigate("research",venue+":"+x.holding.symbol,x.holding.type==="etf"?"etf":"stock");else onAsset("holdings");}}><span className="min-w-0 flex-1 break-words text-left text-xs">{x.holding.symbol} {x.holding.name}</span><span className="text-xs">{x.pct.toFixed(1)}%</span></button>)}</div>
        </div>}
      </details>
      <details><summary className="cursor-pointer text-xs opacity-75">資料與計算依據</summary><p className="mt-2 text-xs leading-5 opacity-70">使用既有本機持股、匯率與官方 TWSE／TPEx／MOPS 快取。淨值包含入出金；投資報酬請查看資產・績效。此頁非即時報價或交易建議。</p></details>
    </CardContent></Card>
  </div>;
}
