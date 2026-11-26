"use client";
import { useEffect,useMemo,useRef,useState } from "react";
import { loadBundledTwQuotes,cacheMarketFreshness,shouldRejectStaleClosingCache } from "@/lib/market-data";
import { loadBundledRevenue } from "@/lib/revenue-data";
import { loadBundledValuations } from "@/lib/valuation-data";
import { loadBundledRevenueHistory } from "@/lib/revenue-history";
import { loadBundledQuarterlyMargins } from "@/lib/quarterly-financials";
import { loadBundledInstitutional10d } from "@/lib/institutional-data";
import { loadBundledBenchmarks,benchmarkById } from "@/lib/benchmark";
import { evaluateOfficialStrategy } from "@/lib/strategy-gates";
import { buildCompanySnapshots } from "@/lib/company-snapshot";
import { groupDecisionSymbols,loadDecisionHistoryGroup,loadTwPriceHistoryIndex } from "@/lib/price-history-data";
import { HORIZON_LABELS,taipeiDate,type Horizon } from "@/lib/stock-decision";
import { scanDecisionRow,rankDecisionRows,type DecisionScanRow } from "@/lib/decision-scan";
import { calculatePortfolioRisk } from "@/lib/portfolio-risk";
import type { AppState } from "@/lib/types";
import { Card,CardContent } from "./ui";

