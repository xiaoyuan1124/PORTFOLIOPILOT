import {describe,it,expect} from "vitest";
import {rankDecisionRows,scanDecisionRow,type DecisionScanRow} from "./decision-scan";
import {groupDecisionSymbols,type TwPriceHistoryIndex} from "./price-history-data";
import type {CompanySnapshot} from "./company-snapshot";
const row=(key:string,status:DecisionScanRow["status"],score:number|null):DecisionScanRow=>({key,code:key,name:key,industry:"測試",market:"TWSE",status,score,coverage:100,bias:null,asOf:"2026-11-25",reason:""});
describe("decision scanner",()=>{
 it("orders eligible rows before waiting and risky rows, does not rank missing scores as buys",()=>{
   const rows=[row("A","risk",99),row("B","met",80),row("C","insufficient",null),row("D","met",90),row("E","wait",99)];
   expect(rankDecisionRows(rows,"all","").map(r=>r.key)).toEqual(["D","B","E","A","C"]);
   expect(rankDecisionRows(rows,"met","B").map(r=>r.key)).toEqual(["B"]);
   expect(rows[0]?.key).toBe("A");
 });
 it("groups by exchange and prefix",()=>{
   expect(groupDecisionSymbols([{market:"TWSE",code:"2330"},{market:"TWSE",code:"2317"},{market:"TPEx",code:"2330"}]).map(g=>g.length)).toEqual([2,1]);
 });
 it("fails closed on missing history",()=>{
   const snapshot:CompanySnapshot={code:"2330",name:"測試",market:"TWSE",industry:"半導體",type:"stock",quote:null,valuation:null,revenue:null,strategy:null};
   const index={generatedAt:"now",failed:[]} as unknown as TwPriceHistoryIndex;
   const result=scanDecisionRow({snapshot,peers:[],history:null,index,benchmark:null,today:"2026-11-25",latestMarketDate:null,horizon:"swing",offline:false});
   expect(result.status).toBe("insufficient");expect(result.score).toBeNull();
 });
});
