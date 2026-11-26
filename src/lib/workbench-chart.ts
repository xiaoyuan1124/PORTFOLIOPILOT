import {normalizeDecisionPoints,validDate,type Point} from "./stock-decision";
export type CandleTuple=readonly [string,number,number,number,number,number];
export type ChartPeriod="day"|"week"|"month";
export type ChartBar={date:string;start:string;close:number;open:number|null;high:number|null;low:number|null;volume:number|null;ma20:number|null;ma60:number|null;ma240:number|null;sessions:number};
function periodKey(date:string,period:ChartPeriod){
 if(period==="day")return date;
 if(period==="month")return date.slice(0,7);
 const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);
}
export function buildWorkbenchBars(points:readonly Point[],candles:readonly CandleTuple[],asOf:string,period:ChartPeriod):ChartBar[]{
 const normalized=normalizeDecisionPoints(points,asOf);
 if(normalized.conflicts.length)return [];
 const rows=normalized.points, closes=new Map(rows);
 const byDate=new Map<string,CandleTuple>(),bad=new Set<string>();
 for(const c of candles){
  const [d,o,h,l,v,vol]=c;
  if(!validDate(d)||closes.get(d)!==v||![o,h,l,v].every(n=>Number.isFinite(n)&&n>0)||h<Math.max(o,v)||l>Math.min(o,v)||!Number.isSafeInteger(vol)||vol<=0){bad.add(d);continue;}
  const old=byDate.get(d);if(old&&old.some((x,i)=>x!==c[i]))bad.add(d);byDate.set(d,c);
 }
 for(const d of bad)byDate.delete(d);
 const sums=[0];for(const [,p] of rows)sums.push(sums.at(-1)!+p);
 const ma=(i:number,n:number)=>i+1>=n?(sums[i+1]!-sums[i+1-n]!)/n:null;
 const groups=new Map<string,{date:string;close:number;i:number}[]>();
 rows.forEach(([date,close],i)=>{const k=periodKey(date,period),g=groups.get(k)??[];g.push({date,close,i});groups.set(k,g);});
 return [...groups.values()].map(group=>{
  const first=group[0]!,last=group.at(-1)!,cs=group.map(r=>byDate.get(r.date));
  const complete=cs.every((x):x is CandleTuple=>!!x);
  const volume=complete?cs.reduce((s,c)=>s+c[5],0):null;
  return {date:last.date,start:first.date,close:last.close,open:complete?cs[0]![1]:null,high:complete?Math.max(...cs.map(c=>c[2])):null,low:complete?Math.min(...cs.map(c=>c[3])):null,volume:volume!==null&&Number.isSafeInteger(volume)?volume:null,ma20:ma(last.i,20),ma60:ma(last.i,60),ma240:ma(last.i,240),sessions:group.length};
 });
}
