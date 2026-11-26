import { computeStrategyIndicators, DEFAULT_STRATEGY_PROFILE, type StrategyCandle } from "./strategy-lab";
import type { CompanySnapshot } from "./company-snapshot";
import type { BenchmarkSeries } from "./benchmark";
import type { PortfolioRiskResult } from "./portfolio-risk";

export const DECISION_VERSION = "research-v1.5.1";
export const PERIODS = [5, 10, 20, 60, 120, 240] as const;
export type Horizon = "short" | "swing" | "long";
export const HORIZON_LABELS: Record<Horizon, string> = { short: "短線", swing: "波段", long: "長期" };
export type FactorKey = "quality" | "growth" | "valuation" | "technical" | "flow" | "market";
export const WEIGHTS: Record<Horizon, Record<FactorKey, number>> = {
  short: { quality: 10, growth: 5, valuation: 10, technical: 35, flow: 25, market: 15 },
  swing: { quality: 20, growth: 20, valuation: 15, technical: 20, flow: 15, market: 10 },
  long: { quality: 30, growth: 25, valuation: 25, technical: 10, flow: 5, market: 5 }
};
export type Point = readonly [string, number];
type Status = "met" | "wait" | "risk" | "insufficient" | "not_applicable";
type Factor = { key: FactorKey; label: string; score: number | null; detail: string };
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const mean = (a: readonly number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const t = new Date(date + "T00:00:00Z");
  return Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === date;
}
export function taipeiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return ["year", "month", "day"].map(k => parts.find(p => p.type === k)?.value ?? "").join("-");
}
function daysBetween(a: string, b: string) {
  return (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000;
}
export function normalizeDecisionPoints(points: readonly Point[], asOf: string) {
  const rows = new Map<string, number>();
  const conflicts = new Set<string>();
  for (const [date, price] of points) {
    if (!validDate(date) || date > asOf || !positive(price)) continue;
    if (rows.has(date) && rows.get(date) !== price) conflicts.add(date);
    rows.set(date, price);
  }
  for (const date of conflicts) rows.delete(date);
  return { points: [...rows.entries()].sort(([a], [b]) => a.localeCompare(b)), conflicts: [...conflicts] };
}
export function midrankPercentile(values: readonly number[], value: number) {
  const a = values.filter(finite);
  if (!a.length || !finite(value)) return null;
  return 100 * (a.filter(v => v < value).length + 0.5 * a.filter(v => v === value).length) / a.length;
}
function sma(prices: number[], n: number, end = prices.length) {
  return end >= n ? mean(prices.slice(end - n, end)) : null;
}
const fmt = (v: number | null, d = 1) => v === null ? "—" : v.toFixed(d);
export function technicalSnapshot(points: readonly Point[], asOf: string, candles: readonly StrategyCandle[] = []) {
  const normalized = normalizeDecisionPoints(points, asOf);
  const rows = normalized.points;
  const prices = rows.map(p => p[1]);
  const close = prices.at(-1) ?? null;
  const lastDate = rows.at(-1)?.[0] ?? null;
  const averages = PERIODS.map(period => {
    const value = sma(prices, period);
    const previous = sma(prices, period, prices.length - 5);
    return { period, value, bias: value && close !== null ? (close / value - 1) * 100 : null,
      slope: value && previous ? (value / previous - 1) * 100 : null };
  });
  const monthly = averages.find(a => a.period === 20)!;
  const quarterly = averages.find(a => a.period === 60)!;
  const yearly = averages.find(a => a.period === 240)!;
  // Previous observations only; at least 120, target 3 years when data exists.
  const history: number[] = [];
  for (let i = Math.max(19, prices.length - 757); i < prices.length - 1; i++) {
    const avg = sma(prices, 20, i + 1)!;
    history.push((prices[i]! / avg - 1) * 100);
  }
  const biasRank = history.length >= 120 && monthly.bias !== null ? midrankPercentile(history, monthly.bias) : null;
  const candleMap = new Map<string, StrategyCandle>();
  const candleConflicts = new Set<string>();
  for (const c of candles) {
    if (!validDate(c.date) || c.date > asOf || !positive(c.close)) continue;
    const prior = candleMap.get(c.date);
    if (prior && (prior.close !== c.close || prior.high !== c.high || prior.low !== c.low || prior.volume !== c.volume || (prior.open!==undefined && c.open!==undefined && prior.open!==c.open))) candleConflicts.add(c.date);
    candleMap.set(c.date, c);
  }
  for (const date of candleConflicts) candleMap.delete(date);
  // Only attach real high/low/volume to an identical official close.
  const bars = rows.map(([date, price]) => {
    const c = candleMap.get(date);
    return c && c.close === price ? c : { date, close: price };
  });
  const ind = computeStrategyIndicators(bars, DEFAULT_STRATEGY_PROFILE);
  // Close-only history can calculate momentum, but KD must start with a contiguous actual OHLC segment.
  let startOHLC=bars.length;
  while(startOHLC>0) {
    const bar=bars[startOHLC-1]!;
    if(!("high" in bar) || !("low" in bar) || !positive(bar.high) || !positive(bar.low) || bar.high<bar.close || bar.low>bar.close) break;
    startOHLC--;
  }
  const kd=computeStrategyIndicators(bars.slice(startOHLC),DEFAULT_STRATEGY_PROFILE);
  // Require warm-up for the seeded stochastic smoother.
  ind.kdK=bars.length-startOHLC>=21?kd.kdK:null;
  ind.kdD=bars.length-startOHLC>=21?kd.kdD:null;
  ind.kdPreviousK=bars.length-startOHLC>=22?kd.kdPreviousK:null;
  const tail = bars.slice(-15);
  const trs: number[] = [];
  if (tail.length === 15) for (let i = 1; i < tail.length; i++) {
    const bar = tail[i]!, prev = tail[i - 1]!;
    if (!positive(bar.high) || !positive(bar.low) || bar.high < bar.close || bar.low > bar.close) break;
    trs.push(Math.max(bar.high - bar.low, Math.abs(bar.high - prev.close), Math.abs(bar.low - prev.close)));
  }
  // Simple 14-session true-range mean, not Wilder ATR.
  const atr14 = trs.length === 14 ? mean(trs) : null;
  const trend = close === null || !monthly.value || !quarterly.value || !yearly.value ? "資料不足" :
    close > monthly.value && monthly.value > quarterly.value && quarterly.value > yearly.value ? "多頭排列" :
    close < monthly.value && monthly.value < quarterly.value && quarterly.value < yearly.value ? "空頭排列" :
    close < monthly.value && quarterly.value > yearly.value ? "多頭拉回／待確認" :
    close > monthly.value && quarterly.value < yearly.value ? "空頭反彈／待確認" : "混合趨勢";
  const prior20 = prices.slice(-21, -1);
  const low20 = prior20.length === 20 ? Math.min(...prior20) : null;
  const high20 = prior20.length === 20 ? Math.max(...prior20) : null;
  const overheat = (biasRank !== null && biasRank >= 95 && (monthly.bias ?? 0) > 0) || (monthly.bias ?? 0) >= 30;
  const falling = low20 !== null && close !== null && close < low20 && (monthly.slope ?? 0) < 0;
  return { rows, close, lastDate, averages, monthly, quarterly, yearly, biasRank, biasSamples: history.length,
    trend, overheat, falling, low20, high20, atr14, indicators: ind, conflicts: normalized.conflicts };
}
function monthIndex(period: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[1]) * 12 + Number(m[2]) : null;
}
function quarterIndex(period: string) {
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  return m ? Number(m[1]) * 4 + Number(m[2]) : null;
}
function consecutiveCompleted(periods: string[], current: number, parse: (period: string) => number | null, latestMaxAge: number) {
  if (periods.length !== 3) return false;
  const indices = periods.map(parse);
  if (indices.some(v => v === null)) return false;
  const sorted = (indices as number[]).sort((a,b)=>a-b);
  const latest = sorted[2]!;
  return sorted[1] === sorted[0]! + 1 && latest === sorted[1]! + 1 &&
    current - latest >= 1 && current - latest <= latestMaxAge;
}
export function assessStock(input: {
  snapshot: CompanySnapshot; peers: readonly CompanySnapshot[]; points: readonly Point[];
  candles?: readonly StrategyCandle[]; benchmark?: BenchmarkSeries | null; horizon: Horizon;
  today: string; latestMarketDate: string | null; historyIssues?: readonly string[];
  portfolioRisk?: PortfolioRiskResult | null; offline?: boolean;
}) {
  const { snapshot: s, horizon, today, latestMarketDate } = input;
  const date = s.quote?.date ?? "";
  const asOf = validDate(date) && date <= today ? date : today;
  const t = technicalSnapshot(input.points, asOf, input.candles);
  const warnings: string[] = [];
  const missing: string[] = [];
  const reasons: string[] = [];
  const quoteOK = Boolean(s.quote && s.quote.code===s.code && s.quote.market===s.market && validDate(date) && date <= today && positive(s.quote.close) &&
    date === latestMarketDate && daysBetween(date, today) <= 7 && !input.offline);
  const historyOK = quoteOK && t.lastDate === date && t.close === s.quote?.close &&
    !t.conflicts.length && !(input.historyIssues?.length);
  if (!quoteOK) missing.push("官方收盤資料過期、無效或離線，待同步。");
  if (!historyOK) missing.push("歷史價格與最新官方收盤尚未完整對齊。");
  if (input.historyIssues?.length) missing.push("歷史行情存在未補齊的交易日。");
  const benchmark = input.benchmark;
  const bm = normalizeDecisionPoints(benchmark?.points.map(p => [p.date, p.value] as const) ?? [], asOf);
  const bmMap = new Map(bm.points);
  // A broad TWSE calendar is also a conservative proxy for TPEx; do not fill gaps.
  // Bias ranks and momentum use more than the last 245 sessions. Validate the entire input window.
  const recentStart = t.rows[0]?.[0];
  const stockDates = new Set(t.rows.map(p => p[0]));
  const benchmarkAligned = bm.points.at(-1)?.[0] === date && !!recentStart && bm.points[0]![0] <= recentStart && !bm.conflicts.length;
  const gap = benchmarkAligned && (bm.points.some(([d]) => d >= recentStart! && !stockDates.has(d)) || t.rows.some(([d])=>!bmMap.has(d)));
  if (gap) missing.push("近期官方交易日有缺值或停牌，暫停訊號。");
  if (!benchmarkAligned) missing.push("市場基準尚未與個股資料對齊。");
  const benchmarkTechnical = technicalSnapshot(bm.points, asOf);
  const start = t.rows.at(horizon === "short" ? -21 : -61);
  const relative = start && t.close && positive(bmMap.get(start[0])) && positive(bmMap.get(date)) && benchmarkAligned
    ? ((t.close / start[1]) / (bmMap.get(date)! / bmMap.get(start[0])!) - 1) * 100 : null;
  const g = s.strategy?.code === s.code && s.strategy.market === s.market ? s.strategy : null;
  const currentMonth = Number(asOf.slice(0,4)) * 12 + Number(asOf.slice(5,7));
  const currentQuarter = Number(asOf.slice(0,4)) * 4 + Math.ceil(Number(asOf.slice(5,7)) / 3);
  const margins = g?.grossMarginGate.values ?? [];
  const marginOK = consecutiveCompleted(margins.map(r=>r.period), currentQuarter, quarterIndex, 2) &&
    margins.every(r => finite(r.grossMarginPct) && r.market === s.market && r.code === s.code && positive(r.revenue));
  const marginValues = [...margins].sort((a,b) => a.period.localeCompare(b.period)).map(r => r.grossMarginPct);
  const financialRows = marginOK ? [...margins].sort((a,b)=>a.period.localeCompare(b.period)) : [];
  const latestFinancial = financialRows.at(-1) ?? null;
  const operatingComplete = financialRows.length===3 && financialRows.every(r=>finite(r.operatingMarginPct));
  const marginProxy = marginOK ? clamp(50 + (marginValues[2]! - marginValues[0]!) * 4 + (marginValues[2]! > 0 ? 10 : -30)) : null;
  const operatingProxy = operatingComplete ? clamp(50 + (financialRows[2]!.operatingMarginPct! - financialRows[0]!.operatingMarginPct!)*4 + (financialRows[2]!.operatingMarginPct!>0?10:-30)) : null;
  const quality = marginProxy!==null && operatingProxy!==null ? (marginProxy+operatingProxy)/2 : marginProxy;
  const revenues = g?.revenueGate.values ?? [];
  const revOK = consecutiveCompleted(revenues.map(r=>r.period), currentMonth, monthIndex, 2) &&
    revenues.every(r => finite(r.yoyPct) && positive(r.revenue));
  const growth = revOK ? clamp(50 + mean(revenues.map(r => r.yoyPct!)) * 1.5) : null;
  const pe = s.valuation?.date === date && s.valuation.code === s.code && s.valuation.market === s.market && positive(s.valuation.pe) ? s.valuation.pe : null;
  const peerMap = new Map<string, number>();
  const peerConflicts = new Set<string>();
  for (const p of input.peers) {
    if (!s.industry || (p.code === s.code && p.market === s.market) || p.type !== "stock" || p.industry !== s.industry ||
        p.valuation?.date !== date || p.valuation.code !== p.code || p.valuation.market !== p.market || !positive(p.valuation.pe)) continue;
    const key = p.market + ":" + p.code;
    if (peerMap.has(key) && peerMap.get(key) !== p.valuation.pe) peerConflicts.add(key);
    peerMap.set(key,p.valuation.pe);
  }
  for (const key of peerConflicts) peerMap.delete(key);
  const peerPE = [...peerMap.values()];
  const peRank = pe !== null && peerPE.length >= 5 ? midrankPercentile(peerPE, pe) : null;
  const valuation = peRank === null ? null : 100 - peRank;
  const requiredMA = horizon === "short" ? t.monthly : horizon === "swing" ? t.quarterly : t.yearly;
  const technique = historyOK && benchmarkAligned && !gap && requiredMA.value !== null && requiredMA.slope !== null &&
    t.biasRank !== null && t.indicators.rsi !== null && relative !== null
    ? clamp(50 + (requiredMA.bias! > 0 ? 12 : -12) + (requiredMA.slope > 0 ? 10 : -10) +
      (relative > 0 ? 8 : -8) - (t.overheat ? 25 : 0) - (t.falling ? 20 : 0)) : null;
  const foreign = g?.foreignGate, trust = g?.trustGate;
  const flowOK = foreign && trust && foreign.observedDays === 10 && trust.observedDays === 10 &&
    foreign.status !== "insufficient" && foreign.status !== "not_applicable" && trust.status !== "insufficient" && trust.status !== "not_applicable" &&
    foreign.dataAsOf.endsWith(date) && trust.dataAsOf.endsWith(date) && finite(foreign.net10d) && finite(trust.net10d);
  const flow = flowOK ? 50 + (foreign.net10d! > 0 ? 25 : foreign.net10d! < 0 ? -25 : 0) +
    (trust.net10d! > 0 ? 25 : trust.net10d! < 0 ? -25 : 0) : null;
  const market = benchmarkAligned && benchmarkTechnical.quarterly.bias !== null && benchmarkTechnical.quarterly.slope !== null
    ? clamp(50 + (benchmarkTechnical.quarterly.bias > 0 ? 25 : -25) + (benchmarkTechnical.quarterly.slope > 0 ? 25 : -25)) : null;
  const factors: Factor[] = [
    { key:"quality", label:"基本面", score:quality, detail: marginOK ? (operatingComplete?"三季毛利率及營業利益率代理指標。":"僅三季毛利率變化，營業利益率未齊。")+" EPS 為公告累計值（若有），未納入 ROIC、現金流及負債。" : "三季毛利率不足或不適用。" },
    { key:"growth", label:"成長面", score:growth, detail:revOK ? "三月營收年增率平均 " + fmt(mean(revenues.map(r=>r.yoyPct!))) + "%；非獲利預測。" : "三月營收歷史不足。" },
    { key:"valuation", label:"估值面", score:valuation, detail:peRank !== null ? "同產業正本益比 " + fmt(pe) + " 倍，第 " + fmt(peRank,0) + " 百分位（同業 " + peerPE.length + " 家）。" : "缺少同日正本益比或足夠同業；不以零倍當便宜。" },
    { key:"technical", label:"技術面", score:technique, detail:t.trend + "；月線乖離 " + fmt(t.monthly.bias) + "%；原始價格、未還原權息。" },
    { key:"flow", label:"籌碼面", score:flow, detail:flowOK ? "近十日外資及投信方向；未含融資、流動性及持股分級。" : "缺少同日完整十日法人資料。" },
    { key:"market", label:"市場面", score:market, detail:"加權指數季線位置與斜率；上櫃個股僅作大盤參考。" }
  ];
  if (t.overheat) warnings.push("月線正乖離過熱，等待價格或均線收斂。");
  if (t.falling) warnings.push("跌破前20日最低收盤且月線下彎，超跌不等於止跌。");
  if (t.trend === "空頭排列") warnings.push("長期空頭排列；留意反彈不等於反轉。");
  if (marginOK && marginValues[2]! < marginValues[0]!) warnings.push("近三季毛利率下降。");
  if (peRank !== null && peRank >= 80) warnings.push("本益比高於多數同業，須另驗證成長能否支撐。");
  const risk = input.portfolioRisk;
  const exposure = risk?.companyExposures.find(e => e.market === "TW" && e.symbol.toUpperCase() === s.code.toUpperCase());
  if (exposure && exposure.portfolioPct >= 20) warnings.push("現有直接與 ETF 穿透合計曝險已達20%。");
  if (risk && risk.investedValueTwd > 0 && risk.riskCoveragePct < 90) warnings.push("部分 ETF 曝險未知，集中度可能低估。");
  if (t.atr14 === null) reasons.push("缺完整 OHLC，不能評估 ATR 或盤中支撐。");
  if (t.indicators.volumeRatio20 === null) reasons.push("缺完整成交量，不能確認量能。");
  reasons.push("尚未納入完整三大財報、歷史估值、調整後行情及樣本外驗證；分數不是勝率或買進指令。");
  const weights = WEIGHTS[horizon];
  const covered = factors.filter(f => f.score !== null);
  const coverage = covered.reduce((sum,f)=>sum+weights[f.key],0);
  const score = coverage > 0 ? covered.reduce((sum,f)=>sum+f.score!*weights[f.key],0)/coverage : null;
  // Exceptional raw daily moves may be corporate actions, not economic returns.
  // This is only a guard, not an adjustment or identification of a corporate action.
  const exceptionalMove = t.rows.slice(-245).some((row,i,rows)=>i>0 && Math.abs(row[1]/rows[i-1]![1]-1)>0.15);
  if (exceptionalMove) warnings.push("近期未還原收盤有逾15%的單日變動，須確認除權息、減資、拆分或特殊交易。");
  const weakMargin = marginOK && marginValues[2]! <= 0;
  if (weakMargin) warnings.push("最新一季毛利率非正值。");
  const operatingLoss = latestFinancial && finite(latestFinancial.operatingIncome) && latestFinancial.operatingIncome<0;
  const netLoss = latestFinancial && finite(latestFinancial.netIncome) && latestFinancial.netIncome<0;
  if (operatingLoss) warnings.push("最新單季營業利益為負，核心業務虧損。");
  if (netLoss) warnings.push("最新單季本期淨利為負，須檢查一次性或持續性因素。");
  // A non-positive published P/E is not cheap; loss-making valuations must not earn a short-term pass.
  const nonPositivePE = s.valuation?.date===date && s.valuation.code===s.code && s.valuation.market===s.market && finite(s.valuation.pe) && s.valuation.pe<=0;
  if(nonPositivePE)warnings.push("官方本益比非正值，不能當成低估。");
  const hardRisk = t.overheat || t.falling || weakMargin || exceptionalMove || operatingLoss || netLoss || nonPositivePE || !!(exposure && exposure.portfolioPct >= 20);
  const unmetConditions = [
    ...warnings,
    ...factors.filter(f=>f.score!==null && f.score<60).map(f=>f.label+"代理指標偏弱，待改善。"),
    ...factors.filter(f=>f.score===null).map(f=>f.label+"資料待補。")
  ];
  const companyScore = quality!==null && growth!==null && valuation!==null ? (quality+growth+valuation)/3 : null;
  const timingScore = technique!==null && market!==null && flow!==null ? (technique+market+flow)/3 : null;
  const insufficient = !historyOK || !benchmarkAligned || gap || coverage < 80 || technique === null ||
    (horizon !== "short" && (quality === null || growth === null || valuation === null));
  if (coverage < 80) missing.push("現有指標覆蓋率不足80%。");
  if (horizon !== "short" && (quality === null || growth === null || valuation === null)) missing.push("波段／長期需要完整三季毛利、三月營收與同業估值。");
  const status: Status = s.type === "etf" ? "not_applicable" : insufficient ? "insufficient" :
    hardRisk ? "risk" : score !== null && score >= 70 && technique >= 60 ? "met" : "wait";
  return { version: DECISION_VERSION, asOf, status, factors, coverage, score, technical:t, relative, pe, peRank, peerCount:peerPE.length,
    warnings, missing, limitations: reasons, unmetConditions, companyScore, timingScore, financialRows, quoteVerified:quoteOK, exposurePct: exposure?.portfolioPct ?? null,
    portfolioCoverage: risk?.riskCoveragePct ?? null };
}
export function positionRisk(input: { entry: number; target: number; stop: number; available: number; riskBudget: number; feeRate: number; taxRate: number; slippageRate: number; minimumFee: number }) {
  const { entry, target, stop, available, riskBudget, feeRate, taxRate, slippageRate, minimumFee } = input;
  if (![entry,target,stop,available,riskBudget,feeRate,taxRate,slippageRate,minimumFee].every(finite) ||
      !(target > entry && entry > stop && stop > 0 && available > 0 && riskBudget > 0) ||
      [feeRate,taxRate,slippageRate].some(v=>v<0||v>=1) || minimumFee < 0) return null;
  const buy = entry*(1+slippageRate), exit = stop*(1-slippageRate), take = target*(1-slippageRate);
  if (![buy,exit,take].every(positive) || !Number.isFinite(Math.max(buy,take)*Math.min(Math.floor(available/buy),Number.MAX_SAFE_INTEGER))) return null;
  // Keep the entire arithmetic in a safe monetary range, including fees.
  if(available>Number.MAX_SAFE_INTEGER||riskBudget>Number.MAX_SAFE_INTEGER||minimumFee>Number.MAX_SAFE_INTEGER||take>Number.MAX_SAFE_INTEGER)return null;
  const fee = (gross:number) => Math.max(minimumFee,gross*feeRate);
  const cost = (n:number) => n===0?0:n*buy+fee(n*buy);
  const proceeds = (n:number, p:number) => n===0?0:n*p*(1-taxRate)-fee(n*p);
  const loss = (n:number) => cost(n)-proceeds(n,exit);
  let lo=0,hi=Math.min(Math.floor(available/buy),Number.MAX_SAFE_INTEGER);
  while(lo<hi){const mid=lo+Math.ceil((hi-lo)/2);if(cost(mid)<=available&&loss(mid)<=riskBudget)lo=mid;else hi=mid-1;}
  const gain=proceeds(lo,take)-cost(lo);
  return { shares:lo, invested:cost(lo), loss:loss(lo), gain, ratio:lo&&loss(lo)>0?gain/loss(lo):null };
}
