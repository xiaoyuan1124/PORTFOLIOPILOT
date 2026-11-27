// Keep a bounded per-session archive; do not invent a missing day or missing security.
export function mergeInstitutionalHistory(previous, accepted, maxDays=60){
  const datePattern=/^\d{4}-\d{2}-\d{2}$/;
  const byDate=new Map();
  for(const d of previous??[]){
    if(!datePattern.test(d?.date)||!Array.isArray(d.rows))throw new Error("Invalid institutional archive date");
    byDate.set(d.date,d);
  }
  for(const day of accepted){
    if(!datePattern.test(day.date)||!Array.isArray(day.twse)||!Array.isArray(day.tpex))throw new Error("Invalid institutional snapshot");
    const seen=new Set();
    const rows=[...day.twse,...day.tpex].map(r=>{
      const key=r.market+":"+r.code;
      if(seen.has(key)||!["TWSE","TPEx"].includes(r.market)||!r.code||!Number.isSafeInteger(r.foreignNet)||!Number.isSafeInteger(r.trustNet))throw new Error("Duplicate or invalid institutional row: "+key);
      seen.add(key);
      return [r.market,r.code,r.foreignNet,r.trustNet];
    }).sort((a,b)=>(a[0]+":"+a[1]).localeCompare(b[0]+":"+b[1]));
    byDate.set(day.date,{date:day.date,rows});
  }
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-maxDays);
}
