import {describe,it,expect} from "vitest";
import {compareWatchReview,parseWatchReview} from "./watch-review";
import type {DecisionScanRow} from "./decision-scan";
const row:DecisionScanRow={key:"TWSE:2330",code:"2330",market:"TWSE",name:"A",industry:"半導體",status:"wait",score:70,coverage:100,bias:1,asOf:"2026-11-25",reason:""};
const keys=new Set([row.key]);
describe("local watch review",()=>{
 it("compares only new verified trading dates for the same horizon",()=>{
 const initial=compareWatchReview(null,[row],"swing",row.asOf,true,keys);
 expect(initial.changes).toEqual([]);expect(initial.next?.rows).toHaveLength(1);
 const next={...row,status:"met" as const,asOf:"2026-11-26"};
 expect(compareWatchReview(initial.next,[next],"swing",next.asOf,true,keys).changes).toMatchObject([{from:"wait",to:"met"}]);
 expect(compareWatchReview(initial.next,[next],"swing",next.asOf,false,keys).next).toBeNull();
 expect(compareWatchReview(initial.next,[{...next,asOf:row.asOf}],"swing",row.asOf,true,keys).changes).toEqual([]);
 expect(compareWatchReview(initial.next,[{...next,status:"insufficient"}],"swing",next.asOf,true,keys).next?.rows[0]?.asOf).toBe(row.asOf);
 expect(parseWatchReview(JSON.stringify(initial.next),"long")).toBeNull();
 expect(parseWatchReview("broken","swing")).toBeNull();
 expect(compareWatchReview(initial.next,[next],"swing",next.asOf,true,new Set()).next?.rows).toEqual([]);
 });
});
