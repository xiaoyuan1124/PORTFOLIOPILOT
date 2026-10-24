import { evaluateOversoldStrategy, strategyProfileSchema, type StrategyCandle, type StrategyProfile } from "./strategy-lab";

export type BacktestCosts = { feeBps: number; slippageBps: number; sellTaxBps: number };
export const DEFAULT_BACKTEST_COSTS: BacktestCosts = {
  feeBps: 14.25, slippageBps: 5, sellTaxBps: 30
};
export type MarketRegime = "bull" | "bear" | "sideways" | "unknown";
export type BacktestTrade = {
  signalDate: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  netReturnPct: number;
  reason: "stop" | "target" | "final_close";
  regime: MarketRegime;
  sample: "in_sample" | "out_of_sample" | "boundary";
};
export type BacktestSummary = {
  totalReturnPct: number | null;
  annualizedReturnPct: number | null;
  maxDrawdownPct: number | null;
  winRatePct: number | null;
  profitFactor: number | null;
  averageTradeReturnPct: number | null;
  tradeCount: number;
  wins: number;
  losses: number;
};
export type BacktestReport = {
  status: "complete" | "no_trades" | "insufficient";
  reason: string;
  firstDate: string | null;
  lastDate: string | null;
  sampleSplitDate: string | null;
  source: "official_unadjusted_ohlcv";
  costs: BacktestCosts;
  all: BacktestSummary;
  inSample: BacktestSummary;
  outOfSample: BacktestSummary;
  regime: Record<MarketRegime, { trades: number; averageTradeReturnPct: number | null }>;
  benchmarkBuyHoldPct: number | null;
  trades: BacktestTrade[];
  equity: Array<{ date: string; value: number }>;
  pendingLastBarSignals: number;
};
const PRINCIPAL = 100000;
function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function safeCandles(input: StrategyCandle[], asOf: string) {
  const ordered = [...input].sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.some((bar, i) => {
    const open = bar.open, high = bar.high, low = bar.low, volume = bar.volume;
    return !calendarDate(bar.date) || bar.date > asOf ||
      (i > 0 && bar.date === ordered[i - 1]!.date) ||
      !isFinitePositive(open) || !isFinitePositive(bar.close) ||
      !isFinitePositive(high) || !isFinitePositive(low) ||
      !Number.isFinite(volume) || volume === undefined || volume < 0 ||
      high < Math.max(open, bar.close) || low > Math.min(open, bar.close);
  })) return null;
  return ordered as Array<StrategyCandle & { open: number; high: number; low: number; volume: number }>;
}
function validCosts(costs: BacktestCosts) {
  return Object.values(costs).every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 500);
}
function average(numbers: number[]) {
  return numbers.length ? numbers.reduce((s, v) => s + v, 0) / numbers.length : null;
}
function drawdown(values: number[]): number | null {
  if (values.length < 2) return null;
  let peak = values[0]!, worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    if (peak > 0) worst = Math.min(worst, (value / peak - 1) * 100);
  }
  return worst;
}
function annualReturn(first: number, last: number, sessions: number) {
  if (first <= 0 || last <= 0 || sessions < 1) return null;
  return (Math.pow(last / first, 252 / sessions) - 1) * 100;
}
function summarize(trades: BacktestTrade[], values: number[]): BacktestSummary {
  const winners = trades.filter((trade) => trade.netReturnPct > 0);
  const losers = trades.filter((trade) => trade.netReturnPct < 0);
  const grossProfit = winners.reduce((s, trade) => s + trade.netReturnPct, 0);
  const grossLoss = Math.abs(losers.reduce((s, trade) => s + trade.netReturnPct, 0));
  return {
    totalReturnPct: values.length > 1 && values[0]! > 0 ? (values.at(-1)! / values[0]! - 1) * 100 : null,
    annualizedReturnPct: values.length > 1 ? annualReturn(values[0]!, values.at(-1)!, values.length - 1) : null,
    maxDrawdownPct: drawdown(values),
    winRatePct: trades.length ? winners.length / trades.length * 100 : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    averageTradeReturnPct: average(trades.map((trade) => trade.netReturnPct)),
    tradeCount: trades.length,
    wins: winners.length,
    losses: losers.length
  };
}
function regimeAt(bars: Array<{ close: number }>, i: number): MarketRegime {
  if (i < 60) return "unknown";
  const previous = bars[i - 60]!.close;
  const change = bars[i]!.close / previous - 1;
  if (change > 0.1) return "bull";
  if (change < -0.1) return "bear";
  return "sideways";
}
const EMPTY = (costs: BacktestCosts, reason: string): BacktestReport => ({
  status: "insufficient", reason,
  firstDate: null, lastDate: null, sampleSplitDate: null, source: "official_unadjusted_ohlcv",
  costs, all: summarize([], []), inSample: summarize([], []), outOfSample: summarize([], []),
  regime: {
    bull: { trades: 0, averageTradeReturnPct: null },
    bear: { trades: 0, averageTradeReturnPct: null },
    sideways: { trades: 0, averageTradeReturnPct: null },
    unknown: { trades: 0, averageTradeReturnPct: null }
  },
  benchmarkBuyHoldPct: null, trades: [], equity: [], pendingLastBarSignals: 0
});

/**
 * Fixed-parameter, long-only historical experiment. A signal is evaluated at
 * bar i CLOSE and can execute only at bar i+1 OPEN; intrabar stops assume the
 * adverse stop hits first if stop and target are both touched. Never infer
 * missing OHLCV, corporate action adjustments, or historical commissions.
 */
