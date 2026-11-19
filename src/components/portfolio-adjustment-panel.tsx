"use client";

import { useMemo,useState } from "react";
import type { AppState } from "@/lib/types";
import {simulatePortfolioAdjustment,type AdjustmentMode} from "@/lib/portfolio-adjustment-scenario";
import {money} from "@/lib/utils";

export function PortfolioAdjustmentPanel({state}:{state:AppState}) {
  const securities=state.holdings.filter(item=>item.type!=="cash" && item.quantity>0);
  const [mode,setMode]=useState<AdjustmentMode>("hold");
  const [from,setFrom]=useState(securities[0]?.id??"");
  const [to,setTo]=useState("");
  const [shares,setShares]=useState("1");
  const [funds,setFunds]=useState("30000");
  const current=securities.find(item=>item.id===from)??securities[0]??null;
  const destination=securities.find(item=>item.id===to)??securities.find(item=>item.id!==current?.id)??null;
  const isSwitch=mode==="switch";
  const result=useMemo(()=>{
    if(!current)return {value:null,error:"尚無可模擬的證券持股"};
    try {
      return {value:simulatePortfolioAdjustment(state.holdings,state.etfCompositions,state.usdTwd,{
        mode,fromHoldingId:current.id,toHoldingId:isSwitch?destination?.id:undefined,
        shares:mode==="exit"||mode==="hold"?undefined:Number(shares),
        newContributionTwd:mode==="add"?Number(funds):0
      }),error:""};
    }catch(error){return {value:null,error:error instanceof Error?error.message:"輸入資料不合法"};}
  },[state.holdings,state.etfCompositions,state.usdTwd,mode,current,destination,isSwitch,shares,funds]);
  return <details className="rounded-xl border border-black/8 px-3 py-2 dark:border-white/10" data-ux-role="portfolio-adjustment">
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">持有、減碼、換股與加碼情境試算</summary>
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
      <label>情境
        <select className="field mt-1 min-h-11 w-full text-xs" value={mode} onChange={e=>setMode(e.target.value as AdjustmentMode)}>
          <option value="hold">持有不動</option><option value="trim">部分減碼</option><option value="exit">完全清倉</option><option value="switch">換至既有持股</option><option value="add">分批加碼</option>
        </select>
      </label>
      <label>目前持股
        <select className="field mt-1 min-h-11 w-full text-xs" value={current?.id??""} onChange={e=>setFrom(e.target.value)}>
          {securities.map(item=><option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>)}
        </select>
      </label>
      {isSwitch?<label className="col-span-2">換股目標（目前已持有）
        <select className="field mt-1 min-h-11 w-full text-xs" value={destination?.id??""} onChange={e=>setTo(e.target.value)}>
          {securities.filter(item=>item.id!==current?.id).map(item=><option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>)}
        </select>
      </label>:null}
      {mode==="trim"||mode==="switch"||mode==="add"?<label>參考股數
        <input className="field mt-1 min-h-11 w-full text-xs" type="number" min="1" step="1" inputMode="numeric" value={shares} onChange={e=>setShares(e.target.value)}/>
      </label>:null}
      {mode==="add"?<label>額外投入 TWD
        <input className="field mt-1 min-h-11 w-full text-xs" type="number" min="0" step="1" value={funds} onChange={e=>setFunds(e.target.value)}/>
      </label>:null}
    </div>
    {result.error?<p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{result.error}</p>:null}
    {result.value?<div className="mt-3 space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-black/[.025] p-3 dark:bg-white/[.035]">
        <span>參考賣出：{result.value.sharesSold} 股</span><span>參考買進：{result.value.sharesBought} 股</span>
        <span>未配置現金：{money(result.value.unspentTwd)}</span>
        <span>當前資產估值：{money(result.value.before.portfolioValueTwd)}</span>
        <span>模擬後估值：{money(result.value.after.portfolioValueTwd)}</span>
        <span>未解析 ETF：{result.value.before.unresolvedEtfPct.toFixed(1)}% → {result.value.after.unresolvedEtfPct.toFixed(1)}%</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <p>最大公司曝險<br/><strong>{result.value.before.largestCompany?.portfolioPct.toFixed(1)??"—"}% → {result.value.after.largestCompany?.portfolioPct.toFixed(1)??"—"}%</strong></p>
        <p>最大產業曝險<br/><strong>{result.value.before.largestSector?.portfolioPct.toFixed(1)??"—"}% → {result.value.after.largestSector?.portfolioPct.toFixed(1)??"—"}%</strong></p>
      </div>
    </div>:null}
    <p className="mt-3 text-[11px] leading-5 text-black/50 dark:text-white/50">
      此為本機帳面情境，使用已記錄價格和目前 USD/TWD 參考匯率。未扣實際券商手續費、稅、滑價與跨幣別換匯成本；不同交易市場的最低下單股數也可能不同。賣出資金暫列模擬現金，不強迫配置。不修改任何真實持股、交易或績效；ETF 未知成分維持未知。
    </p>
  </details>;
}
