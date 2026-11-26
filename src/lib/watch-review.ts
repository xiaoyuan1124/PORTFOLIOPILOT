import {z} from "zod";
import {DECISION_VERSION,validDate,type Horizon} from "./stock-decision";
import type {DecisionScanRow} from "./decision-scan";
export const WATCH_REVIEW_KEY="portfoliopilot:watch-review";
const entry=z.object({key:z.string().regex(/^(TWSE|TPEx):[A-Z0-9]+$/),asOf:z.string().refine(validDate),status:z.enum(["met","wait","risk"]),name:z.string().max(150)});
const schema=z.object({version:z.literal(DECISION_VERSION),horizon:z.enum(["short","swing","long"]),rows:z.array(entry).max(3000)});
export type WatchReview=z.infer<typeof schema>;
export function parseWatchReview(raw:string|null,horizon:Horizon):WatchReview|null{
 try{const p=schema.parse(JSON.parse(raw??"null"));return p.horizon===horizon?p:null;}catch{return null;}
}
export function compareWatchReview(previous:WatchReview|null,rows:readonly DecisionScanRow[],horizon:Horizon,asOf:string,verified:boolean,watchKeys:ReadonlySet<string>){
 const prior=new Map((previous?.horizon===horizon?previous.rows:[]).filter(x=>watchKeys.has(x.key)).map(x=>[x.key,x]));
 const changes:{key:string;name:string;asOf:string;from:string;to:string}[]=[];
 if(!verified||!validDate(asOf))return {changes,next:null};
 for(const row of rows){
  if(!watchKeys.has(row.key)||row.status==="insufficient"||row.score===null||!Number.isFinite(row.score)||row.asOf!==asOf)continue;
  const old=prior.get(row.key);if(old&&old.asOf>=row.asOf)continue;
  if(old&&old.status!==row.status)changes.push({key:row.key,name:row.name,asOf:row.asOf,from:old.status,to:row.status});
  const parsed=entry.safeParse({key:row.key,name:row.name,asOf:row.asOf,status:row.status});if(parsed.success)prior.set(row.key,parsed.data);
 }
 const next=schema.safeParse({version:DECISION_VERSION,horizon,rows:[...prior.values()]});
 return {changes,next:next.success?next.data:null};
}
