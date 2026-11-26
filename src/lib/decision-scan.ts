import { assessStock,type Horizon } from "./stock-decision";
import type { CompanySnapshot } from "./company-snapshot";
import type { BenchmarkSeries } from "./benchmark";
import type { TwPriceHistoryIndex,TwPriceHistorySeries } from "./price-history-data";
import type { PortfolioRiskResult } from "./portfolio-risk";

export type DecisionScanRow={key:string;code:string;name:string;market:CompanySnapshot["market"];industry:string;status:"met"|"wait"|"risk"|"insufficient";score:number|null;coverage:number;bias:number|null;asOf:string;reason:string};
export function scanDecisionRow(input:{snapshot:CompanySnapshot;peers:readonly CompanySnapshot[];history:TwPriceHistorySeries|null;index:TwPriceHistoryIndex;benchmark:BenchmarkSeries|null;today:string;latestMarketDate:string|null;horizon:Horizon;offline:boolean;portfolioRisk?:PortfolioRiskResult|null}):DecisionScanRow {
  const {snapshot:s,history,index}=input;
  const base={key:s.market+":"+s.code,code:s.code,name:s.name,market:s.market,industry:s.industry,asOf:s.quote?.date??""};
  if(!history||history.generatedAt!==index.generatedAt||history.market!==s.market||history.symbol!==s.code.toUpperCase()||s.type!=="stock")return {...base,status:"insufficient",score:null,coverage:0,bias:null,reason:"缺少同版本個股歷史行情"};
  const issues=index.failed.filter(f=>f.market===s.market&&f.date>=(history.points[0]?.[0]??"")&&f.date<=(history.points.at(-1)?.[0]??"")).map(f=>f.date);
  const r=assessStock({snapshot:s,peers:input.peers,points:history.points,candles:(history.candles??[]).map(([date,open,high,low,close,volume])=>({date,open,high,low,close,volume})),benchmark:input.benchmark,horizon:input.horizon,today:input.today,latestMarketDate:input.latestMarketDate,offline:input.offline,portfolioRisk:input.portfolioRisk,historyIssues:issues});
  return {...base,asOf:r.asOf,status:r.status==="not_applicable"?"insufficient":r.status,score:r.status==="insufficient"||r.status==="not_applicable"?null:r.score,coverage:r.coverage,bias:r.technical.monthly.bias,reason:r.missing[0]??r.warnings[0]??r.unmetConditions[0]??"目前代理指標未觸發額外警告"};
}
export function rankDecisionRows(rows:readonly DecisionScanRow[], filter:"all"|DecisionScanRow["status"], query:string) {
  const needle=query.trim().toLowerCase();
  const order={met:0,wait:1,risk:2,insufficient:3};
  return rows.filter(r=>(filter==="all"||r.status===filter)&&(!needle||[r.code,r.name,r.industry,r.market].join(" ").toLowerCase().includes(needle))).sort((a,b)=>order[a.status]-order[b.status]||(b.score??-1)-(a.score??-1)||a.key.localeCompare(b.key));
}