const statusLabels={met:"初步條件符合",wait:"等待",risk:"風險偏高",insufficient:"資料不足"};
const fmt=(v:number|null,d=0)=>v===null?"—":v.toFixed(d);
export function DecisionScanner({state,onOpenStock}:{state:AppState;onOpenStock?:(key:string)=>void}){
  const [horizon,setHorizon]=useState<Horizon>("swing");
  const [scope,setScope]=useState<"all"|"watch">("all");
  const [filter,setFilter]=useState<"all"|DecisionScanRow["status"]>("all");
  const [query,setQuery]=useState("");
  const [page,setPage]=useState(1);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState({done:0,total:0});
  const [result,setResult]=useState<{rows:DecisionScanRow[];horizon:Horizon;scope:string;date:string;failedGroups:number;stale:boolean}|null>(null);
  const [error,setError]=useState("");
  const active=useRef<AbortController|null>(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  const rows=useMemo(()=>rankDecisionRows(result?.rows??[],filter,query),[result,filter,query]);
  const counts=useMemo(()=>Object.fromEntries(Object.keys(statusLabels).map(k=>[k,result?.rows.filter(r=>r.status===k).length??0])),[result]);
  async function run(){
    active.current?.abort();
    const controller=new AbortController();active.current=controller;
    const {signal}=controller;
    setBusy(true);setError("");setResult(null);setProgress({done:0,total:0});setPage(1);
    try{
      const [quotes,revenue,valuations,revenueHistory,quarterly,institutional,benchmarks,index]=await Promise.all([
        loadBundledTwQuotes(),loadBundledRevenue(),loadBundledValuations(),loadBundledRevenueHistory(),loadBundledQuarterlyMargins(),loadBundledInstitutional10d(),loadBundledBenchmarks(),loadTwPriceHistoryIndex()
      ]);
      if(signal.aborted)return;
      const today=taipeiDate(),latest=cacheMarketFreshness(quotes);
      const offline=Boolean(quotes.offlineFallback||!Number.isFinite(Date.parse(quotes.generatedAt))||shouldRejectStaleClosingCache(quotes));
      const peers=buildCompanySnapshots({quotes,revenue,valuations,strategies:evaluateOfficialStrategy(revenueHistory,institutional,quarterly)});
      const watched=new Set((state.watchlist??[]).filter(s=>s.type==="stock").map(s=>s.venue+":"+s.symbol.toUpperCase()));
      const selected=peers.filter(s=>s.type==="stock"&&(scope==="all"||watched.has(s.market+":"+s.code)));
      const groups=groupDecisionSymbols(selected), benchmark=benchmarkById(benchmarks,"TWSE:TAIEX-PRICE");
      const portfolioRisk=calculatePortfolioRisk(state.holdings,state.etfCompositions,state.usdTwd);
      const output:DecisionScanRow[]=[];let failedGroups=0;
      setProgress({done:0,total:selected.length});
      for(let i=0;i<groups.length;i+=3){
        if(signal.aborted)return;
        const batch=groups.slice(i,i+3);
        const histories=await Promise.allSettled(batch.map(g=>loadDecisionHistoryGroup(g,index,signal)));
        if(signal.aborted)return;
        for(let j=0;j<batch.length;j++){
          const h=histories[j]!;
          if(h.status==="rejected")failedGroups++;
          for(const snapshot of batch[j]!)output.push(scanDecisionRow({snapshot,peers,history:h.status==="fulfilled"?h.value.get(snapshot.market+":"+snapshot.code)??null:null,index,benchmark,today,latestMarketDate:latest[snapshot.market],horizon,offline,portfolioRisk}));
        }
        setProgress({done:output.length,total:selected.length});
        // Yield to rendering and cancellation before the next bounded batch.
        await new Promise<void>(resolve=>setTimeout(resolve,0));
      }
      if(!signal.aborted)setResult({rows:output,horizon,scope,date:index.endDate??"未知",failedGroups,stale:offline||!benchmark||latest.TWSE!==benchmark.asOf||latest.TWSE!==index.endDate||latest.TPEx!==index.endDate});
    }catch(cause){if(!signal.aborted)setError(cause instanceof Error?cause.message:"掃描失敗");}
    finally{if(active.current===controller&&!signal.aborted){active.current=null;setBusy(false);}}
  }
  function cancel(){active.current?.abort();active.current=null;setBusy(false);setResult(null);setError("已取消掃描，未保留部分結果。");}
  const size=30,shown=rows.slice(0,page*size);
  return <Card><CardContent className="space-y-3 p-4"><section data-testid="decision-scanner" className="space-y-3">
    <h4 className="font-semibold">六面向買進評估掃描</h4>
    <p className="text-xs leading-5 opacity-70">沿用官方快取，在瀏覽器本機運算。全市場可能下載多個行情分組；不自動交易、不上傳持股。</p>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs">投資期限<select className="field mt-1 w-full min-w-0" disabled={busy} value={horizon} onChange={e=>{setHorizon(e.target.value as Horizon);setResult(null);}}>{(Object.keys(HORIZON_LABELS) as Horizon[]).map(h=><option key={h} value={h}>{HORIZON_LABELS[h]}</option>)}</select></label>
      <label className="text-xs">掃描範圍<select className="field mt-1 w-full min-w-0" disabled={busy} value={scope} onChange={e=>{setScope(e.target.value as "all"|"watch");setResult(null);}}><option value="all">上市櫃股票</option><option value="watch">自選股票</option></select></label>
    </div>
    <button type="button" className="min-h-11 w-full rounded-xl bg-[#1f332a] px-3 text-sm font-semibold text-white dark:bg-[#dce9e2] dark:text-[#122018]" onClick={()=>busy?cancel():void run()}>{busy?"取消掃描":"開始六面向掃描"}</button>
    {busy?<p role="status" className="text-xs">已處理 {progress.done} / {progress.total||"…"} 檔</p>:null}
    {error?<p role="alert" className="text-xs text-amber-700 dark:text-amber-300">{error}</p>:null}
    {result?<div data-testid="decision-scan-result" className="space-y-3">
      <p className="text-xs opacity-70">行情截至 {result.date} · {HORIZON_LABELS[result.horizon]} · {result.rows.length} 檔</p>
      {result.stale?<p className="text-xs text-amber-700 dark:text-amber-300">資料日期可能未同步；不完整的評估不列入符合條件名單。</p>:null}
      {result.failedGroups?<p className="text-xs text-amber-700 dark:text-amber-300">{result.failedGroups} 個行情分組未載入，相關股票標為資料不足。</p>:null}
      <div className="grid grid-cols-2 gap-2">{Object.entries(statusLabels).map(([k,label])=><button type="button" key={k} aria-pressed={filter===k} className="rounded-lg border border-current/15 p-2 text-left text-xs" onClick={()=>{setFilter(k as DecisionScanRow["status"]);setPage(1);}}>{label}<strong className="block text-lg">{counts[k]??0}</strong></button>)}</div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>{setFilter("all");setPage(1);}} className="min-h-10 rounded-lg border border-current/15 px-3 text-xs" aria-pressed={filter==="all"}>全部</button><input className="field min-w-0 flex-1" placeholder="搜尋掃描結果" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></div>
      <p className="text-xs opacity-70">顯示 {shown.length} / {rows.length} 檔。分數為尚未校準的研究指標，非上漲機率。</p>
      {shown.map(r=><button type="button" key={r.key} disabled={!onOpenStock} onClick={()=>onOpenStock?.(r.key)} className="w-full rounded-lg border border-current/10 p-2 text-left">
        <div className="flex items-start justify-between gap-2"><strong className="min-w-0 break-words text-sm">{r.code} · {r.name}</strong><span className="shrink-0 text-xs">{statusLabels[r.status]}</span></div><p className="mt-1 text-xs opacity-70">評分 {fmt(r.score)} · 覆蓋 {r.coverage}% · 月線乖離 {fmt(r.bias,1)}{r.bias===null?"":"%"}</p><p className="mt-1 break-words text-xs opacity-65">{r.reason}</p>
      </button>)}
      {shown.length<rows.length?<button type="button" className="min-h-10 w-full rounded-lg border border-current/15 text-sm" onClick={()=>setPage(p=>p+1)}>顯示更多</button>:null}
    </div>:null}
  </section></CardContent></Card>;
}
