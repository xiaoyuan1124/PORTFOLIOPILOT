import {z} from "zod";
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const row=z.tuple([z.enum(["TWSE","TPEx"]),z.string().min(1),z.number().int().safe(),z.number().int().safe()]);
const schema=z.object({version:z.literal(1),generatedAt:z.string(),sources:z.array(z.object({name:z.string(),urlTemplate:z.string()})),days:z.array(z.object({date,rows:z.array(row)})).max(60)});
export type InstitutionalHistory=z.infer<typeof schema>;
export async function loadInstitutionalHistory():Promise<InstitutionalHistory>{
 const base=process.env.NEXT_PUBLIC_BASE_PATH??"";
 const r=await fetch(base+"/data/tw-institutional-history.json",{cache:"no-store"});
 if(!r.ok)throw new Error("逐日法人快取尚未建立。");
 const data=schema.parse(await r.json());
 if(new Set(data.days.map(d=>d.date)).size!==data.days.length)throw new Error("法人日期重複");
 return data;
}
export function stockFlows(data:InstitutionalHistory,market:"TWSE"|"TPEx",symbol:string,asOf:string,n:number){
 const days=data.days.filter(d=>d.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date)).slice(-n);
 let f=0,t=0,valid=true;
 const rows=days.map(d=>{const matches=d.rows.filter(r=>r[0]===market&&r[1]===symbol);if(matches.length!==1){valid=false;return {date:d.date,foreign:null,trust:null,foreignCum:null,trustCum:null};}const r=matches[0]!;f+=r[2];t+=r[3];return {date:d.date,foreign:r[2],trust:r[3],foreignCum:valid?f:null,trustCum:valid?t:null};});
 const complete=days.length===n&&valid;
 return {rows,complete,observed:rows.filter(r=>r.foreign!==null).length,foreignTotal:complete?f:null,trustTotal:complete?t:null,foreignBuyDays:complete?rows.filter(r=>r.foreign!==null&&r.foreign>0).length:null,trustBuyDays:complete?rows.filter(r=>r.trust!==null&&r.trust>0).length:null};
}
