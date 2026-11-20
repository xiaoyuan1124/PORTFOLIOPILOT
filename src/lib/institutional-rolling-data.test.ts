import {describe,it,expect} from "vitest";
import {institutionalRollingFor,type InstitutionalRollingCache} from "./institutional-rolling-data";
const w={status:"verified" as const,startDate:"2026-11-10",endDate:"2026-11-19",observedSessions:10,reason:"official"};
const cache:InstitutionalRollingCache={
 version:1,generatedAt:"2026-11-19T12:00:00Z",asOf:"2026-11-19",benchmarkDate:"2026-11-19",
 sourceNames:["TWSE T86"],windows:{"5":w,"10":w,"20":w,"60":w},rows:[
 {market:"TWSE",code:"1234",foreign5d:0,trust5d:100,foreign10d:10,trust10d:20,foreign20d:null,trust20d:null,foreign60d:null,trust60d:null,observed5d:5,observed10d:10,observed20d:0,observed60d:0},
 {market:"TPEx",code:"1234",foreign5d:-20,trust5d:40,foreign10d:10,trust10d:20,foreign20d:null,trust20d:null,foreign60d:null,trust60d:null,observed5d:5,observed10d:10,observed20d:0,observed60d:0}
 ]};
describe("official institution by exchange and symbol",()=>{
 it("never combines identical listed and OTC tickers",()=>{
  expect(institutionalRollingFor(cache,"TWSE","1234")?.foreign5d).toBe(0);
  expect(institutionalRollingFor(cache,"TPEx","1234")?.foreign5d).toBe(-20);
 });
 it("distinguishes zero net buying from incomplete 20/60D",()=>{
  expect(institutionalRollingFor(cache,"TWSE","1234")?.foreign20d).toBeNull();
  expect(institutionalRollingFor(cache,"TWSE","1234")?.observed20d).toBe(0);
 });
});
