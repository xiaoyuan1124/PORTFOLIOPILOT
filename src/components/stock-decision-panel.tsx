"use client";

import { useEffect, useMemo, useState } from "react";
import { loadTwPriceHistory, loadTwPriceHistoryIndex, type TwPriceHistorySeries } from "@/lib/price-history-data";
import { loadBundledBenchmarks, benchmarkById, type BenchmarkSeries } from "@/lib/benchmark";
import { loadBundledStrategyOhlcv, strategyCandlesFromCache, strategyOhlcvMissingMonths, type StrategyOhlcvCache } from "@/lib/strategy-ohlcv-data";
import { assessStock, HORIZON_LABELS, taipeiDate, positionRisk, type Horizon } from "@/lib/stock-decision";
import { calculatePortfolioRisk } from "@/lib/portfolio-risk";
import type { CompanySnapshot } from "@/lib/company-snapshot";
import type { AppState } from "@/lib/types";
import { Card, CardContent } from "./ui";
import { useResumeRefreshKey } from "./use-resume-refresh-key";

const labels = { met:"初步研究條件符合", wait:"等待條件改善", risk:"風險偏高", insufficient:"資料不足／待同步", not_applicable:"ETF 不適用" };
const number = (v:number|null|undefined, suffix="", digits=1) => v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits)+suffix;
type Loaded = { key:string; history:TwPriceHistorySeries|null; benchmark:BenchmarkSeries|null; ohlcv:StrategyOhlcvCache|null; issues:string[]; error:string };
export function StockDecisionPanel({ snapshot, peers, state, latestMarketDate, offline }: {
  snapshot:CompanySnapshot; peers:CompanySnapshot[]; state:AppState; latestMarketDate:string|null; offline:boolean;
}) {
  const [horizon,setHorizon]=useState<Horizon>("swing");
  const [loaded,setLoaded]=useState<Loaded|null>(null);
  const [retry,setRetry]=useState(0);
  const [target,setTarget]=useState("");
  const [stop,setStop]=useState("");
  const [available,setAvailable]=useState("");
  const [riskBudget,setRiskBudget]=useState("");
  const resume=useResumeRefreshKey();
  const { market, code, type } = snapshot;
  const key=market+":"+code+":"+(snapshot.quote?.date??"")+":"+retry+":"+resume;
  useEffect(()=>{
    if(type!=="stock") return;
    let active=true;
    void Promise.allSettled([loadTwPriceHistory(market,code),loadTwPriceHistoryIndex(),loadBundledBenchmarks(),loadBundledStrategyOhlcv()] as const).then(([history,index,benchmark,ohlcv])=>{
      if(!active)return;
      const h=history.status==="fulfilled"?history.value:null;
      const issues=index.status==="fulfilled"&&h?index.value.failed.filter(f=>f.market===market&&f.date>=(h.points[0]?.[0]??"")&&f.date<=(h.points.at(-1)?.[0]??"")).map(f=>f.date):["歷史索引未驗證"];
      setLoaded({key,history:h,benchmark:benchmark.status==="fulfilled"?benchmarkById(benchmark.value,"TWSE:TAIEX-PRICE"):null,
        ohlcv:ohlcv.status==="fulfilled"?ohlcv.value:null,issues,error:history.status==="rejected"?"官方歷史行情載入失敗":""});
    });
    return()=>{active=false;};
  },[key,market,code,type]);
  const current=loaded?.key===key?loaded:null;
  const portfolio=useMemo(()=>calculatePortfolioRisk(state.holdings,state.etfCompositions,state.usdTwd),[state.holdings,state.etfCompositions,state.usdTwd]);
  const result=useMemo(()=>current?assessStock({snapshot,peers,points:current.history?.points??[],
    candles:strategyOhlcvMissingMonths(current.ohlcv,market,code).length?[]:strategyCandlesFromCache(current.ohlcv,market,code)??[],
    benchmark:current.benchmark,horizon,today:taipeiDate(),latestMarketDate,historyIssues:current.issues,portfolioRisk:portfolio,offline}):null,
    [current,snapshot,peers,market,code,horizon,latestMarketDate,portfolio,offline]);
  const sizing=positionRisk({entry:snapshot.quote?.close??0,target:Number(target),stop:Number(stop),available:Number(available),
    riskBudget:Number(riskBudget),feeRate:0.001425,taxRate:0.003,slippageRate:0.001,minimumFee:20});
  if(type!=="stock") return <Card><CardContent className="p-4 text-sm">ETF 使用 ETF 深度研究，不套用公司型買進評估。</CardContent></Card>;
  return <Card><CardContent className="space-y-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">買進評估</h4><button type="button" className="text-xs underline" onClick={()=>setRetry(v=>v+1)}>更新評估</button></div>
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5" role="group" aria-label="研究期限">
      {(Object.keys(HORIZON_LABELS) as Horizon[]).map(h=><button type="button" key={h} aria-pressed={horizon===h}
        onClick={()=>setHorizon(h)} className={`min-h-10 rounded-lg text-sm ${horizon===h?"bg-[#1f332a] text-white dark:bg-[#dce9e2] dark:text-[#122018]":""}`}>{HORIZON_LABELS[h]}</button>)}
    </div>
    {!result?<p role="status" className="text-sm opacity-60">讀取官方行情與研究資料…</p>:<>
      <div className="rounded-xl bg-black/5 p-3 dark:bg-white/5" aria-live="polite">
        <p className="text-xs opacity-60">研究結果 · {result.asOf}</p><p className="mt-1 text-xl font-semibold">{labels[result.status]}</p>
        <div className="mt-2 grid grid-cols-2 gap-2"><div className="mini-metric"><span>初步指標分數</span><strong>{result.status==="insufficient"?"—":number(result.score," / 100",0)}</strong></div>
          <div className="mini-metric"><span>現有模型覆蓋率</span><strong>{number(result.coverage,"%",0)}</strong></div></div>
        <p className="mt-2 text-xs leading-5 opacity-70">實驗性研究規則，非勝率、目標價或交易指令。覆蓋率僅指本版指標。</p>
      </div>
      {[...(current?.error?[current.error]:[]),...result.missing,...result.warnings].map((warning,i)=><p key={i} className="rounded-lg border border-amber-600/20 p-2 text-xs leading-5 text-amber-800 dark:text-amber-300">{warning}</p>)}
      <div className="grid grid-cols-2 gap-2"><div className="mini-metric"><span>趨勢</span><strong>{result.technical.trend}</strong></div><div className="mini-metric"><span>月線乖離</span><strong>{number(result.technical.monthly.bias,"%")}</strong></div>
        <div className="mini-metric"><span>歷史乖離百分位</span><strong>{number(result.technical.biasRank,"%",0)}</strong></div><div className="mini-metric"><span>相對加權（{horizon==="short"?"20":"60"}日）</span><strong>{number(result.relative,"%")}</strong></div></div>
      <details><summary className="cursor-pointer py-2 text-sm font-semibold">六面向分析</summary><div className="space-y-2">
        {result.factors.map(f=><div className="rounded-lg bg-black/[0.03] p-2 dark:bg-white/[0.03]" key={f.key}><div className="flex justify-between gap-2 text-sm"><strong>{f.label}</strong><span>{number(f.score," / 100",0)}</span></div><p className="mt-1 text-xs leading-5 opacity-70">{f.detail}</p></div>)}
      </div></details>
      <details><summary className="cursor-pointer py-2 text-sm font-semibold">均線與技術數據</summary>
        <div className="grid grid-cols-3 gap-1 text-xs"><strong>均線</strong><strong>價格／乖離</strong><strong>5日斜率</strong>
          {result.technical.averages.map(m=><div key={m.period} className="col-span-3 grid grid-cols-3 gap-1 border-t border-black/5 py-1 dark:border-white/10"><span>{m.period}MA</span><span>{number(m.value,"",2)} / {number(m.bias,"%")}</span><span>{number(m.slope,"%")}</span></div>)}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">{[
          ["RSI14",number(result.technical.indicators.rsi)],["MACD 柱",number(result.technical.indicators.macdHistogram,"",3)],
          ["KD K／D",number(result.technical.indicators.kdK)+" / "+number(result.technical.indicators.kdD)],
          ["14日平均真實波幅",number(result.technical.atr14,"",2)],["20日量比",number(result.technical.indicators.volumeRatio20,"倍",2)],
          ["乖離歷史樣本",String(result.technical.biasSamples)],["前20日低收",number(result.technical.low20,"",2)],["前20日高收",number(result.technical.high20,"",2)]
        ].map(([name,value])=><div className="mini-metric" key={name}><span>{name}</span><strong>{value}</strong></div>)}</div>
      </details>
      <details><summary className="cursor-pointer py-2 text-sm font-semibold">部位風險試算</summary>
        <p className="mb-2 text-xs opacity-70">現有個股（含 ETF 穿透）曝險：{number(result.exposurePct,"%")}；投資部位穿透覆蓋：{number(result.portfolioCoverage,"%")}。</p>
        <div className="grid grid-cols-2 gap-2">{[
          ["情境目標價",target,setTarget],["退出參考價",stop,setStop],["可用資金（元）",available,setAvailable],["單筆風險額（元）",riskBudget,setRiskBudget]
        ].map(([label,value,set])=><label className="text-xs" key={String(label)}>{String(label)}<input className="field mt-1 w-full min-w-0" type="number" min="0" inputMode="decimal" value={String(value)} onChange={e=>(set as (v:string)=>void)(e.target.value)} /></label>)}</div>
        {sizing?<div className="mt-2 grid grid-cols-2 gap-2">{[["股數上限",sizing.shares.toLocaleString()],["投入（含費）",number(sizing.invested,"元",0)],["退出情境損失",number(sizing.loss,"元",0)],["淨報酬／風險",number(sizing.ratio,":1",2)]].map(([name,value])=><div className="mini-metric" key={name}><span>{name}</span><strong>{value}</strong></div>)}</div>:<p className="mt-2 text-xs opacity-70">輸入正數且目標價 &gt; 收盤價 &gt; 退出價。</p>}
        <p className="mt-2 text-xs leading-5 opacity-60">示範費率：單邊0.1425%、最低20元、股票賣出稅0.3%、單邊滑價0.1%。未保證退出成交，非券商報價。</p>
      </details>
      <details><summary className="cursor-pointer py-2 text-xs opacity-70">資料來源、限制與模型版本</summary>
        <p className="text-xs leading-5">TWSE／TPEx 官方未還原收盤、MOPS 毛利率與營收、官方估值與法人資料、TWSE 加權指數。{result.version}。</p>
        {result.limitations.map(v=><p key={v} className="mt-1 text-xs leading-5 opacity-70">{v}</p>)}
        <p className="mt-1 text-xs">歷史樣本 {result.technical.rows.length} 筆，行情截至 {result.technical.lastDate??"—"}。</p>
      </details>
    </>}
  </CardContent></Card>;
}
