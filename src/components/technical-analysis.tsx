"use client";
import {useMemo,useState,useRef,type PointerEvent} from "react";
import {InstitutionalHistoryPanel} from "./institutional-history-panel";
import type {TwPriceHistorySeries} from "@/lib/price-history-data";
import {buildWorkbenchBars,type ChartPeriod} from "@/lib/workbench-chart";
import {taipeiDate} from "@/lib/stock-decision";
import {indicator,INDICATOR_NAMES,supportResistance,type Plot} from "@/lib/technical-analysis-v2";
const periods=[["day","日K"],["week","週K"],["month","月K"]] as const;
type Setting={id:string;n:number;key:number};
type Anchor={date:string;price:number};
type Drawing={kind:"horizontal"|"trend"|"fib"|"box";anchors:Anchor[]};
const initial:Setting[]=[{id:"ma",n:5,key:1},{id:"ma",n:20,key:2},{id:"ma",n:60,key:3},{id:"vol",n:20,key:4},{id:"macd",n:12,key:5},{id:"rsi",n:14,key:6}];
const defaults:Record<string,number>={rsi:14,kd:9,stochrsi:14,atr:14,adx:14,mfi:14,willr:14,roc:12,supertrend:10,macd:12};
const fixed=new Set(["vol","macd","sar","obv","pvt"]);
const palette=["#c08a34","#7999d8","#a98bc9","#289b8a","#db6670"];
const fmt=(n:number|null|undefined)=>typeof n==="number"&&Number.isFinite(n)?n.toLocaleString("zh-TW",{maximumFractionDigits:2}):"—";
const btn="min-h-10 rounded-md border border-current/15 px-2 text-xs font-medium";
const onButton=(active:boolean)=>btn+(active?" bg-current/10 ring-1 ring-current/35":"");
const isNumber=(v:number|null|undefined):v is number=>typeof v==="number"&&Number.isFinite(v);
function loadDrawings(key:string):Drawing[]{try{const raw:unknown=JSON.parse(localStorage.getItem(key)??"[]");if(!Array.isArray(raw))return [];return raw.filter((v):v is Drawing=>v&&["horizontal","trend","fib","box"].includes(v.kind)&&Array.isArray(v.anchors)&&v.anchors.length===(v.kind==="horizontal"?1:2)&&v.anchors.every((a:Anchor)=>typeof a.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(a.date)&&isNumber(a.price)&&a.price>0)).slice(0,100);}catch{return [];}}
export function TechnicalAnalysis({history}:{history:TwPriceHistorySeries}){
 const [period,setPeriod]=useState<ChartPeriod>("day"),[mode,setMode]=useState<"candle"|"close"|"bar">("candle");
 const [settings,setSettings]=useState<Setting[]>(initial),[pick,setPick]=useState("boll"),[param,setParam]=useState(20);
 const nextKey=useRef(7);
 const [count,setCount]=useState(80),[offset,setOffset]=useState(0),[cursor,setCursor]=useState<string|null>(null);
 const [full,setFull]=useState(false),[log,setLog]=useState(false),[showLevels,setShowLevels]=useState(true);
 const [replay,setReplay]=useState<number|null>(null);
 const [tool,setTool]=useState<"none"|Drawing["kind"]>("none");
 const storageKey="pp:analysis-drawings:"+history.market+":"+history.symbol;
 const [drawings,setDrawings]=useState<Drawing[]|null>(null),[pending,setPending]=useState<Anchor[]>([]);
 const [hidden,setHidden]=useState(false);
 const drag=useRef<{x:number;offset:number;id:number}|null>(null);
 const bars=useMemo(()=>buildWorkbenchBars(history.points,history.candles??[],taipeiDate(),period),[history,period]);
 const visible=useMemo(()=>replay===null?bars:bars.slice(0,Math.max(1,Math.min(bars.length,replay))),[bars,replay]);
 const items=useMemo(()=>settings.map(s=>{const r=indicator(visible,s.id,s.n);return {...r,key:s.key,n:s.n,plots:r.plots.map(p=>({...p,color:r.main&&r.plots.length===1?palette[(s.key-1)%palette.length]!:p.color, label:p.label}))};}),[visible,settings]);
 const levels=useMemo(()=>supportResistance(visible),[visible]);
 const end=Math.max(0,visible.length-offset),start=Math.max(0,end-count);
 const rows=visible.slice(start,end);
 const main=items.filter(s=>s.main).flatMap(s=>s.plots);
 const sub=items.filter(s=>!s.main);
 const cursorIndex=cursor?rows.findIndex(r=>r.date===cursor):-1;
 const selectedIndex=cursorIndex>=0?cursorIndex:Math.max(0,rows.length-1);
 const selected=rows[selectedIndex];
 const values=rows.flatMap((r,i)=>[r.close,...[r.high,r.low].filter(isNumber),...main.map(p=>p.values[start+i]).filter(isNumber)]).filter(isNumber);
 const useLog=log&&values.every(x=>x>0);
 const transform=(v:number)=>useLog?Math.log(v):v,untransform=(v:number)=>useLog?Math.exp(v):v;
 const min=Math.min(...values.map(transform)),max=Math.max(...values.map(transform)),pad=Math.max((max-min)*.07,Math.abs(max)*.0005,.001);
 const lower=min-pad,upper=max+pad;
 const W=800,H=350,left=10,right=720,top=12,bottom=310;
 const x=(i:number)=>left+(i+.5)*(right-left)/Math.max(1,rows.length);
 const y=(v:number)=>top+(upper-transform(v))/(upper-lower)*(bottom-top);
 const fromY=(v:number)=>untransform(upper-(v-top)/(bottom-top)*(upper-lower));
 const barWidth=Math.max(1,Math.min(13,(right-left)/Math.max(1,rows.length)*.66));
 const path=(p:Plot)=>{let d="",prev=false;rows.forEach((_,i)=>{const v=p.values[start+i];if(!isNumber(v)||(useLog&&v<=0)){prev=false;return;}d+=(prev?" L":" M")+x(i)+" "+y(v);prev=true;});return d;};
 const currentDrawings=drawings??[];
 function saveDrawings(next:Drawing[]){setDrawings(next);try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{/* chart remains available in memory */}}
 function ensureDrawings(){if(drawings===null)setDrawings(loadDrawings(storageKey));}
 function resetPeriod(p:ChartPeriod){setPeriod(p);setOffset(0);setCursor(null);setReplay(null);setPending([]);}
 function coord(e:PointerEvent<SVGSVGElement>){const matrix=e.currentTarget.getScreenCTM();if(matrix){const point=e.currentTarget.createSVGPoint();point.x=e.clientX;point.y=e.clientY;const local=point.matrixTransform(matrix.inverse());return {px:local.x,py:local.y};}const r=e.currentTarget.getBoundingClientRect();return {px:(e.clientX-r.left)*W/r.width,py:(e.clientY-r.top)*H/r.height};}
 function indexAt(px:number){return Math.min(rows.length-1,Math.max(0,Math.floor((px-left)/(right-left)*rows.length)));}
 function down(e:PointerEvent<SVGSVGElement>){if(!rows.length)return;const {px,py}=coord(e);if(px<left||px>right||py<top||py>bottom)return;const i=indexAt(px);setCursor(rows[i]!.date);
  if(tool!=="none"){const price=fromY(py);if(!Number.isFinite(price)||price<=0)return;const a={date:rows[i]!.date,price};const anchors=[...pending,a];if(anchors.length===(tool==="horizontal"?1:2)){saveDrawings([...(drawings??loadDrawings(storageKey)),{kind:tool,anchors}].slice(-100));setPending([]);setTool("none");}else setPending(anchors);return;}
  drag.current={x:e.clientX,offset,id:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);
 }
 function move(e:PointerEvent<SVGSVGElement>){if(!rows.length)return;const {px}=coord(e);if(drag.current?.id===e.pointerId&&Math.abs(e.clientX-drag.current.x)>6){const width=e.currentTarget.getBoundingClientRect().width;setOffset(Math.min(Math.max(0,visible.length-1),Math.max(0,drag.current.offset+Math.round((e.clientX-drag.current.x)/width*rows.length))));setCursor(null);}else setCursor(rows[indexAt(px)]!.date);}
 const dateX=(date:string)=>{const i=rows.findIndex(r=>r.start<=date&&r.date>=date);return i<0?null:x(i);};
 const cap=Math.max(20,Math.min(500,visible.length));
 if(!rows.length)return <p role="status">沒有可驗證的歷史價格，無法顯示專業分析。</p>;
 return <section aria-label="專業技術分析" data-testid="technical-analysis" className={(full?"fixed inset-0 z-50 overflow-auto bg-white p-3 dark:bg-neutral-950 ":"")+"space-y-3"}>
  <div className="flex flex-wrap items-center gap-2"><strong>{history.symbol} {history.name}｜技術分析</strong><button className={btn} onClick={()=>setFull(v=>!v)}>{full?"退出全螢幕":"全螢幕"}</button><button className={onButton(log)} onClick={()=>setLog(v=>!v)}>對數軸</button><button className={onButton(showLevels)} onClick={()=>setShowLevels(v=>!v)}>支撐壓力</button></div>
  <div className="flex flex-wrap gap-1">{periods.map(([p,l])=><button key={p} className={onButton(period===p)} aria-pressed={period===p} onClick={()=>resetPeriod(p)}>{l}</button>)}{(["candle","close","bar"] as const).map(m=><button key={m} className={onButton(mode===m)} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m==="candle"?"蠟燭":m==="close"?"收盤線":"OHLC線"}</button>)}<button className={btn} onClick={()=>setCount(n=>Math.max(10,Math.floor(n*.7)))}>放大</button><button className={btn} onClick={()=>setCount(n=>Math.min(cap,Math.ceil(n*1.4)))}>縮小</button><button className={btn} onClick={()=>{setOffset(0);setCursor(null);}}>最新</button></div>
  <div className="flex flex-wrap gap-2 text-xs"><label>指標 <select className="max-w-44 rounded border p-2 bg-transparent" value={pick} onChange={e=>{setPick(e.target.value);setParam(defaults[e.target.value]??20);}}>{Object.entries(INDICATOR_NAMES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>{!fixed.has(pick)&&<label>週期 <input aria-label="指標週期" className="w-20 rounded border p-2 bg-transparent" type="number" min={2} max={500} value={param} onChange={e=>setParam(Number(e.target.value))}/></label>}<button className={btn} disabled={settings.length>=16||!Number.isInteger(param)||param<2||param>500} onClick={()=>{const key=nextKey.current++;setSettings(s=>[...s,{id:pick,n:param,key}]);}}>新增指標</button><button className={btn} onClick={()=>setSettings(initial)}>重設</button></div>
  <div className="flex flex-wrap gap-1">{items.map(s=><button title="移除指標" className={btn} key={s.key} onClick={()=>setSettings(a=>a.filter(t=>t.key!==s.key))}>{s.name}{fixed.has(s.id)?"":" "+s.n} ×</button>)}</div>
  <div className="flex flex-wrap gap-1"><button className={btn} onClick={ensureDrawings}>讀取畫線</button>{(["horizontal","trend","fib","box"] as const).map(t=><button key={t} className={onButton(tool===t)} onClick={()=>{ensureDrawings();setTool(t);setPending([]);}}>{t==="horizontal"?"水平線":t==="trend"?"趨勢線":t==="fib"?"斐波那契":"區域框"}</button>)}<button className={btn} onClick={()=>{setTool("none");setPending([]);}}>取消畫線</button><button className={btn} onClick={()=>saveDrawings((drawings??loadDrawings(storageKey)).slice(0,-1))}>撤銷最後一筆</button><button className={btn} onClick={()=>setHidden(v=>!v)}>{hidden?"顯示畫線":"隱藏畫線"}</button></div>
  {tool!=="none"&&<p className="text-xs" role="status">在價格圖上選取{tool==="horizontal"?"一個價位":pending.length?"第二個位置":"第一個位置"}。</p>}
  <p className="text-xs opacity-75">{rows[0]?.start}～{rows.at(-1)?.date}｜原始未還原價格｜{rows.filter(r=>r.open!==null).length}/{rows.length} 筆完整OHLCV；週／月使用該週期實際收盤計算指標，首尾可能不完整。</p>
  <div className="flex flex-wrap gap-3 text-xs">{main.map((p,i)=><span key={i} style={{color:p.color}}>{p.label} {fmt(p.values[start+selectedIndex])}</span>)}</div>
  <svg role="img" aria-label="互動歷史價格主圖" viewBox="0 0 800 350" className="w-full max-h-[65vh] select-none" style={{touchAction:"pan-y"}} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
   {Array.from({length:7},(_,i)=>{const t=upper-i*(upper-lower)/6,v=untransform(t);return <g key={i}><line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="currentColor" opacity=".15"/><text x={right+7} y={y(v)+4} fontSize="13" fill="currentColor">{fmt(v)}</text></g>;})}
   {mode==="close"?<path d={path({label:"收盤",color:"currentColor",values:visible.map(r=>r.close)})} stroke="currentColor" strokeWidth="2" fill="none"/>:rows.map((r,i)=>{if(!isNumber(r.open)||!isNumber(r.high)||!isNumber(r.low))return <circle key={r.date} cx={x(i)} cy={y(r.close)} r="2" fill="currentColor"/>;return <g key={r.date} className={r.close>r.open?"wb-price-up":r.close<r.open?"wb-price-down":"wb-price-flat"}><line x1={x(i)} x2={x(i)} y1={y(r.high)} y2={y(r.low)} stroke="currentColor"/>{mode==="candle"?<rect x={x(i)-barWidth/2} y={Math.min(y(r.open),y(r.close))} width={barWidth} height={Math.max(1,Math.abs(y(r.open)-y(r.close)))} fill="currentColor"/>:<path d={"M"+(x(i)-barWidth/2)+" "+y(r.open)+" H"+x(i)+" M"+x(i)+" "+y(r.close)+" H"+(x(i)+barWidth/2)} stroke="currentColor" fill="none"/>}</g>;})}
   {main.map((p,i)=>p.kind==="point"?<g key={i}>{rows.map((_,j)=>isNumber(p.values[start+j])&&(!useLog||p.values[start+j]!>0)?<circle key={j} cx={x(j)} cy={y(p.values[start+j]!)} r="2" fill={p.color}/>:null)}</g>:<path key={i} d={path(p)} stroke={p.color} strokeWidth="1.8" fill="none"/>)}
   {showLevels&&levels.filter(l=>l.price>=untransform(lower)&&l.price<=untransform(upper)).map((l,i)=><g key={i}><line x1={left} x2={right} y1={y(l.price)} y2={y(l.price)} stroke={l.kind==="support"?"#289b8a":"#db6670"} strokeDasharray="5 5"/><text x={left+5} y={y(l.price)-3} fontSize="11" fill="currentColor">{l.kind==="support"?"支撐":"壓力"} {fmt(l.price)}</text></g>)}
   {!hidden&&currentDrawings.map((d,i)=>{const a=d.anchors[0]!,b=d.anchors[1],ax=dateX(a.date),bx=b?dateX(b.date):null;if(a.price<untransform(lower)||a.price>untransform(upper))return null;const ay=y(a.price);if(d.kind==="horizontal")return <line key={i} x1={left} x2={right} y1={ay} y2={ay} stroke="#b987cf" strokeWidth="2"/>;if(!b||ax===null||bx===null||(useLog&&b.price<=0))return null;const by=y(b.price);if(d.kind==="trend")return <line key={i} x1={ax} x2={bx} y1={ay} y2={by} stroke="#b987cf" strokeWidth="2"/>;if(d.kind==="box")return <rect key={i} x={Math.min(ax,bx)} y={Math.min(ay,by)} width={Math.abs(bx-ax)} height={Math.abs(by-ay)} stroke="#b987cf" fill="#b987cf22"/>;return <g key={i}>{[0,.236,.382,.5,.618,.786,1].map(r=><g key={r}><line x1={Math.min(ax,bx)} x2={right} y1={y(a.price+(b.price-a.price)*r)} y2={y(a.price+(b.price-a.price)*r)} stroke="#b987cf" opacity=".8"/><text x={right-52} y={y(a.price+(b.price-a.price)*r)-3} fontSize="11" fill="currentColor">{r}</text></g>)}</g>;})}
   {selected&&<g><line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={bottom} stroke="currentColor" opacity=".55" strokeDasharray="4 4"/><line x1={left} x2={right} y1={y(selected.close)} y2={y(selected.close)} stroke="currentColor" opacity=".45" strokeDasharray="4 4"/></g>}
   {Array.from(new Set([0,Math.floor(rows.length/3),Math.floor(rows.length*2/3),rows.length-1])).map(i=><text key={i} x={x(i)} y="337" textAnchor={i===0?"start":i===rows.length-1?"end":"middle"} fontSize="12" fill="currentColor">{rows[i]?.date.slice(5)}</text>)}
  </svg>
  <label className="block text-xs">歷史位置 <input type="range" aria-label="移動歷史視窗" className="min-h-10 w-full" min={0} max={Math.max(0,visible.length-1)} value={offset} onChange={e=>{setOffset(Number(e.target.value));setCursor(null);}}/></label>
  <label className="block text-xs">查看日期：{selected?.date}<input type="range" aria-label="查看圖表日期" className="block min-h-10 w-full" min={0} max={Math.max(0,rows.length-1)} value={selectedIndex} onChange={e=>setCursor(rows[Number(e.target.value)]?.date??null)}/></label>
  {selected&&<div className="text-xs flex flex-wrap gap-3"><strong data-testid="technical-selected-date">{selected.date}</strong><span>開 {fmt(selected.open)}</span><span>高 {fmt(selected.high)}</span><span>低 {fmt(selected.low)}</span><span>收 {fmt(selected.close)}</span><span>量（股）{fmt(selected.volume)}</span></div>}
  {sub.map(s=>{const vals=s.plots.flatMap(p=>p.values.slice(start,end).filter(isNumber));const all=[...vals,...(s.levels??[]),...(s.plots.some(p=>p.kind==="bar")?[0]:[])];if(!vals.length)return <p key={s.key} className="text-xs opacity-75">{s.name}：資料或暖機期間不足，未繪圖。</p>;const mn=Math.min(...all),mx=Math.max(...all),pad=Math.max((mx-mn)*.08,Math.abs(mx)*.001,.001);const yy=(v:number)=>10+(mx+pad-v)/(mx-mn+2*pad)*90;return <div className="border-t border-current/15 pt-2" key={s.key}><div className="flex flex-wrap gap-3 text-xs"><strong>{s.name} {fixed.has(s.id)?"":s.n}</strong>{s.plots.map((p,i)=><span key={i} style={{color:p.color}}>{p.label} {fmt(p.values[start+selectedIndex])}</span>)}</div><svg viewBox="0 0 800 115" role="img" aria-label={s.name+"歷史曲線"} className="w-full" onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();setCursor(rows[indexAt((e.clientX-r.left)*800/r.width)]!.date);}}>
    {(s.levels??[]).map(v=><g key={v}><line x1={left} x2={right} y1={yy(v)} y2={yy(v)} stroke="currentColor" strokeDasharray="4 4" opacity=".3"/><text x={right+5} y={yy(v)+4} fontSize="12" fill="currentColor">{fmt(v)}</text></g>)}
    {s.plots.map((p,i)=>p.kind==="bar"?<g key={i}>{rows.map((r,j)=>{const v=p.values[start+j];if(!isNumber(v))return null;return <rect key={r.date} x={x(j)-barWidth/2} y={Math.min(yy(v),yy(0))} width={barWidth} height={Math.max(.5,Math.abs(yy(v)-yy(0)))} fill={s.id==="vol"?(r.open===null?p.color:r.close>=r.open?"#db6670":"#289b8a"):v>=0?"#db6670":"#289b8a"} opacity=".75"/>;})}</g>:<path key={i} d={(()=>{let d="",prev=false;rows.forEach((_,j)=>{const v=p.values[start+j];if(!isNumber(v)){prev=false;return;}d+=(prev?" L":" M")+x(j)+" "+yy(v);prev=true;});return d;})()} stroke={p.color} strokeWidth="1.8" fill="none"/>)}
    <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1="0" y2="110" stroke="currentColor" opacity=".4" strokeDasharray="4 4"/>
  </svg></div>;})}
  <div className="border-t border-current/15 pt-3 space-y-2"><strong className="text-sm">關鍵價位（已確認局部轉折）</strong>{levels.length?levels.map((l,i)=><div key={i} className="flex justify-between text-xs"><span>{l.kind==="support"?"支撐":"壓力"} {l.date}</span><span>{fmt(l.price)} 元 · {fmt((l.price/visible.at(-1)!.close-1)*100)}%</span></div>):<p className="text-xs">完整高低價或已確認轉折不足。</p>}</div>
  <div className="border-t border-current/15 pt-3 space-y-2"><strong className="text-sm">歷史行情重播（只分析，不下單）</strong><div className="flex flex-wrap gap-2"><button className={btn} disabled={bars.length<2} onClick={()=>{setReplay(Math.min(40,bars.length-1));setOffset(0);setCursor(null);setHidden(true);}}>開始重播</button><button className={btn} disabled={replay===null||replay>=bars.length} onClick={()=>{setReplay(r=>r===null?null:Math.min(bars.length,r+1));setOffset(0);setCursor(null);}}>下一根</button><button className={btn} disabled={replay===null} onClick={()=>{setReplay(null);setOffset(0);setCursor(null);}}>結束</button></div>{replay!==null&&<p className="text-xs">已揭露 {visible.length} / {bars.length} 根；指標與轉折僅使用已揭露資料。</p>}</div>
  {replay===null&&<InstitutionalHistoryPanel market={history.market} symbol={history.symbol} asOf={bars.at(-1)!.date}/>}
  <p className="text-xs opacity-65">只使用官方歷史行情快取；未還原權息，無分鐘行情、五檔或券商API。畫線可按標的讀取保存；技術訊號不是報酬預測。</p>
 </section>;
}
