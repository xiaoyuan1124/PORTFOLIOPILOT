import {
  DEFAULT_STRATEGY_PROFILE, evaluateOversoldStrategy,
  type StrategyCandle, type StrategyProfile
} from "./strategy-lab";

export type BacktestConfig = {
  initialCapital: number;
  allocationPct: number;
  feePct: number;
  sellTaxPct: number;
  slippagePct: number;
  trainRatio: number;
};
export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialCapital: 100_000, allocationPct: 100,
  feePct: 0.1425, sellTaxPct: 0.3, slippagePct: 0.15,
  trainRatio: 0.7
};
export type BacktestTrade = {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  profit: number;
  profitPct: number;
  reason: "stop" | "take" | "end";
  regime: "bull" | "bear" | "sideways" | "unknown";
};
export type BacktestMetrics = {
  firstDate: string;
  lastDate: string;
  totalReturnPct: number;
  annualizedReturnPct: number | null;
  winRatePct: number | null;
  maxDrawdownPct: number;
  tradeCount: number;
  averageProfit: number | null;
  profitFactor: number | null;
  benchmarkReturnPct: number;
  excessReturnPct: number;
  trades: BacktestTrade[];
  regimes: Record<BacktestTrade["regime"], { trades: number; profit: number }>;
};
export type BacktestResult =
  | { status: "insufficient"; reason: string; source: string }
  | { status: "available"; source: string; assumptions: string[]; full: BacktestMetrics; inSample: BacktestMetrics; outOfSample: BacktestMetrics };

type SignalFn = (past: StrategyCandle[], config: StrategyProfile) => boolean;
const defaultSignal: SignalFn = (past, profile) => evaluateOversoldStrategy(past, profile).status === "triggered";

