import {describe,it,expect} from "vitest";
import type {EtfComposition} from "./types";
import {compareEtfCompositions} from "./etf-overlap";
const make=(symbol:string,weights:Array<[string,number]>,asOf="2026-11-19"):EtfComposition=>({
 id:symbol,etfMarket:"TW",etfSymbol:symbol,etfName:symbol,asOf,sourceName:"test",sourceUrl:"https://example.com",sourceType:"user_import",
 constituents:weights.map(([s,w])=>({market:"TW",symbol:s,name:s,weightPct:w,sector:"半導體"}))
});
describe("dated ETF overlap with unresolved weight",()=>{
 it("reports confirmed minimum common weights and remaining unknown separately",()=>{
  const result=compareEtfCompositions(make("009816",[["2330",40],["2317",20]]),
    make("0050",[["2330",50],["2454",20]]));
  expect(result.confirmedOverlapPct).toBe(40);
  expect(result.unknownA).toBe(40);
  expect(result.unknownB).toBe(30);
  expect(result.confirmedCommonCount).toBe(1);
 });
 it("does not confuse different exchanges with identical security symbols",()=>{
  const a=make("AAA",[["2330",30]]);
  const b=make("BBB",[["2330",30]]);
  b.constituents[0]!.market="US";
  expect(compareEtfCompositions(a,b).confirmedOverlapPct).toBe(0);
 });
 it("identifies timestamp differences instead of calling allocations synchronized",()=>{
  const result=compareEtfCompositions(make("AAA",[["2330",20]]),
    make("BBB",[["2330",10]],"2026-11-15"));
  expect(result.datesAligned).toBe(false);
 });
 it("rejects duplicate, overweight and same-fund comparisons",()=>{
  expect(()=>compareEtfCompositions(make("A",[["2330",50],["2330",10]]),make("B",[]))).toThrow(/重複/);
  expect(()=>compareEtfCompositions(make("A",[["2330",70],["2317",50]]),make("B",[]))).toThrow(/100/);
  expect(()=>compareEtfCompositions(make("A",[]),make("A",[]))).toThrow();
 });
});
