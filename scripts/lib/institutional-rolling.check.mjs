import test from "node:test";
import assert from "node:assert/strict";
import {accumulateOfficialInstitutionalFlows} from "./institutional-rolling.mjs";
const date=i=>new Date(Date.UTC(2026,8,i+1)).toISOString().slice(0,10);
const day=i=>({date:date(i),twse:[{market:"TWSE",code:"2330",foreignNet:2,trustNet:1}],
  tpex:[{market:"TPEx",code:"6488",foreignNet:-3,trustNet:0}]});
const recent=Array.from({length:10},(_,i)=>day(19-i));
const baseline=Array.from({length:60},(_,i)=>({date:date(19+i-59)}));
test("10 official days produce factual 5/10D sums but never fake 20/60D",()=>{
 const result=accumulateOfficialInstitutionalFlows(null,recent,baseline,"2026-11-20T00:00:00Z");
 const row=result.summary.rows.find(r=>r.code==="2330");
 assert.equal(row.foreign5d,10);assert.equal(row.foreign10d,20);
 assert.equal(row.foreign20d,null);assert.equal(row.foreign60d,null);
 assert.equal(result.summary.windows[20].status,"insufficient");
});
test("60 sequential archived sessions with a same-date official index support 60D",()=>{
 const old=Array.from({length:50},(_,i)=>day(9-i)).map(d=>({date:d.date,rows:[["TWSE","2330",2,1],["TPEx","6488",-3,0]]}));
 const r=accumulateOfficialInstitutionalFlows({version:1,days:old},recent,
   Array.from({length:60},(_,i)=>({date:date(19-i)})),"2026-11-20T00:00:00Z");
 const row=r.summary.rows.find(x=>x.market==="TWSE"&&x.code==="2330");
 assert.equal(row.foreign60d,120);
 assert.equal(row.trust20d,20);
 assert.equal(r.archive.days.length,60);
});
test("official benchmark gap or missing symbol refuses to mark full lookback",()=>{
 const old=Array.from({length:50},(_,i)=>({date:date(9-i),rows:[["TWSE","9999",9,0]]}));
 const r=accumulateOfficialInstitutionalFlows({version:1,days:old},recent,
   Array.from({length:60},(_,i)=>({date:date(19-i)})),"2026-11-20T00:00:00Z");
 assert.equal(r.summary.rows.find(x=>x.code==="2330").foreign20d,null);
 assert.equal(r.summary.rows.find(x=>x.code==="2330").observed20d,10);
});
test("bad previous archives, duplicate days and nonfinite official flows fail closed",()=>{
 assert.throws(()=>accumulateOfficialInstitutionalFlows({version:1,days:[{date:"2026-02-30",rows:[]}]},recent,[],"2026-11-20T00:00:00Z"));
 assert.throws(()=>accumulateOfficialInstitutionalFlows(null,[recent[0],recent[0],...recent.slice(2)],[],"2026-11-20T00:00:00Z"));
 const broken=[...recent];broken[0]={...recent[0],twse:[{market:"TWSE",code:"2330",foreignNet:NaN,trustNet:1}]};
 assert.throws(()=>accumulateOfficialInstitutionalFlows(null,broken,[],"2026-11-20T00:00:00Z"));
});
