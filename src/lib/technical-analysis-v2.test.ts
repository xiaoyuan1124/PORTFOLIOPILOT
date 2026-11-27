import {describe,it,expect} from "vitest";
import {indicator,sma,rsi,smooth,supportResistance,INDICATOR_NAMES} from "./technical-analysis-v2";
import type {ChartBar} from "./workbench-chart";
const bars=(n:number):ChartBar[]=>Array.from({length:n},(_,i)=>({date:new Date(Date.UTC(2024,0,i+1)).toISOString().slice(0,10),start:"",close:100+i,open:99+i,high:101+i,low:98+i,volume:1000+i,ma20:null,ma60:null,ma240:null,sessions:1}));
describe("technical analysis v2",()=>{
 it("does not fabricate warm-up values or bridge missing samples",()=>{expect(sma([1,2,null,4,5],2)).toEqual([null,1.5,null,null,4.5]);expect(smooth([1,2,null,4,5],2)).toEqual([null,1.5,null,null,4.5]);});
 it("RSI uses Wilder smoothing and handles monotonic and flat prices",()=>{expect(rsi([1,2,3,4],3)).toEqual([null,null,null,100]);expect(rsi([2,2,2,2],3).at(-1)).toBe(50);});
 it("all implemented indicators align with candles and never emit nonfinite values",()=>{const b=bars(100);for(const id of Object.keys(INDICATOR_NAMES).filter(x=>x!=="rs")){const p=indicator(b,id,14).plots;expect(p.length,id).toBeGreaterThan(0);for(const s of p){expect(s.values.length,id).toBe(b.length);expect(s.values.every(v=>v===null||Number.isFinite(v)),id).toBe(true);}}});
 it("missing OHLC remains missing for ATR and volume",()=>{const b=bars(30).map(x=>({...x,high:null,low:null,open:null,volume:null}));expect(indicator(b,"atr",14).plots[0]?.values.every(x=>x===null)).toBe(true);expect(indicator(b,"vol",14).plots[0]?.values.every(x=>x===null)).toBe(true);expect(supportResistance(b)).toEqual([]);});
 it("MACD and SMA never depend on future bars",()=>{for(const id of ["macd","ma","rsi","kd","supertrend"]){const b=bars(80);const a=indicator(b,id,14).plots,z=indicator(b.slice(0,50),id,14).plots;expect(a.map(x=>x.values.slice(0,50))).toEqual(z.map(x=>x.values));}});
});
