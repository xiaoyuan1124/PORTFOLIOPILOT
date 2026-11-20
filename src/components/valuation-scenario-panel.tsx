"use client";
import {useState} from "react";
import {calculateEpsPeScenarios,type EpsPeScenario} from "@/lib/valuation-scenarios";

const labels: EpsPeScenario["label"][]=["悲觀","基準","樂觀"];
type Props={
 symbol:string;name:string;close:number|null;quoteDate:string|null;
 officialPe:number|null;valuationDate:string|null;
 onSave?: (title:string,thesis:string,invalidation:string)=>boolean;
};
export function ValuationScenarioPanel({symbol,name,close,quoteDate,officialPe,valuationDate,onSave}:Props) {
 const [eps,setEps]=useState("");
 const [growth,setGrowth]=useState(["","",""]);
 const [pes,setPes]=useState(["","",""]);
 const allSet=Boolean(eps.trim())&&growth.every(x=>x.trim()!=="")&&pes.every(x=>x.trim()!=="");
 let result:ReturnType<typeof calculateEpsPeScenarios>|null=null,error="";
 if (allSet) {
  try {
   result=calculateEpsPeScenarios({
    referenceClose:close??NaN,epsTtm:Number(eps),
    scenarios:labels.map((label,i)=>({label,epsGrowthPct:Number(growth[i]),peMultiple:Number(pes[i])}))
   });
  }catch(cause){error=cause instanceof Error?cause.message:"假設無法計算";}
 }
 const f=(v:number)=>Number.isFinite(v)?v.toLocaleString("zh-TW",{maximumFractionDigits:2}):"—";
 function save() {
  if(!result||!onSave)return;
  const title=`${symbol} ${name} · EPS／PE 情境假設`;
  const thesis=`收盤參考 ${close??"缺值"}（${quoteDate??"日期缺失"}）；使用者自行輸入的 TTM EPS ${eps}，非已驗證官方 EPS／法人預測。情境：${result.map((r,i)=>`${r.label} 假設成長 ${growth[i]}%、PE ${pes[i]} 倍、對應價 ${f(r.hypotheticalPrice)}`).join("；")}。不含股利、稅、FX，需核對獲利品質、一次性收益和現金流。`;
  onSave(title,thesis,"若 EPS、現金流、產業循環、財報發布或合理 PE 區間改變，必須重算，非價格預言。");
 }
 return <details className="rounded-xl border border-black/8 px-3 py-2 dark:border-white/10" data-ux-role="valuation-scenarios">
  <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">EPS × PE 合理價情境試算</summary>
  <p className="mt-1 text-[11px] leading-5 text-black/50 dark:text-white/50">
   目前沒有可確認的完整 EPS／自由現金流自動資料；請依正式財報自行填寫 EPS。官方 PE {officialPe!==null&&officialPe>0?`${f(officialPe)} 倍`:"資料不足／不適用"}（{valuationDate??"無日期"}）僅供參考，不代入未來預測。
  </p>
  <label className="mt-2 block text-xs">自行核對的近四季 EPS（元／股）
   <input className="field mt-1 min-h-11 w-full" type="number" step="any" inputMode="decimal" value={eps} onChange={e=>setEps(e.target.value)} placeholder="自行輸入，預設不提供估計值"/>
  </label>
  <div className="mt-2 grid grid-cols-[auto_1fr_1fr] items-center gap-2 text-xs">
   <span className="text-black/45 dark:text-white/45">情境</span><span>EPS 年變動 %</span><span>假設 PE 倍數</span>
   {labels.map((label,i)=><>
    <span key={label+"-title"} className="font-medium">{label}</span>
    <input key={label+"-growth"} aria-label={label+" EPS 成長率"} className="field min-h-11 min-w-0" type="number" step="any" inputMode="decimal" value={growth[i]} onChange={e=>setGrowth(prev=>prev.map((v,j)=>j===i?e.target.value:v))} placeholder="自行輸入"/>
    <input key={label+"-pe"} aria-label={label+" PE 倍數"} className="field min-h-11 min-w-0" type="number" step="any" inputMode="decimal" value={pes[i]} onChange={e=>setPes(prev=>prev.map((v,j)=>j===i?e.target.value:v))} placeholder="自行輸入"/>
   </>)}
  </div>
  {error?<p className="mt-2 text-xs text-amber-700 dark:text-amber-300" role="status">{error}</p>:null}
  {result?<div className="mt-2 grid grid-cols-3 gap-2">
   {result.map(r=><div className="mini-metric" key={r.label}>
    <span>{r.label} · 假設價格</span><strong>{f(r.hypotheticalPrice)}</strong>
    <span>對收盤 {r.priceChangePct>=0?"+":""}{r.priceChangePct.toFixed(1)}%</span>
   </div>)}
  </div>:null}
  <p className="mt-2 text-[11px] leading-5 text-black/45 dark:text-white/45">
   公式：情境價 = 自填近四季 EPS ×（1 + 自填 EPS 成長率）× 自填 PE；上漲空間 = 情境價 ÷ ${close??"收盤價缺值"} − 1。
   僅為敏感度試算，不是統計 P10／P50／P90，也不是分析師共識。負 EPS 禁用 PE 模型；景氣循環、現金流與稀釋風險需另行核對。
  </p>
  {result&&onSave?<button className="mt-2 min-h-11 w-full rounded-xl border border-black/10 text-xs font-semibold dark:border-white/10" onClick={save}>將假設保存至本機投資筆記</button>:null}
 </details>;
}