export function runStrategyBacktest(
  input: StrategyCandle[],
  profile: StrategyProfile,
  asOf: string,
  costs: BacktestCosts = DEFAULT_BACKTEST_COSTS
): BacktestReport {
  if (!calendarDate(asOf) || !strategyProfileSchema.safeParse(profile).success ||
    !validCosts(costs)) return EMPTY(costs, "回測參數或資料日期無效。");
  const bars = safeCandles(input, asOf);
  if (!bars || bars.length < 100) return EMPTY(costs, "資料不足：至少需要 100 根有效且不含未來日期的真實日 K（含成交量）。");
  const fee = costs.feeBps / 10000;
  const slip = costs.slippageBps / 10000;
  const sellTax = costs.sellTaxBps / 10000;
  const split = Math.max(1, Math.min(bars.length - 1, Math.floor(bars.length * 0.7)));
  const trades: BacktestTrade[] = [];
  const equity: Array<{ date: string; value: number }> = [];
  let cash = PRINCIPAL, quantity = 0, pending: { date: string; regime: MarketRegime } | null = null;
  let entry: { date: string; price: number; fillPrice: number; principal: number; signalDate: string; regime: MarketRegime; index: number } | null = null;
  let pendingLastBarSignals = 0;
  function exit(bar: (typeof bars)[number], price: number, reason: BacktestTrade["reason"], exitIndex: number) {
    if (!entry) return;
    const executedPrice = price * (1 - slip);
    const proceeds = quantity * executedPrice * (1 - fee - sellTax);
    const netReturnPct = (proceeds / entry.principal - 1) * 100;
    const sample: BacktestTrade["sample"] = entry.index < split && exitIndex < split ? "in_sample" :
      entry.index >= split ? "out_of_sample" : "boundary";
    trades.push({
      signalDate: entry.signalDate, entryDate: entry.date, exitDate: bar.date,
      entryPrice: entry.fillPrice, exitPrice: executedPrice,
      netReturnPct, reason, regime: entry.regime, sample
    });
    cash = proceeds; quantity = 0; entry = null;
  }
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i]!;
    if (pending && entry === null) {
      const fill = bar.open * (1 + slip);
      const shares = cash / (fill * (1 + fee));
      if (shares > 0 && Number.isFinite(shares)) {
        entry = { date: bar.date, price: bar.open, fillPrice: fill, principal: cash, signalDate: pending.date, regime: pending.regime, index: i };
        quantity = shares; cash = 0;
      }
      pending = null;
    }
    let exitedToday = false;
    if (entry) {
      const stop = entry.fillPrice * (1 - profile.stopLossPct / 100);
      const target = entry.fillPrice * (1 + profile.takeProfitPct / 100);
      // Gap below stop is filled at opening price, never at an impossible stop.
      if (bar.open <= stop) {
        exit(bar, bar.open, "stop", i); exitedToday = true;
      } else if (bar.low <= stop) {
        exit(bar, stop, "stop", i); exitedToday = true;
      } else if (bar.high >= target) {
        exit(bar, bar.open >= target ? target : target, "target", i); exitedToday = true;
      } else if (i === bars.length - 1) {
        exit(bar, bar.close, "final_close", i); exitedToday = true;
      }
    }
    const liquidationValue = entry ? quantity * bar.close * (1 - slip) * (1 - fee - sellTax) : cash;
    equity.push({ date: bar.date, value: liquidationValue });
    if (!entry && !exitedToday && i >= 59) {
      const signal = evaluateOversoldStrategy(bars.slice(0, i + 1), profile, "TWSE STOCK_DAY · genuine OHLCV");
      if (signal.status === "triggered") {
        if (i === bars.length - 1) pendingLastBarSignals++;
        else pending = { date: bar.date, regime: regimeAt(bars, i) };
      }
    }
  }
  const buyFill = bars[0]!.open * (1 + slip);
  const holdQty = PRINCIPAL / (buyFill * (1 + fee));
  const holdProceeds = holdQty * bars.at(-1)!.close * (1 - slip) * (1 - fee - sellTax);
  const slicedIn = equity.slice(0, split).map((x) => x.value);
  const slicedOut = equity.slice(split - 1).map((x) => x.value);
  const regime = Object.fromEntries((["bull", "bear", "sideways", "unknown"] as MarketRegime[]).map((r) => {
    const samples = trades.filter((trade) => trade.regime === r);
    return [r, { trades: samples.length, averageTradeReturnPct: average(samples.map((t) => t.netReturnPct)) }];
  })) as BacktestReport["regime"];
  return {
    status: trades.length ? "complete" : "no_trades",
    reason: trades.length ? "固定參數回測，不含權息還原；勝率僅反映已涵蓋歷史。" : "資料有效，但沒有符合全部條件的已完成交易。",
    firstDate: bars[0]!.date, lastDate: bars.at(-1)!.date, sampleSplitDate: bars[split]!.date,
    source: "official_unadjusted_ohlcv", costs,
    all: summarize(trades, [PRINCIPAL, ...equity.map((x) => x.value)]),
    inSample: summarize(trades.filter((t) => t.sample === "in_sample"), [PRINCIPAL, ...slicedIn]),
    outOfSample: summarize(trades.filter((t) => t.sample === "out_of_sample"), slicedOut),
    regime, benchmarkBuyHoldPct: (holdProceeds / PRINCIPAL - 1) * 100,
    trades, equity, pendingLastBarSignals
  };
}
