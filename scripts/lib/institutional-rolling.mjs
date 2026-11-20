/**
 * Incrementally retain official T86/TPEx daily trade flows for up to 60
 * sessions. The existing 10D pipeline supplies recent confirmed dates.
 * Do not infer missing sessions from weekdays or use a 10D sum as 60D.
 */
const WINDOWS=[5,10,20,60];
const validDate=date=>typeof date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&
  !Number.isNaN(Date.parse(date+"T00:00:00Z"))&&new Date(date+"T00:00:00Z").toISOString().slice(0,10)===date;
const validTuple=row=>Array.isArray(row)&&row.length===4&&
  ["TWSE","TPEx"].includes(row[0])&&typeof row[1]==="string"&&row[1].length>0&&
  Number.isFinite(row[2])&&Number.isFinite(row[3]);
function normalizeRecentDays(recent) {
 if(!Array.isArray(recent)||recent.length<10)throw new Error("Cannot establish ten official institutional trading days");
 const dates=new Set();
 return recent.map(day=>{
  if(!validDate(day.date)||dates.has(day.date))throw new Error("Invalid or repeated daily institutional market date");
  dates.add(day.date);
  if(!Array.isArray(day.twse)||day.twse.length<1||!Array.isArray(day.tpex)||day.tpex.length<1)
    throw new Error("Missing one official market in daily institutional report");
  const rows=[...day.twse,...day.tpex].map(row=>[row.market,row.code,row.foreignNet,row.trustNet]);
  if(!rows.every(validTuple))throw new Error("Invalid official institutional daily net flow");
  if(new Set(rows.map(row=>row[0]+":"+row[1])).size!==rows.length)
    throw new Error("Duplicate security within one official daily institutional source");
  return {date:day.date,rows};
 }).sort((a,b)=>b.date.localeCompare(a.date));
}
function normalizePrevious(previous) {
 if(!previous)return [];
 if(previous.version!==1||!Array.isArray(previous.days))throw new Error("Existing institutional history has incompatible format");
 const dates=new Set();
 return previous.days.map(day=>{
  if(!validDate(day.date)||dates.has(day.date)||!Array.isArray(day.rows)||!day.rows.every(validTuple))
    throw new Error("Previous institutional history is corrupted");
  dates.add(day.date);
  return day;
 });
}
export function accumulateOfficialInstitutionalFlows(previous,recent,benchmarkPoints,generatedAt) {
 const fresh=normalizeRecentDays(recent);
 const asOf=fresh[0].date;
 const saved=normalizePrevious(previous);
 const byDate=new Map(saved.map(day=>[day.date,day]));
 // New official reports replace the same day's older cache on a later fetch.
 for(const day of fresh)byDate.set(day.date,day);
 const days=[...byDate.values()].filter(day=>day.date<=asOf)
   .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,60);
 const archive={version:1,generatedAt,asOf,days};
 const availableDates=new Set(days.map(day=>day.date));
 const benchmarkDates=[...new Set((benchmarkPoints??[]).map(row=>row.date)
   .filter(validDate))].filter(date=>date<=asOf).sort().reverse();
 const benchmarkAligned=benchmarkDates[0]===asOf;
 const rowsByDate=new Map(days.map(day=>[day.date,new Map(day.rows.map(row=>[row[0]+":"+row[1],row]))]));
 const ranges={};
 for(const length of WINDOWS) {
  // 5/10D are based on this refresh's ten independently verified official
  // trading sessions, even when the TWSE index is temporarily delayed.
  const expected=length<=10?fresh.slice(0,length).map(day=>day.date):
    benchmarkAligned?benchmarkDates.slice(0,length):[];
  const good=expected.length===length&&expected.every(date=>availableDates.has(date));
  ranges[length]={
   status:good?"verified":"insufficient",
   startDate:good?expected.at(-1):null,endDate:good?expected[0]:null,
   observedSessions:good?length:expected.filter(date=>availableDates.has(date)).length,
   reason:good?"與已發布的官方交易日逐日對齊":benchmarkAligned
     ?"歷史交易日或法人原始紀錄尚不完整":"大盤官方交易日尚未與法人最新日期對齊"
  };
 }
 const latestCodes=[...new Set(fresh[0].rows.map(row=>row[0]+":"+row[1]))];
 const rows=latestCodes.map(key=>{
  const [market,code]=key.split(":");
  const result={market,code};
  for(const length of WINDOWS) {
   const window=ranges[length];
   const dates=window.status==="verified"
     ?(length<=10?fresh.slice(0,length).map(day=>day.date):benchmarkDates.slice(0,length))
     :[];
   let observed=0,foreign=0,trust=0;
   for(const date of dates) {
    const value=rowsByDate.get(date)?.get(key);
    if(!value)continue;
    observed++;foreign+=value[2];trust+=value[3];
   }
   result["observed"+length+"d"]=observed;
   result["foreign"+length+"d"]=observed===length?foreign:null;
   result["trust"+length+"d"]=observed===length?trust:null;
  }
  return result;
 }).sort((a,b)=>a.market.localeCompare(b.market)||a.code.localeCompare(b.code));
 const summary={
  version:1,generatedAt,asOf,sourceNames:["TWSE T86","TPEx institutional dailyTrade"],
  benchmarkDate:benchmarkAligned?asOf:(benchmarkDates[0]??null),
  windows:ranges,rows
 };
 return {archive,summary};
}
