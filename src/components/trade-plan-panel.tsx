"use client";

import { useState } from "react";
import { simulateLongTradePlan, type FeeAssumptions } from "@/lib/trade-plan";
import { money } from "@/lib/utils";

type Props = {
  symbol: string;
  name: string;
  referenceClose: number | null;
  priceDate: string | null;
  onSavePlan: (title: string, thesis: string, invalidation: string) => boolean;
};

const field = "field min-h-11 w-full py-2 text-xs";
export function TradePlanPanel({ symbol,name,referenceClose,priceDate,onSavePlan }: Props) {
  const [entry,setEntry] = useState(referenceClose && referenceClose > 0 ? String(referenceClose) : "");
  const [stop,setStop] = useState("");
  const [target,setTarget] = useState("");
  const [budget,setBudget] = useState("30000");
  const [risk,setRisk] = useState("3000");
  const [feeRate,setFeeRate] = useState("");
  const [minFee,setMinFee] = useState("");
  const [sellTax,setSellTax] = useState("");
  const [note,setNote] = useState("");
  const partialFee = [feeRate,minFee,sellTax].some(v=>v.trim()!=="") && [feeRate,minFee,sellTax].some(v=>v.trim()==="");
  const feeAssumptions: FeeAssumptions | undefined = !partialFee && [feeRate,minFee,sellTax].every(v=>v.trim()!=="")
    ? {feePct:Number(feeRate),minimumFeeTwd:Number(minFee),sellTaxPct:Number(sellTax)} : undefined;
  let result: ReturnType<typeof simulateLongTradePlan> | null = null;
  let error = partialFee ? "費率、最低手續費與賣出稅率需全部填寫，才能計入費稅。" : "";
  if (!error && entry && stop && target && budget && risk) {
    try { result=simulateLongTradePlan({
      entry:Number(entry),invalidation:Number(stop),target:Number(target),
      budgetTwd:Number(budget),maxLossTwd:Number(risk),fees:feeAssumptions
    }); } catch(cause) {error=cause instanceof Error?cause.message:"試算資料無效";}
  }
  function save() {
    if (!result || result.shares < 1 || error) return;
    const title = `${symbol} ${name} · 觀察交易計畫`;
    const thesis = `參考價 ${referenceClose ?? "無"}（資料日 ${priceDate ?? "未知"}）；手動假設進場 ${entry}、目標 ${target}、風險上限 NT$${risk}、預算 NT$${budget}、參考股數 ${result.shares}、毛報酬風險比 ${result.grossRewardRisk.toFixed(2)}。計畫非委託單。 ${result.reason} ${note.trim()}`;
    onSavePlan(title,thesis,`失效情境：跌至或跌破 ${stop}；資料或假設改變時重新評估。`);
  }
  return (
    <details className="rounded-xl border border-black/8 px-3 py-2 dark:border-white/10" data-ux-role="stock-trade-plan">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-semibold">
        <span>制定進出場觀察計畫</span><span className="text-[11px] font-normal text-black/40 dark:text-white/40">僅本機試算</span>
      </summary>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">參考官方收盤 {referenceClose ? `${referenceClose} 元` : "不足"} · ${priceDate??"日期未提供"}。價格、停損與目標由你自行假設。</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          ["預計進場價",entry,setEntry],["失效價／停損",stop,setStop],["目標價",target,setTarget],
          ["本次投入上限 TWD",budget,setBudget],["單筆可承受虧損 TWD",risk,setRisk]
        ].map(([label,value,update],i)=><label key={i} className="text-xs text-black/60 dark:text-white/60">{label as string}<input className={field+" mt-1"} type="number" inputMode="decimal" min="0" step="any" value={value as string} onChange={event=>(update as (v:string)=>void)(event.target.value)}/></label>)}
      </div>
      <details className="mt-3 rounded-lg border border-black/8 p-2 dark:border-white/10">
        <summary className="min-h-10 cursor-pointer py-2 text-xs font-semibold">輸入券商實際費率（選填）</summary>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([["費率 %",feeRate,setFeeRate],["最低費 TWD",minFee,setMinFee],["賣出稅 %",sellTax,setSellTax]] as const).map(([label,value,setValue])=><label key={label} className="text-xs">{label}<input className={field+" mt-1"} type="number" min="0" step="any" inputMode="decimal" value={value} onChange={event=>setValue(event.target.value)}/></label>)}
        </div>
        <p className="mt-2 text-[11px] text-black/50 dark:text-white/50">請按實際市場、交易類型與凱基個人優惠填寫；系統不假設固定費率。</p>
      </details>
      {error ? <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-300">{error}</p> : null}
      {result && !error ? <div className="mt-3 rounded-xl bg-black/[.025] p-3 text-xs dark:bg-white/[.035]">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>最多參考 {result.shares} 股</strong><strong>毛報酬／風險比 {result.grossRewardRisk.toFixed(2)}</strong></div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <p>毛額風險 <strong>{money(result.grossRiskTwd)}</strong></p><p>毛額潛在報酬 <strong>{money(result.grossRewardTwd)}</strong></p>
          {result.netRiskTwd!==null?<p>含費稅風險 <strong>{money(result.netRiskTwd)}</strong></p>:null}
          {result.netRewardTwd!==null?<p>含費稅報酬 <strong>{money(result.netRewardTwd)}</strong></p>:null}
        </div>
        <p className="mt-2 leading-5 text-black/55 dark:text-white/55">{result.reason}</p>
      </div>:null}
      <label className="mt-3 block text-xs">補充研究條件（選填）<textarea className="field mt-1 w-full text-xs" rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="例如：只在量價配合時考慮，法說後重評" /></label>
      <button type="button" disabled={!result||result.shares<1||Boolean(error)} onClick={save} className="mt-3 min-h-11 w-full rounded-xl bg-[#1f332a] px-3 text-xs font-semibold text-white disabled:opacity-35 dark:bg-[#dce9e2] dark:text-[#122018]">儲存到本機投資筆記（不下單）</button>
    </details>
  );
}
