import type {InstitutionalHistory} from "./institutional-history";
import type {TwPriceHistorySeries} from "./price-history-data";
import {normalizeDecisionPoints,technicalSnapshot} from "./stock-decision";

export type Market="TWSE"|"TPEx";
export type Investor="foreign"|"trust"|"combined";
export type Rule={period:10|20;investor:Investor;minBuyDays:number;minStreak:number;minFlowPct:number;minReturn:number;maxReturn:number;maxBias:number;minRsi:number;maxRsi:number;aboveMA60:boolean};
export const RADAR:Rule={period:20,investor:"foreign",minBuyDays:14,minStreak:7,minFlowPct:10,minReturn:-10,maxReturn:8,maxBias:8,minRsi:0,maxRsi:100,aboveMA60:false};
export const TECHNICAL:Rule={period:20,investor:"foreign",minBuyDays:0,minStreak:0,minFlowPct:0,minReturn:-100,maxReturn:100,maxBias:8,minRsi:35,maxRsi:70,aboveMA60:true};
export type Candidate={market:Market;code:string;name:string;industry:string;close:number;date:string;revenueYoy:number|null};
export type ScanResult=Candidate&{status:"match"|"miss"|"missing";reason:string;returnPct:number|null;bias:number|null;rsi:number|null;net:number|null;buyDays:number|null;streak:number|null;flowPct:number|null;aboveMA60:boolean|null};
export function flowIndex(data:InstitutionalHistory|null,dates:readonly string[]){
 const days=new Map<string,Map<string,readonly [number,number]|null>>();
 const requested=new Set(dates);
 for(const day of data?.days??[]){
  if(!requested.has(day.date))continue;
  const rows=new Map<string,readonly [number,number]|null>();
  for(const [market,code,f,t] of day.rows){const key=market+":"+code;rows.set(key,rows.has(key)?null:[f,t]);}
  days.set(day.date,rows);
 }
 return days;
}
export function validateRule(r:Rule){
 return [r.minBuyDays,r.minStreak,r.minFlowPct,r.minReturn,r.maxReturn,r.maxBias,r.minRsi,r.maxRsi].every(Number.isFinite)&&[10,20].includes(r.period)&&["foreign","trust","combined"].includes(r.investor)&&Number.isInteger(r.minBuyDays)&&Number.isInteger(r.minStreak)&&r.minBuyDays>=0&&r.minBuyDays<=r.period&&r.minStreak>=0&&r.minStreak<=r.period&&r.minFlowPct>=0&&r.minFlowPct<=100&&r.minReturn>=-100&&r.minReturn<=r.maxReturn&&r.maxReturn<=1000&&r.maxBias>=0&&r.maxBias<=1000&&r.minRsi>=0&&r.minRsi<=r.maxRsi&&r.maxRsi<=100;
}
export function scanTechnical(c:Candidate,history:TwPriceHistorySeries|null,calendar:readonly string[],flows:ReturnType<typeof flowIndex>,rule:Rule,mode:"radar"|"technical",issues:readonly string[]=[]):ScanResult{
 const base:ScanResult={...c,status:"missing",reason:"資料不足",returnPct:null,bias:null,rsi:null,net:null,buyDays:null,streak:null,flowPct:null,aboveMA60:null};
 const missing=(reason:string)=>({...base,reason});
 if(!validateRule(rule))return missing("篩選門檻無效");
 if(!history||history.market!==c.market||history.symbol!==c.code||!Number.isFinite(c.close)||c.close<=0)return missing("缺少同標的行情");
 const need=mode==="technical"?Math.max(60,rule.period+1):Math.max(20,rule.period+1);
 const dates=calendar.filter(d=>d<=c.date).slice(-need);
 const rows=normalizeDecisionPoints(history.points,c.date);
 const byDate=new Map(rows.points);
 if(dates.length!==need||dates.at(-1)!==c.date||dates.some(d=>!byDate.has(d)||issues.includes(d))||rows.conflicts.some(d=>dates.includes(d))||byDate.get(c.date)!==c.close)return missing("官方交易日／收盤未對齊");
 const points=dates.map(d=>[d,byDate.get(d)!] as const);
 const t=technicalSnapshot(points,c.date);
 base.returnPct=(c.close/byDate.get(dates.at(-rule.period-1)!)!-1)*100;
 base.bias=t.monthly.bias;base.rsi=t.indicators.rsi;base.aboveMA60=t.quarterly.value===null?null:c.close>=t.quarterly.value;
 const required=dates.slice(-rule.period);
 if(mode==="radar"){
  const net=required.map(d=>{const pair=flows.get(d)?.get(c.market+":"+c.code);return !pair?null:rule.investor==="foreign"?pair[0]:rule.investor==="trust"?pair[1]:pair[0]+pair[1];});
  if(net.some(n=>n===null))return missing("逐日法人不足／缺日，不能判定持續布局");
  const values=net as number[];
  base.net=values.reduce((s,n)=>s+n,0);base.buyDays=values.filter(n=>n>0).length;
  let streak=0;for(let i=values.length-1;i>=0&&values[i]!>0;i--)streak++;base.streak=streak;
  const volumes=new Map<string,number|null>();
  for(const [d,o,h,l,close,v] of history.candles??[]){if(!required.includes(d))continue;const valid=Number.isSafeInteger(v)&&v>0&&[o,h,l,close].every(n=>Number.isFinite(n)&&n>0)&&h>=Math.max(o,close)&&l<=Math.min(o,close)&&byDate.get(d)===close;volumes.set(d,volumes.has(d)?null:valid?v:null);}
  const vs=required.map(d=>volumes.get(d));if(vs.some(v=>typeof v!=="number"))return {...base,reason:"成交量缺值，無法計算淨買超占比"};
  const total=(vs as number[]).reduce((s,v)=>s+v,0);
  base.flowPct=100*base.net/total;
 }
 if(base.bias===null||base.returnPct===null||(mode==="technical"&&base.rsi===null))return {...base,reason:"均線或RSI暖機不足"};
 const fails:string[]=[];
 if(base.returnPct<rule.minReturn||base.returnPct>rule.maxReturn)fails.push("區間漲跌幅");
 if(Math.abs(base.bias)>rule.maxBias)fails.push("月線乖離");
 if(mode==="radar"){if(base.net===null||base.net<=0)fails.push("淨買超");if(base.buyDays!<rule.minBuyDays)fails.push("買超天數");if(base.streak!<rule.minStreak)fails.push("連買天數");if(base.flowPct!<rule.minFlowPct)fails.push("淨買超／成交量");}
 else{if(base.rsi!<rule.minRsi||base.rsi!>rule.maxRsi)fails.push("RSI");if(rule.aboveMA60&&!base.aboveMA60)fails.push("季線");}
 return {...base,status:fails.length?"miss":"match",reason:fails.length?fails.join("、")+"未達門檻":"符合全部設定條件"};
}
export function rankResearch(rows:readonly ScanResult[],mode:"radar"|"technical"){
 const order={match:0,miss:1,missing:2};
 return [...rows].sort((a,b)=>order[a.status]-order[b.status]||(mode==="radar"?(b.flowPct??-Infinity)-(a.flowPct??-Infinity):(Math.abs(a.bias??Infinity)-Math.abs(b.bias??Infinity)))||a.code.localeCompare(b.code));
}
