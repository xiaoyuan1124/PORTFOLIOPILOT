import type {EtfComposition} from "./types";
export type EtfOverlapRow={key:string;symbol:string;name:string;weightA:number;weightB:number;commonPct:number;sector:string};
export type EtfOverlapResult={
  firstDate:string;secondDate:string;datesAligned:boolean;coverageA:number;coverageB:number;
  unknownA:number;unknownB:number;confirmedOverlapPct:number;confirmedCommonCount:number;
  shared:EtfOverlapRow[];
};
const positionKey=(market:string,symbol:string)=>`${market}:${symbol.trim().toUpperCase()}`;
function validatedMap(composition:EtfComposition) {
 const byKey=new Map<string,{symbol:string;name:string;sector:string;weight:number}>();
 for(const row of composition.constituents) {
  if(!Number.isFinite(row.weightPct)||row.weightPct<0||row.weightPct>100)
    throw new Error("成分權重無效，不計算 ETF 重疊。");
  const key=positionKey(row.market,row.symbol);
  if(byKey.has(key))throw new Error("成分名單內有重複證券代號，不自行合併可能雙算的權重。");
  byKey.set(key,{symbol:row.symbol,name:row.name,sector:row.sector,weight:row.weightPct});
 }
 const coverage=[...byKey.values()].reduce((sum,row)=>sum+row.weight,0);
 if(coverage>100.01)throw new Error("ETF 已知成分權重合計超過 100%，需先修正來源。");
 return {byKey,coverage:Math.min(100,coverage)};
}
/** Σ min(weight A, weight B) over dated, explicitly known common securities.
 * This is a lower bound when either composition is incomplete.
 */
export function compareEtfCompositions(a:EtfComposition,b:EtfComposition):EtfOverlapResult {
 if(positionKey(a.etfMarket,a.etfSymbol)===positionKey(b.etfMarket,b.etfSymbol))
   throw new Error("請選擇不同 ETF。");
 const first=validatedMap(a),second=validatedMap(b);
 const shared=[...first.byKey.entries()].flatMap(([key,item])=>{
  const other=second.byKey.get(key);
  return other?[{key,symbol:item.symbol,name:item.name||other.name,
    sector:item.sector||other.sector,weightA:item.weight,weightB:other.weight,
    commonPct:Math.min(item.weight,other.weight)}]:[];
 }).sort((a,b)=>b.commonPct-a.commonPct);
 return {
  firstDate:a.asOf,secondDate:b.asOf,datesAligned:a.asOf===b.asOf,
  coverageA:first.coverage,coverageB:second.coverage,
  unknownA:Math.max(0,100-first.coverage),unknownB:Math.max(0,100-second.coverage),
  confirmedOverlapPct:shared.reduce((sum,row)=>sum+row.commonPct,0),
  confirmedCommonCount:shared.length,shared
 };
}
