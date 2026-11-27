import {describe,it,expect} from "vitest";
import {confirmedPivots,candleSignals,divergenceSignals,formationSignals,structureAt,analyzePatterns} from "./technical-patterns";
import type {ChartBar} from "./workbench-chart";
const bars=(c:number[]):ChartBar[]=>c.map((v,i)=>({date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),start:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),close:v,open:v-.2,high:v+1,low:v-1,volume:1000,ma20:null,ma60:null,ma240:null,sessions:1}));
describe("causal pattern research",()=>{
 it("waits for the right-hand pivot confirmation bars",()=>{const b=bars([10,11,15,12,11]);expect(confirmedPivots(b.slice(0,4))).toEqual([]);expect(confirmedPivots(b)).toEqual([{index:2,confirmedIndex:4,price:16,kind:"high"}]);});
 it("flags doji but never fabricates patterns from missing OHLC",()=>{const b=bars([20]);b[0]!.open=20;expect(candleSignals(b).map(s=>s.id)).toContain("doji");expect(candleSignals([{...b[0]!,open:null}])).toEqual([]);});
 it("confirms W bottom only after neckline close",()=>{const b=bars([112,108,100,105,110,115,110,106,101,105,109,114,118]);const a=formationSignals(b);expect(a.some(s=>s.id==="double-bottom"&&s.confirmed===b[12]!.date)).toBe(true);expect(formationSignals(b.slice(0,12)).some(s=>s.id==="double-bottom")).toBe(false);});
 it("divergence uses the second pivot confirmation date and rejects missing values",()=>{const b=bars([20,17,12,16,18,15,10,14,17]);const v=[50,40,25,40,45,42,35,45,50];const x=divergenceSignals(b,v,"RSI");expect(x.some(s=>s.direction==="bull"&&s.confirmed===b[8]!.date)).toBe(true);expect(divergenceSignals(b.slice(0,8),v.slice(0,8),"RSI")).toEqual([]);const bad=[...v] as (number|null)[];bad[6]=null;expect(divergenceSignals(b,bad,"RSI")).toEqual([]);});
 it("signal history is invariant when future bars are appended",()=>{const b=bars(Array.from({length:100},(_,i)=>50+i*.1+Math.sin(i*.6)*8));const full=analyzePatterns(b);for(const end of [20,40,60,80]){const p=b.slice(0,end);expect(full.filter(s=>s.confirmed<=p.at(-1)!.date)).toEqual(analyzePatterns(p));}});
 it("reports insufficient structure without two confirmed highs and lows",()=>{expect(structureAt(bars([10,11,12])).status).toBe("資料不足");});
});
