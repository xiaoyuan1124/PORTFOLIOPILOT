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
  /** Monetary P&L in the same notional units as the starting 100,000 TWD. */
  netPnl: number;
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
type VerifiedCandle = StrategyCandle & { open: number; high: number; low: number; volume: number };
function safeCandles(input: StrategyCandle[], asOf: string): VerifiedCandle[] | null {
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
  return ordered as VerifiedCandle[];
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
  // Profit factor uses monetary profit/loss, not unweighted percentages.
  // Percentage aggregation would misstate PF when trade capital compounds.
  const grossProfit = winners.reduce((s, trade) => s + trade.netPnl, 0);
  const grossLoss = Math.abs(losers.reduce((s, trade) => s + trade.netPnl, 0));
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
  type Entry = {
    date: string; fillPrice: number; invested: number; signalDate: string;
    regime: MarketRegime; index: number;
  };
  type Pending = { date: string; regime: MarketRegime };
  type WindowMode = "full" | "in_sample" | "out_of_sample";

  /**
   * Each holdout window begins with independent, unleveraged cash.
   * Previous real OHLCV is available only to warm up indicators. A position
   * from the training interval is never carried into the test interval.
   */
  function simulate(from: number, to: number, mode: WindowMode) {
    let cash = PRINCIPAL;
    let shares = 0;
    let position: Entry | null = null;
    let pending: Pending | null = null;
    let lastBarSignals = 0;
    const trades: BacktestTrade[] = [];
    const equity: Array<{ date: string; value: number }> = [];

    // The first test session may act on a signal made at the preceding
    // session's close (known before the test session opens).
    if (from > 0) {
      const previous = from - 1;
      if (previous >= 59 &&
          evaluateOversoldStrategy(bars.slice(0, from), profile).status === "triggered") {
        pending = { date: bars[previous]!.date, regime: regimeAt(bars, previous) };
      }
    }
    function exit(bar: VerifiedCandle, rawPrice: number,
                  reason: BacktestTrade["reason"], index: number) {
      if (position === null) return;
      const holding = position;
      const executed = rawPrice * (1 - slip);
      const proceeds = shares * executed * (1 - fee - sellTax);
      const pnl = proceeds - holding.invested;
      const sample: BacktestTrade["sample"] = mode === "full"
        ? holding.index < split && index < split
          ? "in_sample"
          : holding.index >= split ? "out_of_sample" : "boundary"
        : mode;
      trades.push({
        signalDate: holding.signalDate, entryDate: holding.date,
        exitDate: bar.date, entryPrice: holding.fillPrice,
        exitPrice: executed, netPnl: pnl,
        netReturnPct: pnl / holding.invested * 100,
        reason, regime: holding.regime, sample
      });
      cash += proceeds;
      shares = 0;
      position = null;
    }

    for (let index = from; index < to; index++) {
      const bar = bars[index]!;
      if (pending && !position) {
        const fill = bar.open * (1 + slip);
        // No margin, no fractional Taiwan shares and no negative cash.
        const count = Math.floor(cash / (fill * (1 + fee)));
        if (count >= 1 && Number.isFinite(count)) {
          const invested = count * fill * (1 + fee);
          position = {
            date: bar.date, fillPrice: fill, invested,
            signalDate: pending.date, regime: pending.regime, index
          };
          shares = count;
          cash = Math.max(0, cash - invested);
        }
        pending = null;
      }

      let exited = false;
      if (position) {
        const stop = position.fillPrice * (1 - profile.stopLossPct / 100);
        const take = position.fillPrice * (1 + profile.takeProfitPct / 100);
        // A gap through stop is filled at the actual opening price.
        // An adverse stop wins over an intraday target when both hit.
        if (bar.open <= stop) {
          exit(bar, bar.open, "stop", index); exited = true;
        } else if (bar.low <= stop) {
          exit(bar, stop, "stop", index); exited = true;
        } else if (bar.high >= take) {
          exit(bar, take, "target", index); exited = true;
        } else if (index === to - 1) {
          exit(bar, bar.close, "final_close", index); exited = true;
        }
      }
      const liquidation = position
        ? cash + shares * bar.close * (1 - slip) * (1 - fee - sellTax)
        : cash;
      equity.push({ date: bar.date, value: liquidation });

      if (!position && !exited && index >= 59) {
        // This signal can ONLY be executed at the next day's real open.
        const signal = evaluateOversoldStrategy(bars.slice(0, index + 1), profile);
        if (signal.status === "triggered") {
          if (index === to - 1) lastBarSignals++;
          else pending = { date: bar.date, regime: regimeAt(bars, index) };
        }
      }
    }
    return { trades, equity, pendingLastBarSignals: lastBarSignals };
  }

  const full = simulate(0, bars.length, "full");
  const inSample = simulate(0, split, "in_sample");
  const outOfSample = simulate(split, bars.length, "out_of_sample");
  const buyFill = bars[0]!.open * (1 + slip);
  const buyShares = Math.floor(PRINCIPAL / (buyFill * (1 + fee)));
  const unusedCash = PRINCIPAL - buyShares * buyFill * (1 + fee);
  const buyHoldProceeds = buyShares * bars.at(-1)!.close * (1 - slip) * (1 - fee - sellTax);
  const regimes = (["bull", "bear", "sideways", "unknown"] as MarketRegime[]);
  const regime = Object.fromEntries(regimes.map((reg) => {
    const transactions = full.trades.filter((trade) => trade.regime === reg);
    return [reg, {
      trades: transactions.length,
      averageTradeReturnPct: average(transactions.map((trade) => trade.netReturnPct))
    }];
  })) as BacktestReport["regime"];
  return {
    status: full.trades.length ? "complete" : "no_trades",
    reason: full.trades.length
      ? "整股、無槓桿固定參數價格回測；樣本外獨立現金帳戶，不含權息還原。"
      : "資料有效，但沒有符合全部條件的已完成交易。",
    firstDate: bars[0]!.date, lastDate: bars.at(-1)!.date,
    sampleSplitDate: bars[split]!.date,
    source: "official_unadjusted_ohlcv", costs,
    all: summarize(full.trades, [PRINCIPAL, ...full.equity.map((x) => x.value)]),
    inSample: summarize(inSample.trades, [PRINCIPAL, ...inSample.equity.map((x) => x.value)]),
    outOfSample: summarize(outOfSample.trades, [PRINCIPAL, ...outOfSample.equity.map((x) => x.value)]),
    regime,
    benchmarkBuyHoldPct: (unusedCash + buyHoldProceeds) / PRINCIPAL * 100 - 100,
    trades: full.trades, equity: full.equity,
    pendingLastBarSignals: full.pendingLastBarSignals
  };
}
