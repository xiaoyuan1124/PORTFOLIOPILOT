/**
 * PilotQuant: long-only close-price research, independent of brokerage orders.
 *
 * Verified source: TWSE/TPEx raw DAILY closing prices. Never create fake OHLC
 * or use same-close execution for signals computed at that close.
 * Dividends, splits and delistings are NOT adjusted in this price-only study.
 */
export type QuantPrice = readonly [date: string, close: number];
export type QuantStrategy = 'sma' | 'rsi' | 'breakout';
export type QuantSignal = 'buy' | 'sell' | null;

export interface QuantConfig {
  strategy: QuantStrategy;
  capital: number;
  allocationPct: number;
  fast: number;
  slow: number;
  rsiPeriod: number;
  rsiBuyBelow: number;
  rsiSellAbove: number;
  breakoutPeriod: number;
  feeBps: number;
  sellTaxBps: number;
  slippageBps: number;
  minimumFeeTwd: number;
}

export const DEFAULT_QUANT_CONFIG: QuantConfig = {
  strategy: 'sma',
  capital: 30_000,
  allocationPct: 100,
  fast: 10,
  slow: 30,
  rsiPeriod: 14,
  rsiBuyBelow: 30,
  rsiSellAbove: 60,
  breakoutPeriod: 20,
  feeBps: 14.25,
  sellTaxBps: 30,
  slippageBps: 5,
  minimumFeeTwd: 0
};

export type QuantTrade = {
  signalDate: string;
  date: string;
  action: '買入' | '賣出';
  shares: number;
  price: number;
  fees: number;
  tax: number;
  cashAfter: number;
};
export interface QuantSummary {
  firstDate: string;
  lastDate: string;
  totalReturnPct: number;
  maxDrawdownPct: number;
  annualizedReturnPct: number | null;
  sharpe: number | null;
  completedTrades: number;
  wins: number;
  winRatePct: number | null;
  buyHoldReturnPct: number;
  endingEquity: number;
  openShares: number;
  equity: Array<{ date: string; equity: number; buyHold: number }>;
  trades: QuantTrade[];
}
export interface QuantReport {
  total: QuantSummary;
  inSample: QuantSummary;
  outOfSample: QuantSummary;
  splitDate: string;
  strategy: QuantStrategy;
  observedDays: number;
}
export interface GrowthPoint {
  day: number;
  label: string;
  low: number;
  median: number;
  high: number;
}
export interface GrowthScenarios {
  lastDate: string;
  lastClose: number;
  sampleDays: number;
  observations: number;
  annualVolatilityPct: number;
  annualHistoricalDriftPct: number;
  paths: GrowthPoint[];
}

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(label + ' 必須是有效數字');
}
function range(value: number, min: number, max: number, label: string) {
  assertFinite(value, label);
  if (value < min || value > max) throw new Error(label + ' 超出允許範圍');
}
export function validateQuantConfig(config: QuantConfig): void {
  if (!['sma', 'rsi', 'breakout'].includes(config.strategy)) throw new Error('策略類型不支援');
  range(config.capital, 1000, 1_000_000_000, '本金');
  range(config.allocationPct, 1, 100, '投入比例');
  range(config.fast, 2, 120, '短均線');
  range(config.slow, 3, 200, '長均線');
  range(config.rsiPeriod, 2, 60, 'RSI 週期');
  range(config.rsiBuyBelow, 1, 49, 'RSI 買入門檻');
  range(config.rsiSellAbove, 50, 99, 'RSI 賣出門檻');
  range(config.breakoutPeriod, 2, 120, '突破觀察日數');
  range(config.feeBps, 0, 300, '手續費');
  range(config.sellTaxBps, 0, 500, '賣出稅');
  range(config.slippageBps, 0, 500, '滑價');
  range(config.minimumFeeTwd, 0, 500, '最低手續費');
  if (!Number.isInteger(config.fast) || !Number.isInteger(config.slow) ||
      !Number.isInteger(config.rsiPeriod) || !Number.isInteger(config.breakoutPeriod)) {
    throw new Error('策略週期必須為整數');
  }
  if (config.fast >= config.slow) throw new Error('短均線必須小於長均線');
}
export function validateQuantPrices(points: readonly QuantPrice[]): QuantPrice[] {
  if (!Array.isArray(points) || points.length < 120) throw new Error('至少需要 120 個交易日的官方歷史收盤價');
  const clean: QuantPrice[] = [];
  let prev = '';
  for (const point of points) {
    if (!Array.isArray(point) || point.length < 2) throw new Error('歷史價格格式錯誤');
    const [date, price] = point;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(Date.parse(date)) || typeof price !== 'number' ||
        !Number.isFinite(price) || price <= 0 || date <= prev) {
      throw new Error('歷史資料日期必須遞增、不可重複，且收盤價必須為正數');
    }
    clean.push([date, price]);
    prev = date;
  }
  return clean;
}
const mean = (arr: readonly number[]) => arr.reduce((sum, val) => sum + val, 0) / arr.length;
function variance(arr: readonly number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((sum, val) => sum + (val - m) ** 2, 0) / (arr.length - 1);
}
const stdev = (arr: readonly number[]) => Math.sqrt(variance(arr));
function sma(values: readonly number[], end: number, period: number): number | null {
  if (end + 1 < period) return null;
  let total = 0;
  for (let i = end - period + 1; i <= end; i++) total += values[i];
  return total / period;
}
function wilderRsi(values: readonly number[], period: number): Array<number | null> {
  const result: Array<number | null> = Array(values.length).fill(null);
  if (values.length <= period) return result;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gains += Math.max(d, 0);
    losses += Math.max(-d, 0);
  }
  let avgGain = gains / period, avgLoss = losses / period;
  const fromAverages = () => avgLoss === 0 ? (avgGain === 0 ? 50 : 100)
    : 100 - 100 / (1 + avgGain / avgLoss);
  result[period] = fromAverages();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    result[i] = fromAverages();
  }
  return result;
}

