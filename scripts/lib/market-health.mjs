const DAY=86_400_000;
function dateKey(now,zone) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",weekday:"short",hour:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const get=k=>parts.find(p=>p.type===k)?.value??"";
  return {date:`${get("year")}-${get("month")}-${get("day")}`,weekday:get("weekday"),hour:Number(get("hour"))};
}
function validDate(s) {
  if(typeof s!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(s+"T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===s;
}
function parsedGenerated(generatedAt,now) {
  if(typeof generatedAt!=="string")return "absent";
  const time=Date.parse(generatedAt);
  if(!Number.isFinite(time))return "invalid";
  if(time>now.getTime()+3600_000)return "future";
  return "ok";
}
export function classifyTaiwanOfficialCache({asOf,generatedAt,now=new Date(),publicationHour=16}) {
  const parts=dateKey(now,"Asia/Taipei");
  if(!validDate(asOf))return {status:"invalid",reason:"資料日無法驗證"};
  if(asOf>parts.date)return {status:"future",reason:"資料日位於臺灣今天之後"};
  const generated=parsedGenerated(generatedAt,now);
  if(generated==="future"||generated==="invalid")return {status:generated,reason:"快取時間戳有問題"};
  const weekday=["Mon","Tue","Wed","Thu","Fri"].includes(parts.weekday);
  if(!weekday)return {status:"weekend",reason:"週末非例行平日；不宣稱已核實所有假期"};
  if(parts.hour<publicationHour)return {status:"awaiting",reason:"正常官方公布窗口尚未結束"};
  if(asOf===parts.date)return {status:"current",reason:"今日已取得有效官方日期"};
  const age=Math.floor((Date.parse(parts.date+"T00:00:00Z")-Date.parse(asOf+"T00:00:00Z"))/DAY);
  if(age>=4)return {status:"stale",reason:"官方日期連續數日未前進；請查排程、官方休市及資料源"};
  return {status:"pending_or_closed",reason:generated==="ok"?"收盤尚未確定：可能官方未公布、休市或排程延遲；需核對官方日曆與 Actions":"時間戳不完整；需核對官方日曆與 Actions"};
}
export function summarizeTaiwanMarketHealth({quotes,benchmark,history,now=new Date()}) {
  const errors=[],warnings=[],rows=[];
  if(!quotes || !Array.isArray(quotes.quotes))errors.push("官方個股收盤快取缺失或結構不正確");
  const quotesList=Array.isArray(quotes?.quotes)?quotes.quotes:[];
  for(const market of ["TWSE","TPEx"]) {
    const dates=quotesList.filter(q=>q.market===market).map(q=>q.date).filter(validDate).sort();
    const asOf=dates.at(-1);
    const result=classifyTaiwanOfficialCache({asOf,generatedAt:quotes?.generatedAt,now});
    rows.push({kind:market,asOf:asOf??null,...result});
  }
  const bench=Array.isArray(benchmark?.benchmarks)?benchmark.benchmarks.find(b=>b.id==="TWSE:TAIEX-PRICE"):null;
  const benchmarkStatus=classifyTaiwanOfficialCache({asOf:bench?.asOf,generatedAt:benchmark?.generatedAt,now});
  rows.push({kind:"TAIEX",asOf:bench?.asOf??null,...benchmarkStatus});
  const historyStatus=classifyTaiwanOfficialCache({asOf:history?.endDate,generatedAt:history?.generatedAt,now});
  rows.push({kind:"TW_HISTORY",asOf:history?.endDate??null,...historyStatus});
  const failed=Array.isArray(history?.failed)?history.failed.length:0;
  if(failed)warnings.push(`官方個股歷史存在 ${failed} 筆已記錄的抓取失敗，需下次補抓`);
  const quoteDays=rows.filter(r=>r.kind==="TWSE"||r.kind==="TPEx").map(r=>r.asOf).filter(Boolean);
  if(quoteDays.length===2 && quoteDays[0]!==quoteDays[1])warnings.push("TWSE 與 TPEx 收盤資料不同步，必須分別標示日期");
  for(const row of rows) {
    if(["invalid","future"].includes(row.status))errors.push(`${row.kind} 資料日無效：${row.reason}`);
    if(row.status==="stale")warnings.push(`${row.kind} 資料日期落後：${row.asOf}；${row.reason}`);
    if(row.status==="pending_or_closed")warnings.push(`${row.kind} 仍需官方或排程確認：${row.asOf}`);
  }
  return {rows,warnings,errors,us:"尚未建立可驗證且授權合規的美股收盤行情管線，不宣稱會每日更新。"};
}
