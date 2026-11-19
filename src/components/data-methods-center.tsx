"use client";

import { useEffect, useState } from "react";
import { fetchMarketDataset } from "@/lib/market-data-url";

type Source = { name: string; url: string };
type Row = { id: string; title: string; date: string; generated: string; sources: Source[]; status: "ready"|"offline"|"unavailable" };
const catalogs = [
  { id:"tw-quotes.json", title:"台股收盤價", method:"上市 TWSE、上櫃 TPEx 獨立資料日；不等於盤中即時行情。" },
  { id:"tw-price-history/index.json",title:"個股歷史收盤",method:"依官方已發布交易日增量補抓；未記錄的日期不以零或前值填充。" },
  { id:"tw-benchmarks.json",title:"大盤指數與含息基準",method:"價格指數與總報酬指數分開；不得直接混合比較。" },
  { id:"tw-revenue.json",title:"單月營收",method:"MoM／YoY 依官方發布數字比較，缺月份不推估。" },
  { id:"tw-revenue-history.json",title:"營收歷史",method:"比較可驗證的相同月份；樣本不足顯示缺值。" },
  { id:"tw-valuations.json",title:"PE／PB／殖利率",method:"來源日期可能與股價不同；負 EPS 或無值時不推算正 PE。" },
  { id:"tw-institutional-10d.json",title:"法人累計",method:"10 個官方交易日買賣超是流量，不等於大股東持股存量。" },
  { id:"tw-quarterly-margins.json",title:"季度毛利率",method:"目前資料欄位為季度營收、成本與毛利；沒有 EPS/ROE/自由現金流完整來源。" },
  { id:"tw-material-events.json",title:"重大公告",method:"官方可取得事件摘要，不保證能解釋所有股價波動。" },
  { id:"tw-etf-compositions.json",title:"ETF 成分",method:"僅穿透已驗證成分權重，未知部分保留為未知；主動式 ETF 公布頻率依發行商而異。" }
] as const;

function object(value: unknown): Record<string,unknown>|null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string,unknown> : null;
}
function dateFrom(row: Record<string,unknown>): string {
  const dates: string[] = [];
  const pushDate=(value:unknown)=>{if(typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) dates.push(value);};
  pushDate(row.endDate);pushDate(row.asOf);
  for (const field of ["quotes","benchmarks","tradingDates","sources","compositions","periods"]) {
    const list=row[field];
    if (!Array.isArray(list)) continue;
    list.forEach((item)=> {
      if(typeof item==="string") pushDate(item);
      const record=object(item);
      if(record){pushDate(record.date);pushDate(record.asOf);pushDate(record.endDate);}
    });
  }
  return dates.sort().at(-1) ?? "參見原始資料";
}
function sourcesFrom(row: Record<string,unknown>): Source[] {
  if(!Array.isArray(row.sources))return [];
  const rows:Source[]=[];
  for(const value of row.sources) {
    const source=object(value);
    if(!source)continue;
    const name=typeof source.name==="string"?source.name:"官方資料";
    const url=typeof source.url==="string"?source.url:typeof source.urlTemplate==="string"?source.urlTemplate:"";
    if(/^https:\/\//.test(url) && !rows.some(item=>item.url===url))rows.push({name,url});
    if(rows.length===3)break;
  }
  return rows;
}
async function readOne(item: typeof catalogs[number]):Promise<Row>{
  try {
    const response=await fetchMarketDataset(item.id);
    if(!response.ok)throw new Error("HTTP "+response.status);
    const payload=object(await response.json());
    if(!payload)throw new Error("資料格式錯誤");
    return {id:item.id,title:item.title,date:dateFrom(payload),generated:typeof payload.generatedAt==="string"?payload.generatedAt:"未提供",sources:sourcesFrom(payload),status:response.headers.get("x-portfoliopilot-data-cache")==="offline"?"offline":"ready"};
  } catch {
    return {id:item.id,title:item.title,date:"無法驗證",generated:"無法取得",sources:[],status:"unavailable"};
  }
}

export function DataMethodsCenter() {
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState<Row[]|null>(null);
  useEffect(()=>{
    if(!open || rows)return;
    let active=true;
    void Promise.all(catalogs.map(readOne)).then(result=>{if(active)setRows(result);});
    return ()=>{active=false;};
  },[open,rows]);
  return <details className="lg:col-span-2 rounded-2xl border border-black/8 p-2 dark:border-white/10" data-ux-role="data-methods-center" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-2 text-sm font-semibold">
      <span>資料與方法</span><span className="text-[11px] font-normal text-black/45 dark:text-white/45">來源、日期、公式、限制</span>
    </summary>
    <div className="mt-2 grid gap-2">
      {!rows?<p className="px-3 py-2 text-xs text-black/50 dark:text-white/50">正在核對公開資料的發布日期…</p>:null}
      {rows?.map((item,i)=><details key={item.id} className="rounded-xl border border-black/6 px-3 py-2 text-xs dark:border-white/8">
        <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2">
          <span className="font-semibold">{item.title}</span>
          <span className={item.status==="ready"?"text-black/45 dark:text-white/45":"text-amber-700 dark:text-amber-300"}>{item.status==="unavailable"?"暫無資料":item.status==="offline"?"離線備援":item.date}</span>
        </summary>
        <div className="space-y-2 border-t border-black/6 py-2 leading-5 text-black/60 dark:border-white/8 dark:text-white/60">
          <p>{catalogs[i]?.method}</p>
          <p>來源資料日：{item.date} · 快取產生時間：{item.generated}</p>
          <a className="inline-block underline underline-offset-2" href={"https://raw.githubusercontent.com/xiaoyuan1124/PORTFOLIOPILOT/main/public/data/"+item.id} target="_blank" rel="noreferrer">查看公開原始快取</a>
          {item.sources.map(source=><p key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{source.name} 官方來源</a></p>)}
        </div>
      </details>)}
      <p className="px-2 text-[11px] leading-5 text-black/45 dark:text-white/45">個人持股、成本、記帳及交易計畫預設僅存在本機。USD 行情、EPS、ROE、法人 60 日與大戶持股等未完整涵蓋的資料不會被假設為已提供。所有資料只作研究參考，不等於委託或投資建議。</p>
    </div>
  </details>;
}