/** Signal at close[t] is only eligible to fill at close[t+1] or later. */
export function quantSignals(points: readonly QuantPrice[], cfg: QuantConfig): QuantSignal[] {
  validateQuantConfig(cfg);
  const prices = points.map(p => p[1]);
  const signals: QuantSignal[] = Array(prices.length).fill(null);
  if (cfg.strategy === 'rsi') {
    const rsi = wilderRsi(prices, cfg.rsiPeriod);
    for (let i = cfg.rsiPeriod; i < prices.length; i++) {
      const value = rsi[i];
      signals[i] = value === null ? null :
        value < cfg.rsiBuyBelow ? 'buy' : value > cfg.rsiSellAbove ? 'sell' : null;
    }
  } else if (cfg.strategy === 'sma') {
    for (let i = cfg.slow; i < prices.length; i++) {
      const prevFast = sma(prices, i - 1, cfg.fast)!;
      const prevSlow = sma(prices, i - 1, cfg.slow)!;
      const fast = sma(prices, i, cfg.fast)!;
      const slow = sma(prices, i, cfg.slow)!;
      signals[i] = prevFast <= prevSlow && fast > slow ? 'buy'
        : prevFast >= prevSlow && fast < slow ? 'sell' : null;
    }
  } else {
    for (let i = cfg.breakoutPeriod; i < prices.length; i++) {
      const previous = prices.slice(i - cfg.breakoutPeriod, i);
      signals[i] = prices[i] > Math.max(...previous) ? 'buy'
        : prices[i] < Math.min(...previous) ? 'sell' : null;
    }
  }
  return signals;
}
function fee(notional: number, cfg: QuantConfig) {
  return Math.max(cfg.minimumFeeTwd, notional * cfg.feeBps / 10_000);
}
function sellNotional(shares: number, close: number, cfg: QuantConfig) {
  return shares * close * (1 - cfg.slippageBps / 10_000);
}
function buyNotional(shares: number, close: number, cfg: QuantConfig) {
  return shares * close * (1 + cfg.slippageBps / 10_000);
}
function afterCostHold(points: readonly QuantPrice[], start: number, end: number, cfg: QuantConfig) {
  const entry = points[start][1], exit = points[end][1];
  const budget = cfg.capital * cfg.allocationPct / 100;
  let n = Math.floor(budget / (entry * (1 + (cfg.slippageBps + cfg.feeBps) / 10_000)));
  while (n > 0 && buyNotional(n, entry, cfg) + fee(buyNotional(n, entry, cfg), cfg) > budget + 1e-7) n--;
  if (n <= 0) return 0;
  const cost = buyNotional(n, entry, cfg) + fee(buyNotional(n, entry, cfg), cfg);
  const proceeds = sellNotional(n, exit, cfg);
  const net = proceeds - fee(proceeds, cfg) - proceeds * cfg.sellTaxBps / 10_000;
  return (net - cost) / cfg.capital * 100;
}
function simulate(points: readonly QuantPrice[], signals: readonly QuantSignal[], start: number, end: number, cfg: QuantConfig): QuantSummary {
  let cash = cfg.capital, shares = 0;
  const equity: QuantSummary['equity'] = [], trades: QuantTrade[] = [];
  let entryCost = 0, wins = 0, completed = 0, peak = cfg.capital, mdd = 0;
  const buyHoldPct = afterCostHold(points, start, end, cfg);
  const startClose = points[start][1];
  for (let i = start; i <= end; i++) {
    const close = points[i][1];
    // Only yesterday's close information is used for today's hypothetical fill.
    const signal = i > 0 ? signals[i - 1] : null;
    if (signal === 'sell' && shares > 0) {
      const n = shares;
      const proceeds = sellNotional(n, close, cfg);
      const cost = fee(proceeds, cfg);
      const tax = proceeds * cfg.sellTaxBps / 10_000;
      const netProceeds = proceeds - cost - tax;
      cash += netProceeds;
      shares = 0;
      completed++;
      if (netProceeds > entryCost) wins++; // compare trade net proceeds with actual buy debit
      trades.push({ signalDate: points[i - 1][0], date: points[i][0], action: '賣出', shares: n, price: proceeds / n, fees: cost, tax, cashAfter: cash });
      entryCost = 0;
    } else if (signal === 'buy' && shares === 0) {
      const budget = Math.min(cash, cfg.capital * cfg.allocationPct / 100);
      let n = Math.floor(budget / (close * (1 + (cfg.slippageBps + cfg.feeBps) / 10_000)));
      while (n > 0 && buyNotional(n, close, cfg) + fee(buyNotional(n, close, cfg), cfg) > budget + 1e-7) n--;
      if (n > 0) {
        const gross = buyNotional(n, close, cfg);
        const cost = fee(gross, cfg);
        entryCost = gross + cost;
        cash -= entryCost;
        shares = n;
        trades.push({ signalDate: points[i - 1][0], date: points[i][0], action: '買入', shares: n, price: gross / n, fees: cost, tax: 0, cashAfter: cash });
      }
    }
    const worth = cash + shares * close;
    peak = Math.max(peak, worth);
    mdd = Math.min(mdd, (worth / peak - 1) * 100);
    equity.push({ date: points[i][0], equity: worth, buyHold: cfg.capital });
  }
  // Convert benchmark to its actual daily after-cost liquidation value.
  let holdCash = cfg.capital, holdShares = 0;
  const budget = cfg.capital * cfg.allocationPct / 100;
  let n = Math.floor(budget / (startClose * (1 + (cfg.slippageBps + cfg.feeBps) / 10_000)));
  while (n > 0 && buyNotional(n, startClose, cfg) + fee(buyNotional(n, startClose, cfg), cfg) > budget + 1e-7) n--;
  if (n > 0) {
    const gross = buyNotional(n, startClose, cfg);
    holdShares = n;
    holdCash -= gross + fee(gross, cfg);
  }
  equity.forEach((point, offset) => {
    const proceeds = sellNotional(holdShares, points[start + offset][1], cfg);
    point.buyHold = holdCash + proceeds - (holdShares ? fee(proceeds, cfg) + proceeds * cfg.sellTaxBps / 10_000 : 0);
  });
  const endValue = equity.at(-1)?.equity ?? cfg.capital;
  const dayReturns = equity.slice(1).map((row, i) => row.equity / equity[i].equity - 1);
  const dailyMean = dayReturns.length ? mean(dayReturns) : 0;
  const dailyVol = stdev(dayReturns);
  return {
    firstDate: points[start][0], lastDate: points[end][0],
    totalReturnPct: (endValue / cfg.capital - 1) * 100,
    annualizedReturnPct: dayReturns.length ? (Math.pow(endValue / cfg.capital, 252 / dayReturns.length) - 1) * 100 : null,
    sharpe: dayReturns.length >= 25 && dailyVol > 0 ? dailyMean / dailyVol * Math.sqrt(252) : null,
    maxDrawdownPct: mdd, completedTrades: completed,
    wins, winRatePct: completed ? wins / completed * 100 : null,
    buyHoldReturnPct: buyHoldPct, endingEquity: endValue,
    openShares: shares, equity, trades
  };
}
export function runQuantResearch(data: readonly QuantPrice[], config: QuantConfig = DEFAULT_QUANT_CONFIG): QuantReport {
  const points = validateQuantPrices(data);
  validateQuantConfig(config);
  const split = Math.floor(points.length * 0.7);
  if (split < 60 || points.length - split < 30) throw new Error('樣本內／樣本外資料不足');
  const signals = quantSignals(points, config);
  return {
    total: simulate(points, signals, 0, points.length - 1, config),
    inSample: simulate(points, signals, 0, split - 1, config),
    outOfSample: simulate(points, signals, split, points.length - 1, config),
    splitDate: points[split][0], strategy: config.strategy, observedDays: points.length
  };
}
function rngFromSeed(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function percentile(sorted: readonly number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const i = Math.floor(pos), fraction = pos - i;
  return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * fraction;
}
/**
 * Fixed-seed overlapping block bootstrap of observed DAILY log returns.
 * P10 / P50 / P90 describe simulated price outcomes, not calibrated confidence.
 * Each lookback sample uses only historical data available as of latest close.
 */
export function projectGrowthScenarios(data: readonly QuantPrice[], horizon = 126, seed = 1124): GrowthScenarios {
  const points = validateQuantPrices(data);
  if (![21, 63, 126, 252].includes(horizon)) throw new Error('不支援的預測期間');
  const lookback = points.slice(-253).map(p => p[1]);
  const logs: number[] = [];
  for (let i = 1; i < lookback.length; i++) {
    const change = lookback[i] / lookback[i - 1] - 1;
    if (Math.abs(change) > 0.30) throw new Error('歷史收盤價疑似受拆併股、資料異常影響，無法安全產生情境；需先還原權息資料');
    logs.push(Math.log(lookback[i] / lookback[i - 1]));
  }
  if (logs.length < 90) throw new Error('推演至少需要 90 筆歷史日報酬');
  const lastClose = points.at(-1)![1];
  const random = rngFromSeed(seed);
  const blockLength = 5, pathsCount = 700, sample: number[][] = Array.from({ length: horizon + 1 }, () => []);
  for (let path = 0; path < pathsCount; path++) {
    let logPrice = Math.log(lastClose);
    sample[0].push(lastClose);
    for (let step = 1; step <= horizon;) {
      const begin = Math.floor(random() * (logs.length - blockLength + 1));
      for (let j = 0; j < blockLength && step <= horizon; j++, step++) {
        logPrice += logs[begin + j];
        sample[step].push(Math.exp(logPrice));
      }
    }
  }
  const results: GrowthPoint[] = [];
  for (let day = 0; day <= horizon; day++) {
    const sorted = sample[day].sort((a, b) => a - b);
    results.push({
      day, label: day === 0 ? '最近收盤' : '+' + day + ' 日',
      low: percentile(sorted, .1), median: percentile(sorted, .5), high: percentile(sorted, .9)
    });
  }
  return {
    lastDate: points.at(-1)![0], lastClose, sampleDays: logs.length,
    observations: pathsCount, annualVolatilityPct: stdev(logs) * Math.sqrt(252) * 100,
    annualHistoricalDriftPct: (Math.exp(mean(logs) * 252) - 1) * 100,
    paths: results
  };
}
