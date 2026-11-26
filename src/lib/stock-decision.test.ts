import { describe, expect, it } from "vitest";
import { normalizeDecisionPoints, technicalSnapshot, midrankPercentile, positionRisk, assessStock, WEIGHTS, type Point } from "./stock-decision";
import type { CompanySnapshot } from "./company-snapshot";
import type { BenchmarkSeries } from "./benchmark";
function series(n:number, price:(i:number)=>number=()=>100):Point[] {
  return Array.from({length:n},(_,i)=>[new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10),price(i)] as const);
}
function sample(points:Point[], type:"stock"|"etf"="stock") {
  const last=points.at(-1)!;
  const snapshot:CompanySnapshot={code:"2330",name:"測試",market:"TWSE",industry:"半導體",type,
    quote:{code:"2330",name:"測試",market:"TWSE",close:last[1],date:last[0]},valuation:null,revenue:null,strategy:null};
  const benchmark={points:points.map(([date,value])=>({date,value}))} as BenchmarkSeries;
  return {snapshot,peers:[],points,benchmark,horizon:"swing" as const,today:last[0],latestMarketDate:last[0]};
}
describe("stock decision",()=>{
  it("weights sum to 100",()=>Object.values(WEIGHTS).forEach(w=>expect(Object.values(w).reduce((a,b)=>a+b,0)).toBe(100)));
  it("filters future, malformed and conflicting duplicate days",()=>{
    expect(normalizeDecisionPoints([["2025-02-30",100],["2025-01-01",5],["2025-01-01",6],["2025-01-02",7],["2025-01-02",7],["2025-01-03",9]],"2025-01-02")).toEqual({points:[["2025-01-02",7]],conflicts:["2025-01-01"]});
  });
  it("flat price gives exact moving averages and midrank ties",()=>{
    const p=series(300), t=technicalSnapshot(p,p.at(-1)![0]);
    expect(t.averages.every(a=>a.value===100&&a.bias===0&&a.slope===0)).toBe(true);
    expect(t.biasRank).toBe(50);
    expect(t.overheat).toBe(false);
    expect(t.atr14).toBeNull();
    expect(t.indicators.volumeRatio20).toBeNull();
  });
  it("does not fabricate year line or percentile for young listing",()=>{
    const p=series(100),t=technicalSnapshot(p,p.at(-1)![0]);
    expect(t.yearly.value).toBeNull();expect(t.biasRank).toBeNull();expect(t.monthly.value).toBe(100);
  });
  it("calculates a trailing SMA and excludes current observation from ranks",()=>{
    const p=series(300,i=>i===299?140:100),t=technicalSnapshot(p,p.at(-1)![0]);
    expect(t.monthly.value).toBe(102);expect(t.biasRank).toBe(100);expect(t.overheat).toBe(true);
    expect(t.biasSamples).toBe(280);expect(t.low20).toBe(100);
  });
  it("uses real OHLC for true range, not mismatched close",()=>{
    const p=series(50), candles=p.map(([date,close])=>({date,close,high:103,low:98,volume:100}));
    expect(technicalSnapshot(p,p.at(-1)![0],candles).atr14).toBe(5);
    candles[49]!.close=99;
    expect(technicalSnapshot(p,p.at(-1)![0],candles).atr14).toBeNull();
  });
  it("zero ties and missing values are safe",()=>{
    expect(midrankPercentile([1,2,2,3],2)).toBe(50);expect(midrankPercentile([],0)).toBeNull();
  });
  it("never returns positive research result on missing fundamentals",()=>{
    const r=assessStock(sample(series(300)));
    expect(r.status).toBe("insufficient");expect(r.factors.find(f=>f.key==="quality")?.score).toBeNull();
  });
  it("stale, offline, mismatched and missing days are blocked",()=>{
    const input=sample(series(300));
    expect(assessStock({...input,offline:true}).status).toBe("insufficient");
    expect(assessStock({...input,latestMarketDate:"2026-01-01"}).status).toBe("insufficient");
    expect(assessStock({...input,today:"2026-01-01"}).status).toBe("insufficient");
    const gap=assessStock({...input,points:input.points.filter((_,i)=>i!==280)});
    expect(gap.missing.some(m=>m.includes("停牌"))).toBe(true);
    expect(assessStock({...input,points:input.points.slice(0,-1)}).technical.lastDate).not.toBe(input.today);
  });
  it("does not apply stock score to ETF",()=>expect(assessStock(sample(series(300),"etf")).status).toBe("not_applicable"));
  it("risk sizing respects fees, capital and risk budget",()=>{
    const input={entry:100,target:125,stop:90,available:100000,riskBudget:1000,feeRate:0.001425,taxRate:0.003,slippageRate:0.001,minimumFee:20};
    const r=positionRisk(input)!;expect(r.shares).toBeGreaterThan(0);expect(r.loss).toBeLessThanOrEqual(1000);expect(r.invested).toBeLessThanOrEqual(100000);
    expect(positionRisk({...input,riskBudget:1})?.shares).toBe(0);
    expect(positionRisk({...input,stop:101})).toBeNull();
    expect(positionRisk({...input,entry:NaN})).toBeNull();
    expect(positionRisk({...input,feeRate:-1})).toBeNull();
  });
});