function percent(part: number, whole: number) {
  return whole <= 0 ? 0 : (part / whole - 1) * 100;
}
function bounded(n: number, min: number, max: number) {
  return Number.isFinite(n) && n >= min && n <= max;
}
export function validateBacktestInput(bars: StrategyCandle[], config: BacktestConfig): string | null {
  if (!bounded(config.initialCapital, 1, 1e10) || !bounded(config.allocationPct, 1, 100) ||
      !bounded(config.feePct, 0, 5) || !bounded(config.sellTaxPct, 0, 5) ||
      !bounded(config.slippagePct, 0, 10) || !bounded(config.trainRatio, 0.5, 0.9)) {
    return "回測成本、資金或樣本切分參數不合理。";
  }
  if (bars.length < 120) return "歷史 OHLCV 少於 120 根交易日，不足以進行可區分樣本內外的回測。";
  const taipeiToday = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const dateMs = Date.parse(b.date + "T00:00:00Z");
    if (!Number.isFinite(dateMs) || new Date(dateMs).toISOString().slice(0, 10) !== b.date || b.date > taipeiToday ||
        (i > 0 && b.date <= bars[i - 1]!.date)) return "日期無效、重複或沒有按照交易日遞增排序。";
    if (b.open === undefined || b.high === undefined || b.low === undefined || b.volume === undefined ||
        ![b.open, b.high, b.low, b.close, b.volume].every(Number.isFinite) ||
        b.low <= 0 || b.open <= 0 || b.close <= 0 || b.volume < 0 ||
        b.high < Math.max(b.open, b.close) || b.low > Math.min(b.open, b.close)) {
      return "缺少可信的開高低收與真實成交量，禁止補造回測數據。";
    }
    if (i > 0) {
      const previous = Date.parse(bars[i - 1]!.date + "T00:00:00Z");
      if (dateMs - previous > 14 * 86_400_000) return "歷史行情含超過 14 日的缺漏區間，禁止跨缺口回測。";
    }
  }
  return null;
}
function regimeAt(bars: StrategyCandle[], index: number): BacktestTrade["regime"] {
  if (index < 60) return "unknown";
  const previous = bars[index - 60]!.close;
  const change = bars[index - 1]!.close / previous - 1;
  return change > 0.05 ? "bull" : change < -0.05 ? "bear" : "sideways";
}
function sellPrice(b: StrategyCandle, stop: number, take: number): { price: number; reason: "stop" | "take" } | null {
  // A gap through stop is settled at the next actual open, not the stop target.
  if (b.open! <= stop) return { price: b.open!, reason: "stop" };
  if (b.open! >= take) return { price: b.open!, reason: "take" };
  // Both touched: assume the stop occurs first; never choose favorable ordering.
  if (b.low! <= stop) return { price: stop, reason: "stop" };
  if (b.high! >= take) return { price: take, reason: "take" };
  return null;
}
function benchmark(bars: StrategyCandle[], first: number, last: number, cfg: BacktestConfig): number {
  const buy = bars[first]!.open! * (1 + cfg.slippagePct / 100);
  const shares = Math.floor(cfg.initialCapital / (buy * (1 + cfg.feePct / 100)));
  if (!shares) return 0;
  const paid = shares * buy * (1 + cfg.feePct / 100);
  const sell = bars[last]!.close * (1 - cfg.slippagePct / 100);
  const net = shares * sell * (1 - (cfg.feePct + cfg.sellTaxPct) / 100);
  return percent(cfg.initialCapital - paid + net, cfg.initialCapital);
}
function simulate(
  bars: StrategyCandle[], start: number, end: number, cfg: BacktestConfig,
  profile: StrategyProfile, signal: SignalFn
): BacktestMetrics {
  let cash = cfg.initialCapital;
  let position: { date: string; price: number; shares: number; cost: number; regime: BacktestTrade["regime"] } | null = null;
  const trades: BacktestTrade[] = [];
  let peak = cfg.initialCapital, maxDd = 0;
  const fee = cfg.feePct / 100, slip = cfg.slippagePct / 100, tax = cfg.sellTaxPct / 100;
  function exit(index: number, basePrice: number, reason: BacktestTrade["reason"]) {
    if (!position) return;
    const existing = position;
    const fill = basePrice * (1 - slip);
    const proceeds = existing.shares * fill * (1 - fee - tax);
    const gain = proceeds - existing.cost;
    cash += proceeds;
    trades.push({
      entryDate: existing.date, exitDate: bars[index]!.date,
      entryPrice: existing.price, exitPrice: fill, shares: existing.shares,
      profit: gain, profitPct: percent(proceeds, existing.cost),
      reason, regime: existing.regime
    });
    position = null;
  }

  for (let i = start; i <= end; i++) {
    const bar = bars[i]!;
    if (!position && i > 0) {
      // The signal is computed entirely from prices at or BEFORE yesterday's close.
      // Today’s open/high/low/volume never enters the decision to buy today.
      if (signal(bars.slice(0, i), profile)) {
        const fill = bar.open! * (1 + slip);
        const budget = cash * cfg.allocationPct / 100;
        const shares = Math.floor(budget / (fill * (1 + fee)));
        if (shares > 0) {
          const cost = shares * fill * (1 + fee);
          cash -= cost;
          position = { date: bar.date, price: fill, shares, cost, regime: regimeAt(bars, i) };
        }
      }
    }
    if (position) {
      const stop = position.price * (1 - profile.stopLossPct / 100);
      const take = position.price * (1 + profile.takeProfitPct / 100);
      const touched = sellPrice(bar, stop, take);
      if (touched) exit(i, touched.price, touched.reason);
    }
    const equity = cash + (position ? position.shares * bar.close : 0);
    peak = Math.max(peak, equity);
    maxDd = Math.min(maxDd, percent(equity, peak));
  }
  if (position) {
    exit(end, bars[end]!.close, "end");
    maxDd = Math.min(maxDd, percent(cash, peak));
  }

  const firstDate = bars[start]!.date, lastDate = bars[end]!.date;
  const years = (Date.parse(lastDate + "T00:00:00Z") - Date.parse(firstDate + "T00:00:00Z")) / (365.25 * 86_400_000);
  const totalReturnPct = percent(cash, cfg.initialCapital);
  const annualizedReturnPct = years > 0 && cash > 0
    ? (Math.pow(cash / cfg.initialCapital, 1 / years) - 1) * 100 : null;
  const wins = trades.filter((t) => t.profit > 0);
  const gains = wins.reduce((sum, t) => sum + t.profit, 0);
  const losses = trades.filter((t) => t.profit < 0).reduce((sum, t) => sum - t.profit, 0);
  const benchmarkReturnPct = benchmark(bars, start, end, cfg);
  const regimes: BacktestMetrics["regimes"] = {
    bull: { trades: 0, profit: 0 }, bear: { trades: 0, profit: 0 },
    sideways: { trades: 0, profit: 0 }, unknown: { trades: 0, profit: 0 }
  };
  for (const t of trades) {
    regimes[t.regime].trades += 1;
    regimes[t.regime].profit += t.profit;
  }
  return {
    firstDate, lastDate, totalReturnPct, annualizedReturnPct,
    winRatePct: trades.length ? wins.length / trades.length * 100 : null,
    maxDrawdownPct: maxDd, tradeCount: trades.length,
    averageProfit: trades.length ? trades.reduce((sum, t) => sum + t.profit, 0) / trades.length : null,
    profitFactor: losses > 0 ? gains / losses : null,
    benchmarkReturnPct, excessReturnPct: totalReturnPct - benchmarkReturnPct,
    trades, regimes
  };
}
export function backtestOversoldStrategy(
  bars: StrategyCandle[],
  profile: StrategyProfile = DEFAULT_STRATEGY_PROFILE,
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
  source = "TWSE STOCK_DAY（未還原權息）",
  signal: SignalFn = defaultSignal
): BacktestResult {
  const invalid = validateBacktestInput(bars, config);
  if (invalid) return { status: "insufficient", reason: invalid, source };
  const split = Math.max(61, Math.min(bars.length - 40, Math.floor(bars.length * config.trainRatio)));
  return {
    status: "available", source,
    assumptions: [
      "所有訊號使用當日收盤以前的歷史，最快隔日開盤成交。",
      "不可融資；按可用現金決定整股數量。成交計入雙邊手續費、賣出稅及滑價。",
      "停損與停利同日觸及時，保守假定先觸發停損；跳空時依真實開盤價。",
      "樣本依時間先後拆分，樣本外段保留先前資料作指標暖機但不保留樣本內部位。",
      "僅為未還原權息的價格回測，不代表含股息總報酬。"
    ],
    full: simulate(bars, 60, bars.length - 1, config, profile, signal),
    inSample: simulate(bars, 60, split - 1, config, profile, signal),
    outOfSample: simulate(bars, split, bars.length - 1, config, profile, signal)
  };
}
