"use client";

import {useState} from "react";
import type {AppState} from "@/lib/types";
import {simulatePortfolioAdjustment,type AdjustmentMode,type AdjustmentCostAssumptions} from "@/lib/portfolio-adjustment-scenario";
import {money} from "@/lib/utils";

const keys=["buyFeePct","sellFeePct","minBuyFeeTwd","minSellFeeTwd","sellTaxPct","fxSpreadPct"] as const;
const feeFields: {key:typeof keys[number];label:string}[]=[
  {key:"buyFeePct",label:"買進手續費 %"},
  {key:"sellFeePct",label:"賣出手續費 %"},
  {key:"minBuyFeeTwd",label:"買進最低費 TWD"},
  {key:"minSellFeeTwd",label:"賣出最低費 TWD"},
  {key:"sellTaxPct",label:"賣出證交稅 %"},
  {key:"fxSpreadPct",label:"跨幣別換匯差 %"}
];
export function PortfolioAdjustmentPanel({state}:{state:AppState}) {
  const securities=state.holdings.filter(item=>item.type!=="cash"&&item.quantity>0);
  const [mode,setMode]=useState<AdjustmentMode>("hold");
  const [from,setFrom]=useState(securities[0]?.id??"");
  const [to,setTo]=useState("");
  const [shares,setShares]=useState("1");
  const [funds,setFunds]=useState("30000");
  const [feeValues,setFeeValues]=useState<Record<typeof keys[number],string>>({
    buyFeePct:"",sellFeePct:"",minBuyFeeTwd:"",minSellFeeTwd:"",sellTaxPct:"",fxSpreadPct:""
  });
  const current=securities.find(item=>item.id===from)??securities[0]??null;
  const destination=securities.find(item=>item.id===to&&item.id!==current?.id)
    ??securities.find(item=>item.id!==current?.id)??null;
  const provided=keys.filter(k=>feeValues[k].trim()!=="").length;
  const partial=provided>0&&provided<keys.length;
  const assumptions:AdjustmentCostAssumptions|undefined=provided===keys.length?{
    buyFeePct:Number(feeValues.buyFeePct),sellFeePct:Number(feeValues.sellFeePct),
    minBuyFeeTwd:Number(feeValues.minBuyFeeTwd),minSellFeeTwd:Number(feeValues.minSellFeeTwd),
    sellTaxPct:Number(feeValues.sellTaxPct),fxSpreadPct:Number(feeValues.fxSpreadPct)
  }:undefined;
  const result=(()=>{
    if(!current)return {value:null,error:"尚無可模擬的證券持股"};
    if(partial)return {value:null,error:"請填滿六項實際成本，或全部留空進行毛額試算。"};
    try {
      return {value:simulatePortfolioAdjustment(state.holdings,state.etfCompositions,state.usdTwd,{
        mode,fromHoldingId:current.id,toHoldingId:mode==="switch"?destination?.id:undefined,
        shares:["exit","hold"].includes(mode)?undefined:Number(shares),
        newContributionTwd:mode==="add"?Number(funds):0,costs:assumptions
      }),error:""};
    }catch(error){return {value:null,error:error instanceof Error?error.message:"輸入資料不合法"};}
  })();
  const pct=(v:number|null|undefined)=>v===null||v===undefined?"—":v.toFixed(1)+"%";
  return <details className="rounded-xl border border-black/8 px-3 py-2 dark:border-white/10" data-ux-role="portfolio-adjustment">
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">持有、減碼、換股與加碼情境試算</summary>
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
      <label>情境
        <select className="field mt-1 min-h-11 w-full" value={mode} onChange={e=>setMode(e.target.value as AdjustmentMode)}>
          <option value="hold">持有不動</option><option value="trim">部分減碼</option><option value="exit">完全清倉</option><option value="switch">換至既有持股</option><option value="add">分批加碼</option>
        </select>
      </label>
      <label>目前持股
        <select className="field mt-1 min-h-11 w-full" value={current?.id??""} onChange={e=>setFrom(e.target.value)}>
          {securities.map(item=><option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>)}
        </select>
      </label>
      {mode==="switch"?<label className="col-span-2">換股目標（目前已持有）
        <select className="field mt-1 min-h-11 w-full" value={destination?.id??""} onChange={e=>setTo(e.target.value)}>
          {securities.filter(item=>item.id!==current?.id).map(item=><option key={item.id} value={item.id}>{item.symbol} · {item.name}</option>)}
        </select>
      </label>:null}
      {["trim","switch","add"].includes(mode)?<label>參考股數
        <input className="field mt-1 min-h-11 w-full" type="number" min="1" step="1" inputMode="numeric" value={shares} onChange={e=>setShares(e.target.value)}/>
      </label>:null}
      {mode==="add"?<label>本次新投入 TWD
        <input className="field mt-1 min-h-11 w-full" type="number" min="0" step="1" inputMode="decimal" value={funds} onChange={e=>setFunds(e.target.value)}/>
      </label>:null}
    </div>
    {current?<p className="mt-2 text-[11px] text-black/45 dark:text-white/45">
      參考價格 {current.price} {current.currency} · {current.priceSource??"手動／未驗證"} · {current.priceAsOf??"價格日期缺失"}；以本機 USD/TWD {state.usdTwd} 換算，非成交報價。
    </p>:null}
    <details className="mt-2 rounded-lg border border-black/7 px-2 py-1 dark:border-white/8" data-ux-role="rebalance-cost-assumptions">
      <summary className="min-h-10 cursor-pointer py-2 text-xs font-semibold">券商費稅及換匯成本（選填）</summary>
      <div className="grid grid-cols-2 gap-2 py-2">
        {feeFields.map(field=><label key={field.key} className="text-xs">
          {field.label}
          <input className="field mt-1 min-h-11 w-full" type="number" step="any" min="0" inputMode="decimal" value={feeValues[field.key]}
            onChange={e=>setFeeValues(previous=>({...previous,[field.key]:e.target.value}))} placeholder="自行核對"/>
        </label>)}
      </div>
      <p className="text-[11px] leading-5 text-black/45 dark:text-white/45">
        不預設凱基優惠或最低費率；需填入券商實際整股、零股或複委託成本。最低費一律換算為 TWD 參考值；跨幣別情境採自填匯差，不代表實際兌換成交。
      </p>
    </details>
    {result.error?<p className="mt-2 text-xs text-amber-700 dark:text-amber-300" role="status">{result.error}</p>:null}
    {result.value?<div className="mt-3 space-y-2 text-xs" aria-live="polite">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-black/[.025] p-3 dark:bg-white/[.035]">
        <span>參考賣出：<strong>{result.value.sharesSold}</strong> 股</span>
        <span>參考買進：<strong>{result.value.sharesBought}</strong> 股</span>
        <span>未配置參考值：<strong>{money(result.value.unspentTwd)}</strong></span>
        <span>預估交易費稅／匯差：<strong>{result.value.estimatedCostTwd===null?"未核對":money(result.value.estimatedCostTwd)}</strong></span>
        <span>變更前淨值：<strong>{money(result.value.before.portfolioValueTwd)}</strong></span>
        <span>情境後淨值：<strong>{money(result.value.after.portfolioValueTwd)}</strong></span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <p>最大公司曝險<br/><strong>{pct(result.value.before.largestCompany?.portfolioPct)} → {pct(result.value.after.largestCompany?.portfolioPct)}</strong></p>
        <p>最大產業曝險<br/><strong>{pct(result.value.before.largestSector?.portfolioPct)} → {pct(result.value.after.largestSector?.portfolioPct)}</strong></p>
        <p className="col-span-2">未解析 ETF：{pct(result.value.before.unresolvedEtfPct)} → {pct(result.value.after.unresolvedEtfPct)}</p>
      </div>
      {mode==="switch"&&result.value.sharesBought===0?<p className="text-xs text-amber-700 dark:text-amber-300">費稅或本金限制下可買股數為 0，不強迫買進。</p>:null}
    </div>:null}
    <p className="mt-2 text-[11px] leading-5 text-black/45 dark:text-white/45">
      本工具只用現有本機價格、ETF 已知成分及假設費稅計算，不更新真實持倉／帳戶／績效。未填費率時結果僅毛額；未計滑價、配息、結算限制及分批多次下單的逐筆最低費。跨幣別以參考匯率換算，實際換匯成本需另確認。未知 ETF 權重仍列未知。
    </p>
  </details>;
}
