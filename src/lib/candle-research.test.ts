import {describe,it,expect} from "vitest";
import type {StrategyCandle} from "./strategy-lab";
import {aggregateOfficialCandles,officialCandleKD,officialDailyVolumeRatio} from "./candle-research";
const sample=(date:string,open:number,high:number,low:number,close:number,volume:number):StrategyCandle=>({date,open,high,low,close,volume});
describe("official OHLCV price/volume analysis",()=>{
 const data=[
  sample("2026-11-13",10,12,9,11,100),sample("2026-11-16",11,13,10,12,200),
  sample("2026-11-17",12,14,10,13,300),sample("2026-12-01",13,15,12,14,400)
 ];
 it("aggregates true weekly and monthly OHLCV without fake sessions",()=>{
  const w=aggregateOfficialCandles(data,"W");
  expect(w).toHaveLength(3);
  expect(w[1]).toEqual(sample("2026-11-17",11,14,10,13,500));
  const m=aggregateOfficialCandles(data,"M");
  expect(m).toHaveLength(2);
  expect(m[0]).toEqual(sample("2026-11-17",10,14,9,13,600));
 });
 it("validates impossible candle bounds and duplicate dates",()=>{
  expect(()=>aggregateOfficialCandles([sample("2026-02-30",10,11,9,10,100)],"D")).toThrow();
  expect(()=>aggregateOfficialCandles([sample("2026-11-19",10,9,8,10,100)],"D")).toThrow();
  expect(()=>aggregateOfficialCandles([data[0]!,data[0]!],"D")).toThrow();
 });
 it("keeps KD and volume ratio unavailable until actually supported by the data",()=>{
  expect(officialCandleKD(data)).toBeNull();
  expect(officialDailyVolumeRatio(data)).toBeNull();
  const rows=Array.from({length:22},(_,i)=>sample(
    new Date(Date.UTC(2026,0,i+1)).toISOString().slice(0,10),10,12,9,11,100+i));
  const kd=officialCandleKD(rows)!;
  expect(kd.k).toBeGreaterThan(0);
  expect(kd.d).toBeLessThan(100);
  expect(officialDailyVolumeRatio(rows)).toBeCloseTo(121/(110.5));
 });
});
