import type {ChartBar} from "./workbench-chart";
import {indicator,type Series} from "./technical-analysis-v2";

export type Direction="bull"|"bear"|"neutral";
export type Signal={id:string;name:string;category:"candle"|"pattern"|"divergence"|"structure";direction:Direction;start:string;confirmed:string;price:number;reference:number|null;invalid:number|null;evidence:string};
export type Pivot={index:number;confirmedIndex:number;price:number;kind:"high"|"low"};
const finite=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v);
function complete(b:ChartBar|undefined):b is ChartBar&{open:number;high:number;low:number}{return !!b&&finite(b.open)&&finite(b.high)&&finite(b.low)&&finite(b.close)&&b.low>0&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);}
const near=(a:number,b:number,tolerance=.025)=>Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b))<=tolerance;
export function confirmedPivots(b:readonly ChartBar[],radius=2):Pivot[]{
 if(!Number.isInteger(radius)||radius<1||radius>10)return [];
 const out:Pivot[]=[];
 for(let i=radius;i+radius<b.length;i++){
  const window=b.slice(i-radius,i+radius+1);
  if(!window.every(complete))continue;
  const center=window[radius]!,others=window.filter((_,j)=>j!==radius);
  const high=others.every(x=>center.high>x.high),low=others.every(x=>center.low<x.low);
  // An outside candle can be both; its within-bar ordering is unknown.
  if(high===low)continue;
  out.push({index:i,confirmedIndex:i+radius,price:high?center.high:center.low,kind:high?"high":"low"});
 }
 return out;
}
function trendBefore(b:readonly ChartBar[],i:number):Direction{
 if(i<5)return "neutral";
 const start=b[i-5]!.close,end=b[i-1]!.close;
 return end/start>=1.015?"bull":end/start<=.985?"bear":"neutral";
}
export function candleSignals(b:readonly ChartBar[]):Signal[]{
 const out:Signal[]=[];
 for(let i=0;i<b.length;i++){
  const x=b[i];if(!complete(x))continue;
  const range=x.high-x.low;if(range<=0)continue;
  const body=Math.abs(x.close-x.open),upper=x.high-Math.max(x.close,x.open),lower=Math.min(x.close,x.open)-x.low;
  const prev=b[i-1],older=b[i-2],trend=trendBefore(b,i);
  const add=(id:string,name:string,direction:Direction,start=i,evidence="",invalid:number|null=null)=>out.push({id,name,category:"candle",direction,start:b[start]!.date,confirmed:x.date,price:x.close,reference:null,invalid,evidence});
  if(body<=range*.1)add("doji","十字線","neutral",i,"實體不超過全幅10%；方向待確認");
  if(body>range*.1&&body<=range*.35&&lower>=2*body&&upper<=range*.15){
   if(trend==="bear")add("hammer","鎚子線","bull",i,"前5根價格下行，長下影至少2倍實體",x.low);
   if(trend==="bull")add("hanging","吊人線","bear",i,"前5根價格上行，長下影至少2倍實體",x.high);
  }
  if(body>range*.1&&body<=range*.35&&upper>=2*body&&lower<=range*.15){
   if(trend==="bear")add("inverted","倒鎚線","bull",i,"前5根價格下行，長上影至少2倍實體",x.low);
   if(trend==="bull")add("shooting","射擊之星","bear",i,"前5根價格上行，長上影至少2倍實體",x.high);
  }
  if(complete(prev)){
   const before=trendBefore(b,i-1);
   if(before==="bear"&&prev.close<prev.open&&x.close>x.open&&x.open<=prev.close&&x.close>=prev.open)add("bull-engulf","多頭吞噬","bull",i-1,"陽線實體覆蓋前一陰線實體",Math.min(x.low,prev.low));
   if(before==="bull"&&prev.close>prev.open&&x.close<x.open&&x.open>=prev.close&&x.close<=prev.open)add("bear-engulf","空頭吞噬","bear",i-1,"陰線實體覆蓋前一陽線實體",Math.max(x.high,prev.high));
   if(x.high<prev.low)add("gap-down","向下跳空缺口","bear",i-1,"本根最高價低於前根最低價",prev.low);
   if(x.low>prev.high)add("gap-up","向上跳空缺口","bull",i-1,"本根最低價高於前根最高價",prev.high);
   if(complete(older)){
    const firstBody=Math.abs(older.close-older.open),middle=Math.abs(prev.close-prev.open);
    const before3=trendBefore(b,i-2);
    if(firstBody>0&&middle<=firstBody*.35){
     if(before3==="bear"&&older.close<older.open&&x.close>x.open&&x.close>(older.open+older.close)/2&&Math.max(prev.open,prev.close)<=older.close+firstBody*.15)add("morning","晨星（無嚴格跳空）","bull",i-2,"前陰線、小實體、陽線收復前陰線中點",Math.min(older.low,prev.low,x.low));
     if(before3==="bull"&&older.close>older.open&&x.close<x.open&&x.close<(older.open+older.close)/2&&Math.min(prev.open,prev.close)>=older.close-firstBody*.15)add("evening","夜星（無嚴格跳空）","bear",i-2,"前陽線、小實體、陰線跌破前陽線中點",Math.max(older.high,prev.high,x.high));
    }
   }
  }
 }
 return out;
}
export function divergenceSignals(b:readonly ChartBar[],values:Series,label:string,pivots=confirmedPivots(b)):Signal[]{
 const out:Signal[]=[];
 for(const kind of ["high","low"] as const){
  const p=pivots.filter(x=>x.kind===kind);
  for(let j=1;j<p.length;j++){
   const a=p[j-1]!,z=p[j]!,u=values[a.index],v=values[z.index];
   if(z.index-a.index<3||z.index-a.index>60||!finite(u)||!finite(v)||!values.slice(a.index,z.index+1).every(finite)||!b.slice(a.index,z.confirmedIndex+1).every(complete))continue;
   const bull=kind==="low"&&z.price<a.price*.995&&v>u,bear=kind==="high"&&z.price>a.price*1.005&&v<u;
   if(!bull&&!bear)continue;
   const confirm=b[z.confirmedIndex];if(!confirm)continue;
   out.push({id:label+"-"+(bull?"bull":"bear"),name:label+(bull?" 底背離":" 頂背離"),category:"divergence",direction:bull?"bull":"bear",start:b[a.index]!.date,confirmed:confirm.date,price:confirm.close,reference:z.price,invalid:z.price,evidence:"價格"+a.price.toFixed(2)+" → "+z.price.toFixed(2)+"；"+label+" "+u.toFixed(2)+" → "+v.toFixed(2)+"；第二轉折需等待2根確認（預設）"});
  }
 }
 return out;
}
export function formationSignals(b:readonly ChartBar[],pivots=confirmedPivots(b)):Signal[]{
 const out:Signal[]=[];
 // Preserve alternating pivots. Each candidate is evaluated using only pivots
 // that were known at its confirmation date; later pivots cannot rewrite it.
 const sequence:Pivot[]=[];
 for(const z of pivots){
  const last=sequence.at(-1);
  if(last?.kind===z.kind){if(z.kind==="high"?z.price>last.price:z.price<last.price)sequence[sequence.length-1]=z;else continue;}else sequence.push(z);
  const three=sequence.slice(-3),five=sequence.slice(-5);
  const candidates:{start:Pivot;end:Pivot;name:string;id:string;direction:"bull"|"bear";reference:number;invalid:number;evidence:string}[]=[];
  if(three.length===3){
   const [a,m,c]=three as [Pivot,Pivot,Pivot];
   if(c.index-a.index>=6&&c.index-a.index<=90&&near(a.price,c.price)&&a.kind===c.kind&&a.kind!==m.kind&&Math.abs(m.price-a.price)/a.price>=.03){
    const bull=c.kind==="low";
    candidates.push({start:a,end:c,name:bull?"雙重底（W底）":"雙重頂（M頭）",id:bull?"double-bottom":"double-top",direction:bull?"bull":"bear",reference:m.price,invalid:bull?Math.min(a.price,c.price):Math.max(a.price,c.price),evidence:"兩個轉折價差≤2.5%，中間反彈／回落≥3%"});
   }
  }
  if(five.length===5){
   const [a,m,h,n,c]=five as [Pivot,Pivot,Pivot,Pivot,Pivot];
   const bull=h.kind==="low";
   const head=bull?h.price<Math.min(a.price,c.price)*.97:h.price>Math.max(a.price,c.price)*1.03;
   if(head&&near(a.price,c.price,.035)&&near(m.price,n.price,.025)&&c.index-a.index>=10&&c.index-a.index<=120){
    candidates.push({start:a,end:c,name:bull?"頭肩底":"頭肩頂",id:bull?"inverse-head-shoulders":"head-shoulders",direction:bull?"bull":"bear",reference:bull?Math.max(m.price,n.price):Math.min(m.price,n.price),invalid:h.price,evidence:"左右肩差≤3.5%，頭部突出≥3%，採保守水平頸線"});
   }
  }
  for(const p of candidates){
   for(let k=p.end.confirmedIndex;k<b.length&&k<=p.end.confirmedIndex+20;k++){
    const x=b[k];if(!complete(x))break;
    if(p.direction==="bull"?x.low<p.invalid:x.high>p.invalid)break;
    if(p.direction==="bull"?x.close>p.reference:x.close<p.reference){
     out.push({id:p.id,name:p.name,category:"pattern",direction:p.direction,start:b[p.start.index]!.date,confirmed:x.date,price:x.close,reference:p.reference,invalid:p.invalid,evidence:p.evidence+"；收盤突破頸線（最長觀察20根）"});break;
    }
   }
  }
 }
 return out;
}
export function structureAt(b:readonly ChartBar[]){
 const p=confirmedPivots(b),h=p.filter(x=>x.kind==="high").slice(-2),l=p.filter(x=>x.kind==="low").slice(-2);
 const high=h.length===2?(h[1]!.price>h[0]!.price?"HH":h[1]!.price<h[0]!.price?"LH":"EQH"):null;
 const low=l.length===2?(l[1]!.price>l[0]!.price?"HL":l[1]!.price<l[0]!.price?"LL":"EQL"):null;
 return {high,low,status:!high||!low?"資料不足":high==="HH"&&low==="HL"?"高低點同步抬升":high==="LH"&&low==="LL"?"高低點同步下移":"混合／整理",highPrice:h.at(-1)?.price??null,lowPrice:l.at(-1)?.price??null};
}
export function analyzePatterns(b:readonly ChartBar[]):Signal[]{
 const pivots=confirmedPivots(b);
 const macd=indicator(b,"macd",12).plots.find(p=>p.label==="DIF")?.values??[];
 const kd=indicator(b,"kd",9).plots[0]?.values??[];
 const r=indicator(b,"rsi",14).plots[0]?.values??[];
 return [...candleSignals(b),...formationSignals(b,pivots),...divergenceSignals(b,r,"RSI(14)",pivots),...divergenceSignals(b,macd,"MACD DIF",pivots),...divergenceSignals(b,kd,"KD K(9)",pivots)].sort((a,z)=>a.confirmed.localeCompare(z.confirmed)||a.id.localeCompare(z.id));
}
