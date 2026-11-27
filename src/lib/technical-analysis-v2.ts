import type { ChartBar } from "./workbench-chart";

export type Series = (number | null)[];
export type Plot = { label:string; values:Series; color:string; kind?:"bar"|"point" };
export type Indicator = { id:string; name:string; main:boolean; plots:Plot[]; levels?:number[] };
const colors=["#c08a34","#7999d8","#a98bc9","#289b8a","#db6670","#8798a5"];
const finite=(v:number|null|undefined):v is number=>typeof v==="number"&&Number.isFinite(v);
export const mean=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
function rolling(a:Series,n:number,fn:(v:number[])=>number):Series {
 return a.map((_,i)=>{if(i+1<n)return null;const w=a.slice(i+1-n,i+1);return w.every(finite)?fn(w):null;});
}
export const sma=(a:Series,n:number)=>rolling(a,n,mean);
export function smooth(a:Series,n:number,alpha=2/(n+1)):Series {
 let seed:number[]=[], last:number|null=null;
 return a.map(v=>{if(!finite(v)){seed=[];last=null;return null;}if(last===null){seed.push(v);if(seed.length<n)return null;last=mean(seed);}else last=last+(v-last)*alpha;return last;});
}
function zip(a:Series,b:Series,fn:(x:number,y:number)=>number):Series{return a.map((x,i)=>{const y=b[i];if(!finite(x)||!finite(y))return null;const v=fn(x,y);return finite(v)?v:null;});}
export function rsi(a:Series,n:number):Series {
 const delta=a.map((v,i)=>finite(v)&&finite(a[i-1])?v-a[i-1]!:null);
 const up=smooth(delta.map(v=>v===null?null:Math.max(v,0)),n,1/n),down=smooth(delta.map(v=>v===null?null:Math.max(-v,0)),n,1/n);
 return zip(up,down,(u,d)=>d===0?(u===0?50:100):100-100/(1+u/d));
}
export function trueRange(b:readonly ChartBar[]):Series {
 return b.map((v,i)=>{if(!finite(v.high)||!finite(v.low))return null;const prev=b[i-1]?.close;return i===0?v.high-v.low:finite(prev)?Math.max(v.high-v.low,Math.abs(v.high-prev),Math.abs(v.low-prev)):null;});
}
const rate=(a:Series,n:number)=>a.map((v,i)=>finite(v)&&finite(a[i-n])&&a[i-n]!==0?(v/a[i-n]!-1)*100:null);
function cum(a:Series):Series{let s=0;let broken=false;return a.map(v=>{if(!finite(v)){broken=true;return null;}if(broken)return null;s+=v;return s;});}
export const INDICATOR_NAMES:Record<string,string>={ma:"MA 均線",ema:"EMA 指數均線",wma:"WMA 加權均線",boll:"布林通道",donchian:"唐奇安通道",keltner:"肯特納通道",vol:"成交量與均量",macd:"MACD",rsi:"RSI",kd:"KD 隨機指標",stochrsi:"StochRSI",bias:"乖離率",atr:"ATR 真實波幅",adx:"DMI／ADX",obv:"OBV 能量潮",mfi:"MFI",cci:"CCI",willr:"Williams %R",roc:"ROC",cmf:"CMF",bandwidth:"布林帶寬",pvt:"PVT",sar:"SAR",supertrend:"SuperTrend",vr:"量比"};
export const MAIN_IDS=new Set(["ma","ema","wma","boll","donchian","keltner","sar","supertrend"]);
export function indicator(b:readonly ChartBar[],id:string,n:number):Indicator {
 n=Math.max(2,Math.min(500,Math.trunc(n)||20));
 const c=b.map(x=>x.close),h=b.map(x=>x.high),l=b.map(x=>x.low),v=b.map(x=>x.volume);
 const ma=sma(c,n),tr=trueRange(b),atr=smooth(tr,n,1/n);
 const p=(label:string,values:Series,i=0,kind?:Plot["kind"]):Plot=>({label,values,color:colors[i%colors.length]!,kind});
 const out=(plots:Plot[],levels?:number[]):Indicator=>({id,name:INDICATOR_NAMES[id]??id,main:MAIN_IDS.has(id),plots,levels});
 const hi=rolling(h,n,a=>Math.max(...a)),lo=rolling(l,n,a=>Math.min(...a));
 const tp=b.map(x=>finite(x.high)&&finite(x.low)?(x.high+x.low+x.close)/3:null);
 const std=rolling(c,n,a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));});
 switch(id){
 case "ma":return out([p("MA"+n,ma)]);
 case "ema":return out([p("EMA"+n,smooth(c,n))]);
 case "wma":return out([p("WMA"+n,rolling(c,n,a=>a.reduce((s,x,i)=>s+x*(i+1),0)/(n*(n+1)/2)))]);
 case "boll":return out([p("中軌",ma),p("上軌",zip(ma,std,(m,s)=>m+2*s),1),p("下軌",zip(ma,std,(m,s)=>m-2*s),1)]);
 case "bandwidth":return out([p("帶寬 %",zip(std,ma,(s,m)=>m?400*s/m:NaN))]);
 case "donchian":return out([p("上軌",hi,1),p("下軌",lo,2),p("中軌",zip(hi,lo,(x,y)=>(x+y)/2))]);
 case "keltner":{const e=smooth(c,n);return out([p("EMA",e),p("上軌",zip(e,atr,(x,y)=>x+2*y),1),p("下軌",zip(e,atr,(x,y)=>x-2*y),1)]);}
 case "vol":return out([p("成交股數",v,5,"bar"),p("MV5",sma(v,5)),p("MV20",sma(v,20),1)]);
 case "vr":return out([p("量比",zip(v,sma(v,n),(x,y)=>y?x/y:NaN))],[1]);
 case "macd":{const dif=zip(smooth(c,12),smooth(c,26),(x,y)=>x-y),dea=smooth(dif,9);return out([p("柱狀 DIF−DEA",zip(dif,dea,(x,y)=>x-y),5,"bar"),p("DIF",dif,1),p("DEA",dea)],[0]);}
 case "rsi":return out([p("RSI"+n,rsi(c,n),2)],[30,70]);
 case "kd":{const rsv=c.map((x,i)=>finite(hi[i])&&finite(lo[i])&&hi[i]!==lo[i]?(x-lo[i]!)/(hi[i]!-lo[i]!)*100:null);let k=50,d=50;const ks:Series=[],ds:Series=[];for(const x of rsv){if(x===null){k=50;d=50;ks.push(null);ds.push(null);}else{k=(2*k+x)/3;d=(2*d+k)/3;ks.push(k);ds.push(d);}}return out([p("K",ks,1),p("D",ds)],[20,80]);}
 case "stochrsi":{const r=rsi(c,n),rh=rolling(r,n,a=>Math.max(...a)),rl=rolling(r,n,a=>Math.min(...a));const s=r.map((x,i)=>finite(x)&&finite(rh[i])&&finite(rl[i])&&rh[i]!==rl[i]?(x-rl[i]!)/(rh[i]!-rl[i]!)*100:null);const k=sma(s,3);return out([p("K",k,1),p("D",sma(k,3))],[20,80]);}
 case "bias":return out([p("BIAS %",zip(c,ma,(x,y)=>(x/y-1)*100))],[0]);
 case "atr":return out([p("Wilder ATR",atr)]);
 case "roc":return out([p("ROC %",rate(c,n))],[0]);
 case "willr":return out([p("%R",c.map((x,i)=>finite(hi[i])&&finite(lo[i])&&hi[i]!==lo[i]?-100*(hi[i]!-x)/(hi[i]!-lo[i]!):null))],[-80,-20]);
 case "cci":return out([p("CCI",tp.map((x,i)=>{const w=tp.slice(Math.max(0,i+1-n),i+1);if(!finite(x)||w.length!==n||!w.every(finite))return null;const m=mean(w),dev=mean(w.map(y=>Math.abs(y-m)));return dev?(x-m)/(.015*dev):null;}))],[-100,100]);
 case "obv":return out([p("OBV",cum(c.map((x,i)=>i===0?0:finite(v[i])?Math.sign(x-c[i-1]!)*v[i]!:null)))]);
 case "pvt":return out([p("PVT",cum(c.map((x,i)=>i===0?0:finite(v[i])?(x/c[i-1]!-1)*v[i]!:null)))]);
 case "cmf":{const mf=b.map(x=>finite(x.high)&&finite(x.low)&&finite(x.volume)?x.high===x.low?0:((2*x.close-x.high-x.low)/(x.high-x.low))*x.volume:null);return out([p("CMF",zip(sma(mf,n),sma(v,n),(x,y)=>y?x/y:NaN))],[0]);}
 case "mfi":{const pos:Series=[],neg:Series=[];tp.forEach((x,i)=>{const prev=tp[i-1],vol=v[i];if(!finite(x)||!finite(prev)||!finite(vol)){pos.push(null);neg.push(null);}else{pos.push(x>prev?x*vol:0);neg.push(x<prev?x*vol:0);}});return out([p("MFI",zip(sma(pos,n),sma(neg,n),(x,y)=>y===0?(x===0?50:100):100-100/(1+x/y)))],[20,80]);}
 case "adx":{const plus:Series=[],minus:Series=[];b.forEach((x,i)=>{const prev=b[i-1];if(!prev||!finite(x.high)||!finite(x.low)||!finite(prev.high)||!finite(prev.low)){plus.push(null);minus.push(null);}else{const u=x.high-prev.high,d=prev.low-x.low;plus.push(u>d&&u>0?u:0);minus.push(d>u&&d>0?d:0);}});const a=zip(smooth(plus,n,1/n),atr,(x,y)=>y?100*x/y:NaN),d=zip(smooth(minus,n,1/n),atr,(x,y)=>y?100*x/y:NaN);return out([p("+DI",a,3),p("−DI",d,4),p("ADX",smooth(zip(a,d,(x,y)=>x+y?100*Math.abs(x-y)/(x+y):0),n,1/n),1)],[25]);}
 case "sar":{let rising=true,ep=0,sar=0,af=.02,seen=0;const values=b.map((x,i)=>{if(!finite(x.high)||!finite(x.low)){seen=0;return null;}if(seen===0){ep=x.high;sar=x.low;af=.02;seen=1;rising=true;return null;}const prev=b[i-1]!;if(seen===1){rising=x.close>=prev.close;ep=rising?Math.max(prev.high!,x.high):Math.min(prev.low!,x.low);sar=rising?Math.min(prev.low!,x.low):Math.max(prev.high!,x.high);seen++;return sar;}sar+=af*(ep-sar);const p2=b[i-2];if(rising){sar=Math.min(sar,prev.low!,finite(p2?.low)?p2.low:prev.low!);if(x.low<sar){rising=false;sar=ep;ep=x.low;af=.02;}else if(x.high>ep){ep=x.high;af=Math.min(.2,af+.02);}}else{sar=Math.max(sar,prev.high!,finite(p2?.high)?p2.high:prev.high!);if(x.high>sar){rising=true;sar=ep;ep=x.high;af=.02;}else if(x.low<ep){ep=x.low;af=Math.min(.2,af+.02);}}seen++;return sar;});return out([p("SAR",values,0,"point")]);}
 case "supertrend":{let upper:number|null=null,lower:number|null=null,up=true;const bull:Series=[],bear:Series=[];b.forEach((x,i)=>{const a=atr[i];if(!finite(a)||!finite(x.high)||!finite(x.low)){upper=null;lower=null;bull.push(null);bear.push(null);return;}const mid=(x.high+x.low)/2,bu=mid+3*a,bl=mid-3*a,prev=b[i-1]?.close??x.close;if(upper===null||lower===null){upper=bu;lower=bl;up=x.close>=mid;}else{upper=bu<upper||prev>upper?bu:upper;lower=bl>lower||prev<lower?bl:lower;if(up&&x.close<lower)up=false;else if(!up&&x.close>upper)up=true;}bull.push(up?lower:null);bear.push(up?null:upper);});return out([p("多頭",bull,3),p("空頭",bear,4)]);}
 default:return out([]);
 }
}
export function supportResistance(b:readonly ChartBar[],lookback=60){
 const last=b.at(-1)?.close;if(!finite(last))return [];
 const pivots:{price:number;date:string;kind:"support"|"resistance"}[]=[];
 for(let i=Math.max(2,b.length-lookback);i<b.length-2;i++){const x=b[i]!,w=b.slice(i-2,i+3);if(w.every(t=>finite(t.high)&&finite(t.low))){if(x.high===Math.max(...w.map(t=>t.high!))&&x.high!>last)pivots.push({price:x.high!,date:x.date,kind:"resistance"});if(x.low===Math.min(...w.map(t=>t.low!))&&x.low!<last)pivots.push({price:x.low!,date:x.date,kind:"support"});}}
 return pivots.sort((a,z)=>Math.abs(a.price-last)-Math.abs(z.price-last)).slice(0,6);
}
