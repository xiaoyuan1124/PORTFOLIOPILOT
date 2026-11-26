import { describe,it,expect } from "vitest";
import { priceConditionStudy } from "./decision-price-study";
import type { Point } from "./stock-decision";
const series=(n:number,fn:(i:number)=>number):Point[]=>Array.from({length:n},(_,i)=>[new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10),fn(i)] as const);
describe("decision price event study",()=>{
  it("blocks gaps, short data and exceptional raw moves",()=>{
    const p=series(400,i=>100+i*0.1),date=p.at(-1)![0];
    expect(priceConditionStudy(p.slice(-30),p,date,"swing").count).toBe(0);
    expect(priceConditionStudy(p,p.filter((_,i)=>i!==200),date,"swing").count).toBe(0);
    const bad=p.map(([d,v],i)=>[d,i>=200?v*2:v] as const);
    expect(priceConditionStudy(bad,p,date,"swing").reason).toContain("異常");
  });
  it("uses only earlier prices for signals, next-close entry and nonoverlapping fixed exits",()=>{
    const p=series(700,i=>100+i*0.15+Math.sin(i/4)*1.8),b=series(700,i=>100+i*0.05),date=p.at(-1)![0];
    const r=priceConditionStudy(p,b,date,"swing");
    expect(r.count).toBeGreaterThanOrEqual(5);
    for(let i=0;i<r.samples.length;i++){
      const s=r.samples[i]!,index=p.findIndex(v=>v[0]===s.signal);
      expect(s.entry).toBe(p[index+1]![0]);
      expect(s.exit).toBe(p[index+21]![0]);
      if(i)expect(s.signal>r.samples[i-1]!.exit).toBe(true);
    }
    expect(r.meanNetPct).not.toBeNull();
    const cutoff=p[450]![0];
    const early=priceConditionStudy(p,b,cutoff,"swing");
    expect(early.samples.every(s=>s.exit<=cutoff)).toBe(true);
    const trimmed=priceConditionStudy(p.slice(0,451),b.slice(0,451),cutoff,"swing");
    expect(early).toEqual(trimmed);
  });
});
