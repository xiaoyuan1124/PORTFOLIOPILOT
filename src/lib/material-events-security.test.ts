import {describe,it,expect} from "vitest";
import {materialEventsForSecurity,type MaterialEventCache,type MaterialEventRow} from "./material-events-data";
const row=(market:MaterialEventRow["market"],code:string,publishedDate:string):MaterialEventRow=>({market,code,publishedDate,publishedTime:"12:00:00",name:"A",factDate:null,rule:"",subject:"公告",detail:""});
describe("selected security events",()=>{
 it("does not mix exchanges, symbols, or mutate the published cache",()=>{
  const cache:MaterialEventCache={generatedAt:"now",retentionDays:45,sources:[],rows:[row("TWSE","2330","2026-11-23"),row("TPEx","2330","2026-11-25"),row("TWSE","2317","2026-11-25"),row("TWSE","2330","2026-11-24")]};
  expect(materialEventsForSecurity(cache,"TWSE","2330").map(r=>r.publishedDate)).toEqual(["2026-11-24","2026-11-23"]);
  expect(cache.rows[0]?.publishedDate).toBe("2026-11-23");
  expect(materialEventsForSecurity(cache,"TWSE","2330",1)).toHaveLength(1);
 });
});
