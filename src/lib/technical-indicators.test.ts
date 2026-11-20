import { describe,it,expect } from "vitest";
import { calculateCloseTechnicals, type DatedClose } from "./technical-indicators";
const observations = (closes:number[]): DatedClose[]=>closes.map((close,i)=>{
 const date=new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10);
 return [date,close] as const;
});
describe("official price-only technical indicators",()=>{
 it("returns unavailable instead of inventing missing MA/RSI/MACD",()=>{
  const r=calculateCloseTechnicals(observations([10,11,12]))!;
  expect(r.latest.ma[5]).toBeNull();
  expect(r.latest.rsi14).toBeNull();
  expect(r.latest.macd).toBeNull();
  expect(r.high60Close).toBeNull();
 });
 it("calculates MA and RSI without any forward data",()=>{
  const rising=observations(Array.from({length:250},(_,i)=>100+i));
  const all=calculateCloseTechnicals(rising)!;
  expect(all.latest.ma[5]).toBe(347);
  expect(all.latest.ma[240]).not.toBeNull();
  expect(all.latest.rsi14).toBe(100);
  expect(all.gapFromMa20Pct).toBeGreaterThan(0);
  const historical=calculateCloseTechnicals(rising.slice(0,100))!;
  expect(all.rows[99]?.ma[20]).toBeCloseTo(historical.latest.ma[20]!);
  expect(all.rows[99]?.macdHistogram).toBeCloseTo(historical.latest.macdHistogram!);
 });
 it("uses Wilder RSI 50 for perfectly flat prices, not overbought",()=>{
   const r=calculateCloseTechnicals(observations(Array(70).fill(100)))!;
   expect(r.latest.rsi14).toBe(50);
   expect(r.latest.macdHistogram).toBeCloseTo(0);
   expect(r.latest20Slope).toBeCloseTo(0);
 });
 it("does not blend conflicting duplicate dates or malformed prices",()=>{
  const points=observations([100,110,120]);
  expect(()=>calculateCloseTechnicals([...points,[points[1]![0],99]])).toThrow(/相同日期/);
  expect(calculateCloseTechnicals([...points,["2026-02-30",200],["2026-01-01",0]])?.sampleDays).toBe(3);
 });
 it("uses 60 known closing prices, not intraday highs or lows",()=>{
  const r=calculateCloseTechnicals(observations(Array.from({length:60},(_,i)=>100+i)))!;
  expect(r.high60Close).toBe(159);
  expect(r.low60Close).toBe(100);
 });
});