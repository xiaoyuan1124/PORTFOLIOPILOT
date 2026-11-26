import { normalizeDecisionPoints, technicalSnapshot, type Horizon, type Point } from "./stock-decision";

// Fixed ex-ante rule; no fitted parameters and no current financial data injected into history.
// An event study, not a portfolio simulation or evidence that the full decision engine works.
export function priceConditionStudy(points: readonly Point[], benchmark: readonly Point[], asOf: string, horizon: Horizon, issues: readonly string[] = []) {
  const holdDays = horizon==="short"?5:horizon==="swing"?20:60;
  const p=normalizeDecisionPoints(points,asOf), b=normalizeDecisionPoints(benchmark,asOf);
  const rows=p.points, bm=new Map(b.points);
  const minHistory=horizon==="long"?245:140;
  const samples:{signal:string;entry:string;exit:string;netPct:number;excessPct:number}[]=[];
  const empty=(reason:string)=>({holdDays,count:0,meanNetPct:null,meanExcessPct:null,worstPct:null,samples,reason});
  if(issues.length||p.conflicts.length||b.conflicts.length||rows.length<minHistory+holdDays+1) return empty("資料長度、版本或完整性不足，無法驗證。");
  if(!b.points.length||b.points[0]![0]>rows[0]![0]||b.points.at(-1)![0]<rows.at(-1)![0]) return empty("大盤基準日期不完整。");
  const dates=new Set(rows.map(r=>r[0]));
  if(b.points.some(([date])=>date>=rows[0]![0]&&date<=rows.at(-1)![0]&&!dates.has(date))||rows.some(([date])=>!bm.has(date))) return empty("個股與基準交易日不一致。");
  if(rows.some((r,i)=>i>0&&Math.abs(r[1]/rows[i-1]![1]-1)>0.15)) return empty("歷史包含異常未還原價格跳動，不進行報酬推算。");
  const buyFactor=(1+0.001)*(1+0.001425);
  const sellFactor=(1-0.001)*(1-0.001425-0.003);
  for(let i=minHistory-1;i+1+holdDays<rows.length;i++){
    const signal=rows[i]!;
    const t=technicalSnapshot(rows.slice(0,i+1),signal[0]);
    const avg=horizon==="short"?t.monthly:horizon==="swing"?t.quarterly:t.yearly;
    if(avg.bias===null||avg.slope===null||avg.bias<=0||avg.slope<=0||t.biasRank===null||t.overheat||t.falling)continue;
    const entry=rows[i+1]!,exit=rows[i+1+holdDays]!;
    const netPct=(exit[1]*sellFactor/(entry[1]*buyFactor)-1)*100;
    const indexPct=(bm.get(exit[0])!/bm.get(entry[0])!-1)*100;
    samples.push({signal:signal[0],entry:entry[0],exit:exit[0],netPct,excessPct:netPct-indexPct});
    i+=1+holdDays; // next signal after the previous exit, no overlap.
  }
  const count=samples.length;
  if(count<5) return {...empty("有效非重疊樣本少於5筆，不展示績效統計。"),count};
  const avg=(key:"netPct"|"excessPct")=>samples.reduce((sum,s)=>sum+s[key],0)/count;
  return {holdDays,count,meanNetPct:avg("netPct"),meanExcessPct:avg("excessPct"),worstPct:Math.min(...samples.map(s=>s.netPct)),samples,
    reason:"固定規則：依期限站上均線、均線上彎、月線未過熱。僅歷史價格條件，樣本少時不具統計推論能力。"};
}
