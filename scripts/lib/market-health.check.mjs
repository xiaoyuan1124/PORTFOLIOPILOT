import test from "node:test";
import assert from "node:assert/strict";
import { classifyTaiwanOfficialCache,summarizeTaiwanMarketHealth } from "./market-health.mjs";
test("weekends are not treated as failed Taiwan sessions",()=>{
 const r=classifyTaiwanOfficialCache({asOf:"2026-11-20",generatedAt:"2026-11-20T10:00:00Z",now:new Date("2026-11-21T04:00:00Z")});
 assert.equal(r.status,"weekend");
});
test("weekday before published close is only awaiting; later stale date remains unverified",()=>{
 const pre=classifyTaiwanOfficialCache({asOf:"2026-11-19",generatedAt:"2026-11-19T12:00:00Z",now:new Date("2026-11-20T03:00:00Z")});
 assert.equal(pre.status,"awaiting");
 const after=classifyTaiwanOfficialCache({asOf:"2026-11-19",generatedAt:"2026-11-20T08:00:00Z",now:new Date("2026-11-20T12:00:00Z")});
 assert.equal(after.status,"pending_or_closed");
});
test("future dates, invalid calendar and future timestamps fail closed",()=>{
 assert.equal(classifyTaiwanOfficialCache({asOf:"2026-11-21",now:new Date("2026-11-20T12:00:00Z")}).status,"future");
 assert.equal(classifyTaiwanOfficialCache({asOf:"2026-02-30",now:new Date("2026-11-20T12:00:00Z")}).status,"invalid");
 assert.equal(classifyTaiwanOfficialCache({asOf:"2026-11-20",generatedAt:"2026-12-01T00:00:00Z",now:new Date("2026-11-20T12:00:00Z")}).status,"future");
});
test("reports date mismatch, partial failed history and absent US without inventing sessions",()=>{
 const now=new Date("2026-11-20T12:00:00Z");
 const r=summarizeTaiwanMarketHealth({now,quotes:{generatedAt:"2026-11-20T10:00:00Z",quotes:[{market:"TWSE",date:"2026-11-20"},{market:"TPEx",date:"2026-11-19"}]},benchmark:{generatedAt:"2026-11-20T10:00:00Z",benchmarks:[{id:"TWSE:TAIEX-PRICE",asOf:"2026-11-20"}]},history:{generatedAt:"2026-11-19T10:00:00Z",endDate:"2026-11-19",failed:[{market:"TWSE",date:"2026-11-18"}]}});
 assert.equal(r.errors.length,0);
 assert.ok(r.warnings.some(w=>w.includes("TWSE 與 TPEx")));
 assert.ok(r.warnings.some(w=>w.includes("抓取失敗")));
 assert.ok(r.us.includes("尚未建立"));
});
