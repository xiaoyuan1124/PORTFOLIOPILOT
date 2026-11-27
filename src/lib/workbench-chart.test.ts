import {describe,it,expect} from "vitest";
import {buildWorkbenchBars,type CandleTuple} from "./workbench-chart";
describe("workbench verified OHLCV",()=>{
 it("aggregates real sessions and refuses to fabricate a candle for a missing session",()=>{
  const points:[string,number][]=[["2026-11-23",100],["2026-11-24",102],["2026-11-30",104]];
  const candles:CandleTuple[]=[["2026-11-23",98,101,97,100,1000],["2026-11-24",100,103,99,102,2000],["2026-11-30",102,106,101,104,3000]];
  expect(buildWorkbenchBars(points,candles,"2026-11-30","week")[0]).toMatchObject({start:"2026-11-23",date:"2026-11-24",open:98,high:103,low:97,close:102,volume:3000,sessions:2});
  expect(buildWorkbenchBars(points,candles.slice(1),"2026-11-30","month")[0]).toMatchObject({close:104,open:null,high:null,low:null,volume:null});
  expect(buildWorkbenchBars(points,[...candles,["2026-11-24",100,104,99,102,2000]],"2026-11-30","day")[1]?.open).toBeNull();
  expect(buildWorkbenchBars([...points,["2026-11-24",999]],candles,"2026-11-30","day")).toEqual([]);
 });
 it("uses trailing known prices only for moving averages and excludes future dates",()=>{
  const points:[string,number][]=Array.from({length:25},(_,i)=>["2026-11-"+String(i+1).padStart(2,"0"),i+1]);
  const rows=buildWorkbenchBars(points,[],"2026-11-21","day");
  expect(rows).toHaveLength(21);expect(rows[18]?.ma20).toBeNull();expect(rows[19]?.ma20).toBe(10.5);expect(rows[20]?.ma20).toBe(11.5);expect(rows[20]?.ma60).toBeNull();
 });
});
