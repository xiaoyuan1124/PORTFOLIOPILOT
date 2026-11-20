/**
 * Close-only technical indicators on official, dated TWSE/TPEx historical closes.
 * NOT adjusted for dividends or corporate actions; no OHLCV or intraday data.
 * Streaming calculations never read future rows when computing earlier rows.
 */
export type DatedClose = readonly [date: string, close: number];
export type MovingAveragePeriod = 5 | 10 | 20 | 60 | 120 | 240;
export type CloseIndicatorRow = {
  date: string;
  close: number;
  ma: Record<MovingAveragePeriod, number | null>;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
};
export type CloseTechnicalSnapshot = {
  latest: CloseIndicatorRow;
  previous: CloseIndicatorRow | null;
  rows: CloseIndicatorRow[];
  sampleDays: number;
  latest20Slope: number | null;
  high60Close: number | null;
  low60Close: number | null;
  gapFromMa20Pct: number | null;
};

const PERIODS = [5, 10, 20, 60, 120, 240] as const;
function validIsoDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ts = Date.parse(s + "T00:00:00.000Z");
  return Number.isFinite(ts) && new Date(ts).toISOString().slice(0, 10) === s;
}
function clean(points: DatedClose[]) {
  const sorted = points.filter(([date, close]) => validIsoDate(date) && Number.isFinite(close) && close > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const unique: DatedClose[] = [];
  for (const point of sorted) {
    if (unique.at(-1)?.[0] === point[0]) {
      if (unique.at(-1)?.[1] !== point[1]) throw new Error("相同日期出現不同官方收盤價，不選任意一筆作為計算基礎。");
      continue;
    }
    unique.push(point);
  }
  return unique;
}
function ema(previous: number | null, price: number, period: number) {
  return previous === null ? price : price * (2 / (period + 1)) + previous * (1 - 2 / (period + 1));
}
/** Rolling MA, Wilder RSI(14), seeded MACD(12,26,9) based strictly on closes. */
export function calculateCloseTechnicals(points: DatedClose[]): CloseTechnicalSnapshot | null {
  const series = clean(points);
  if (!series.length) return null;
  const rolling = new Map<number, number>();
  const closeWindow = new Map<number, number[]>();
  for (const period of PERIODS) { rolling.set(period, 0); closeWindow.set(period, []); }
  const rows: CloseIndicatorRow[] = [];
  let avgGain: number | null = null, avgLoss: number | null = null;
  let gains = 0, losses = 0;
  let fastEma: number | null = null, slowEma: number | null = null;
  let fastSeed = 0, slowSeed = 0, signalSeed = 0, signalCount = 0;
  let signalEma: number | null = null;
  for (let i = 0; i < series.length; i++) {
    const [date,close] = series[i]!;
    const averages = {} as Record<MovingAveragePeriod,number|null>;
    for (const period of PERIODS) {
      const window=closeWindow.get(period)!;
      window.push(close);
      const next=rolling.get(period)!+close-(window.length>period ? window.shift()! : 0);
      rolling.set(period,next);
      averages[period] = window.length===period ? next/period : null;
    }
    let rsi14: number | null = null;
    if(i>0) {
      const difference=close-series[i-1]![1];
      const gain=Math.max(difference,0),loss=Math.max(-difference,0);
      if(i<=14) { gains+=gain; losses+=loss; if(i===14) {avgGain=gains/14;avgLoss=losses/14;} }
      else { avgGain=(avgGain!*13+gain)/14;avgLoss=(avgLoss!*13+loss)/14; }
      if(i>=14) rsi14=avgLoss===0 ? avgGain===0 ? 50 : 100 : 100-100/(1+avgGain!/avgLoss!);
    }
    fastSeed+=i<12?close:0;slowSeed+=i<26?close:0;
    if(i===11)fastEma=fastSeed/12;
    else if(i>11)fastEma=ema(fastEma,close,12);
    if(i===25)slowEma=slowSeed/26;
    else if(i>25)slowEma=ema(slowEma,close,26);
    const macd = fastEma !== null && slowEma !== null ? fastEma-slowEma : null;
    if(macd!==null) {
      if(signalCount<9) { signalSeed+=macd;signalCount++; if(signalCount===9)signalEma=signalSeed/9; }
      else signalEma=ema(signalEma,macd,9);
    }
    rows.push({date,close,ma:averages,rsi14,
      macd,macdSignal:signalCount>=9?signalEma:null,
      macdHistogram:macd!==null&&signalCount>=9&&signalEma!==null?macd-signalEma:null});
  }
  const latest=rows.at(-1)!;
  const prior=rows.length>=6?rows[rows.length-6]!:null;
  const ma20=latest.ma[20];
  const latest20Slope=ma20!==null&&prior?.ma[20]!==null&&prior?.ma[20]!==undefined?ma20-prior.ma[20]!:null;
  const last60=rows.length>=60?rows.slice(-60):[];
  return {latest,previous:rows.at(-2)??null,rows,sampleDays:rows.length,
    latest20Slope,
    high60Close:last60.length?Math.max(...last60.map(r=>r.close)):null,
    low60Close:last60.length?Math.min(...last60.map(r=>r.close)):null,
    gapFromMa20Pct:ma20!==null&&ma20>0?(latest.close/ma20-1)*100:null};
}
