import type {StrategyCandle} from "./strategy-lab";
export type CandlePeriod="D"|"W"|"M";
export type DatedCandle=Required<StrategyCandle>;
function dateKey(date:string,period:CandlePeriod){
 if(period==="D")return date;
 if(period==="M")return date.slice(0,7);
 const d=new Date(date+"T00:00:00.000Z");
 const weekday=(d.getUTCDay()+6)%7;
 d.setUTCDate(d.getUTCDate()-weekday);
 return d.toISOString().slice(0,10);
}
export function aggregateOfficialCandles(candles:StrategyCandle[],period:CandlePeriod):DatedCandle[]{
 const ordered=[...candles].sort((a,b)=>a.date.localeCompare(b.date));
 const grouped:DatedCandle[]=[];
 const seen=new Set<string>();
 for(const c of ordered) {
  const open=c.open,high=c.high,low=c.low,volume=c.volume;
  const iso=/^\d{4}-\d{2}-\d{2}$/.test(c.date)&&
    !Number.isNaN(Date.parse(c.date+"T00:00:00Z"))&&new Date(c.date+"T00:00:00Z").toISOString().slice(0,10)===c.date;
  if(!iso||typeof open!=="number"||typeof high!=="number"||
    typeof low!=="number"||typeof volume!=="number"||
    [open,high,low,c.close,volume].some(v=>!Number.isFinite(v))||
    open<=0||c.close<=0||low<=0||high<Math.max(open,c.close)||
    low>Math.min(open,c.close)||volume<0)throw new Error("官方 OHLCV 有日期或價量不合法，拒絕產生 K 線。");
  if(seen.has(c.date))throw new Error("同一官方交易日重複出現，不混合不明來源 K 線。");
  seen.add(c.date);
  const key=dateKey(c.date,period);
  const prior=grouped.at(-1);
  if(prior&&dateKey(prior.date,period)===key){
   prior.date=c.date;
   prior.high=Math.max(prior.high,high);
   prior.low=Math.min(prior.low,low);
   prior.close=c.close;
   prior.volume+=volume;
  }else grouped.push({date:c.date,open,high,low,close:c.close,volume});
 }
 return grouped;
}
export function officialCandleKD(candles:DatedCandle[]) {
 if(candles.length<9)return null;
 let k=50,d=50;
 for(let i=8;i<candles.length;i++){
  const slice=candles.slice(i-8,i+1);
  const low=Math.min(...slice.map(x=>x.low)),high=Math.max(...slice.map(x=>x.high));
  const rsv=high===low?50:(candles[i]!.close-low)/(high-low)*100;
  k=(2*k+rsv)/3;d=(2*d+k)/3;
 }
 return {k,d};
}
export function officialDailyVolumeRatio(candles:DatedCandle[],lookback=20):number|null {
 if(candles.length<lookback+1||lookback<1)return null;
 const avg=candles.slice(-lookback-1,-1).reduce((sum,c)=>sum+c.volume,0)/lookback;
 return avg>0?candles.at(-1)!.volume/avg:null;
}
