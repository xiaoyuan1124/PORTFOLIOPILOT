"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {loadBundledTwQuotes,cacheMarketFreshness,shouldRejectStaleClosingCache} from "@/lib/market-data";
import {loadBundledRevenue} from "@/lib/revenue-data";
import {buildCompanySnapshots} from "@/lib/company-snapshot";
import {loadBundledBenchmarks,benchmarkById} from "@/lib/benchmark";
import {groupDecisionSymbols,loadDecisionHistoryGroup,loadTwPriceHistoryIndex} from "@/lib/price-history-data";
import {loadInstitutionalHistory} from "@/lib/institutional-history";
import {normalizeDecisionPoints,taipeiDate} from "@/lib/stock-decision";
import {RADAR,TECHNICAL,flowIndex,scanTechnical,rankResearch,validateRule,type Rule,type ScanResult,type Investor} from "@/lib/market-research-scan";
const fmt=(v:number|null)=>v===null?"—":v.toFixed(2);
export function MarketResearchScanner({onOpenStock}:{onOpenStock?:(key:string)=>void}){
 const [mode,setMode]=useState<"radar"|"technical">("radar"),[rule,setRule]=useState<Rule>(RADAR);
 const [rows,setRows]=useState<ScanResult[]|null>(null),[busy,setBusy]=useState(false),[progress,setProgress]=useState(""),[error,setError]=useState(""),[date,setDate]=useState(""),[filter,setFilter]=useState<"match"|"missing"|"all">("match"),[page,setPage]=useState(30);
 const active=useRef<AbortController|null>(null);useEffect(()=>()=>active.current?.abort(),[]);
 const ranked=useMemo(()=>rankResearch(rows??[],mode),[rows,mode]);
 const visible=ranked.filter(r=>filter==="all"||r.status===filter);
 function change(m:"radar"|"technical"){setMode(m);setRule(m==="radar"?RADAR:TECHNICAL);setRows(null);setError("");}
 function patch<K extends keyof Rule>(k:K,v:Rule[K]){setRule(r=>({...r,[k]:v}));setRows(null);}
 async function run(){
  if(!validateRule(rule))return;
  active.current?.abort();const controller=new AbortController();active.current=controller;
  setBusy(true);setRows(null);setError("");setDate("");setProgress("讀取官方快取…");setPage(30);setFilter("match");
  try{
   const [quotes,revenue,bm,index,archive]=await Promise.all([loadBundledTwQuotes(),loadBundledRevenue(),loadBundledBenchmarks(),loadTwPriceHistoryIndex(),mode==="radar"?loadInstitutionalHistory():Promise.resolve(null)]);
   if(controller.signal.aborted)return;
   const latest=cacheMarketFreshness(quotes),today=taipeiDate(),benchmark=benchmarkById(bm,"TWSE:TAIEX-PRICE");
   if(quotes.offlineFallback||!Number.isFinite(Date.parse(quotes.generatedAt))||shouldRejectStaleClosingCache(quotes)||!benchmark||!latest.TWSE||latest.TWSE!==latest.TPEx||latest.TWSE!==benchmark.asOf||latest.TWSE!==index.endDate)throw Error("收盤／大盤／歷史尚未同步：上市 "+latest.TWSE+"、上櫃 "+latest.TPEx+"、歷史 "+index.endDate+"、大盤 "+(benchmark?.asOf??"—"));
   const normalized=normalizeDecisionPoints(benchmark.points.map(p=>[p.date,p.value] as const),today);
   if(normalized.conflicts.length||normalized.points.at(-1)?.[0]!==latest.TWSE)throw Error("官方大盤交易日未驗證");
   const calendar=normalized.points.map(p=>p[0]),window=calendar.slice(-rule.period),flows=flowIndex(archive,window);
   if(mode==="radar"&&window.some(d=>!flows.has(d)))throw Error("逐日法人歷史尚不足 "+rule.period+" 個交易日（已取得 "+window.filter(d=>flows.has(d)).length+" 日）；可選10日或等待官方更新。");
   const peers=buildCompanySnapshots({quotes,revenue,valuations:{generatedAt:"",sources:[],rows:[]},strategies:[]}).filter(s=>s.type==="stock"&&s.quote?.date===latest.TWSE);
   const candidates=peers.map(s=>({market:s.market,code:s.code,name:s.name,industry:s.industry,date:s.quote!.date,close:s.quote!.close,revenueYoy:null}));
   const groups=groupDecisionSymbols(candidates),output:ScanResult[]=[];
   for(let i=0;i<groups.length;i+=3){
    if(controller.signal.aborted)return;
    const batch=groups.slice(i,i+3),result=await Promise.allSettled(batch.map(g=>loadDecisionHistoryGroup(g,index,controller.signal)));
    if(controller.signal.aborted)return;
    for(let j=0;j<batch.length;j++){const h=result[j]!;for(const c of batch[j]!)output.push(scanTechnical(c,h.status==="fulfilled"?h.value.get(c.market+":"+c.code)??null:null,calendar,flows,rule,mode,index.failed.filter(f=>f.market===c.market).map(f=>f.date)));}
    setProgress("已分析 "+output.length+" / "+candidates.length+" 檔");await new Promise<void>(resolve=>setTimeout(resolve,0));
   }
   if(!controller.signal.aborted){setRows(output);setDate(latest.TWSE);}
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"掃描失敗");}
  finally{if(active.current===controller){active.current=null;setBusy(false);}}
 }
 const input=(label:string,key:"minBuyDays"|"minStreak"|"minFlowPct"|"minReturn"|"maxReturn"|"maxBias"|"minRsi"|"maxRsi")=><label className="min-w-0 text-xs">{label}<input type="number" className="field mt-1 min-w-0" value={Number.isFinite(rule[key])?rule[key]:""} disabled={busy} onChange={e=>patch(key,e.target.value===""?NaN:Number(e.target.value))}/></label>;
 return <details className="rounded-xl border border-current/15 p-3" data-testid="market-research-scanner"><summary className="cursor-pointer py-2 text-sm font-semibold">法人低調布局雷達／技術選股</summary><div className="mt-3 min-w-0 space-y-3">
 <div className="grid grid-cols-2 gap-2">{(["radar","technical"] as const).map(m=><button type="button" className="min-h-11 rounded border text-sm" key={m} disabled={busy} aria-pressed={mode===m} onClick={()=>change(m)}>{m==="radar"?"法人布局雷達":"技術條件選股"}</button>)}</div>
 <p className="text-xs opacity-75">以官方收盤資料掃描上市櫃個股。全部條件須同時成立；低調布局僅代表淨買超與價格條件，不推測法人意圖。</p>
 <div className="grid grid-cols-2 gap-2"><label className="text-xs">觀察期間<select className="field mt-1" value={rule.period} disabled={busy} onChange={e=>{const n=Number(e.target.value) as 10|20;setRule(r=>({...r,period:n,minBuyDays:Math.min(r.minBuyDays,n),minStreak:Math.min(r.minStreak,n)}));setRows(null);}}><option value={10}>10交易日</option><option value={20}>20交易日</option></select></label>
 {mode==="radar"&&<label className="text-xs">法人類型<select className="field mt-1" value={rule.investor} disabled={busy} onChange={e=>patch("investor",e.target.value as Investor)}><option value="foreign">外資</option><option value="trust">投信</option><option value="combined">外資＋投信</option></select></label>}
 {mode==="radar"&&<>{input("最少買超天數","minBuyDays")}{input("最近連買天數","minStreak")}{input("淨買超／成交量至少 %","minFlowPct")}</>}
 {input("區間最低報酬 %","minReturn")}{input("區間最高報酬 %","maxReturn")}{input("月線絕對乖離上限 %","maxBias")}
 {mode==="technical"&&<>{input("RSI14 下限","minRsi")}{input("RSI14 上限","maxRsi")}<label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={rule.aboveMA60} disabled={busy} onChange={e=>patch("aboveMA60",e.target.checked)}/>收盤站上60MA</label></>}</div>
 {!validateRule(rule)&&<p role="status" className="text-xs">請輸入有效門檻，買超天數不得超過期間，上下限須合理。</p>}
 <button type="button" disabled={!busy&&!validateRule(rule)} className="min-h-11 w-full rounded-lg border text-sm font-semibold" onClick={()=>{if(busy){active.current?.abort();active.current=null;setBusy(false);setProgress("");}else void run();}}>{busy?"取消研究掃描":"開始市場研究掃描"}</button>
 {busy&&<p role="status" className="text-xs">{progress}</p>}{error&&<p role="alert" className="text-xs text-amber-700 dark:text-amber-300">{error}</p>}
 {rows&&<div className="space-y-2" data-testid="market-research-results"><p className="text-xs">資料截至 {date}｜{rows.length} 檔｜符合 {rows.filter(r=>r.status==="match").length}｜缺資料 {rows.filter(r=>r.status==="missing").length}</p>
 <div className="flex flex-wrap gap-2">{(["match","missing","all"] as const).map(f=><button type="button" className="min-h-10 rounded border px-2 text-xs" key={f} aria-pressed={filter===f} onClick={()=>{setFilter(f);setPage(30);}}>{f==="match"?"符合":f==="missing"?"資料不足":"全部"}</button>)}</div>
 {!visible.length&&<p className="text-xs">沒有符合此篩選的股票。</p>}
 {visible.slice(0,page).map(r=><button key={r.market+":"+r.code} type="button" disabled={!onOpenStock} onClick={()=>onOpenStock?.(r.market+":"+r.code)} className="block w-full min-w-0 rounded border border-current/15 p-2 text-left text-xs"><strong>{r.code} {r.name}</strong><p>{r.industry} · {r.reason}</p><p>區間 {fmt(r.returnPct)}%｜20MA乖離 {fmt(r.bias)}%｜RSI {fmt(r.rsi)}</p>{mode==="radar"&&<p>買超 {r.buyDays??"—"} 日｜連買 {r.streak??"—"} 日｜淨買超／量 {fmt(r.flowPct)}%</p>}</button>)}
 {visible.length>page&&<button type="button" className="min-h-10 w-full rounded border text-xs" onClick={()=>setPage(p=>p+30)}>顯示更多</button>}</div>}
 <p className="text-xs opacity-65">只分析原始未還原行情。未納入融資、股權分級及ETF調倉排除；不代表預期報酬或買賣建議。</p></div></details>;
}
