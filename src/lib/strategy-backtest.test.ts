import { describe, expect, it } from "vitest";
import {
  backtestOversoldStrategy, DEFAULT_BACKTEST_CONFIG, validateBacktestInput
} from "./strategy-backtest";
import { DEFAULT_STRATEGY_PROFILE, type StrategyCandle } from "./strategy-lab";

function day(i: number) {
  return new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
}
function fixtures(count = 160): StrategyCandle[] {
  return Array.from({ length: count }, (_, i) => ({
    date: day(i), open: 100, high: 101, low: 99, close: 100, volume: 1000
  }));
}
const firstSignal = (past: StrategyCandle[]) => past.length === 60;
const bothSidesSignal = (past: StrategyCandle[]) => past.length === 60 || past.length === 120;

describe("V0.93 strictly historical cost-aware backtesting", () => {
  it("declines missing OHLCV instead of inventing simulated returns", () => {
    expect(backtestOversoldStrategy(fixtures().map(({ date, close }) => ({ date, close }))).status).toBe("insufficient");
    expect(backtestOversoldStrategy(fixtures(60)).status).toBe("insufficient");
    const future = fixtures();
    future[future.length - 1] = { ...future[future.length - 1]!, date: "2099-01-01" };
    expect(backtestOversoldStrategy(future).status).toBe("insufficient");
    expect(validateBacktestInput(fixtures(), { ...DEFAULT_BACKTEST_CONFIG, feePct: -1 })).toMatch(/參數/);
  });
  it("rejects unsorted, duplicate and inconsistent OHLC rows", () => {
    const rows = fixtures();
    rows[20] = { ...rows[20]!, date: rows[19]!.date };
    expect(backtestOversoldStrategy(rows).status).toBe("insufficient");
    const other = fixtures();
    other[55] = { ...other[55]!, high: 95 };
    expect(backtestOversoldStrategy(other).status).toBe("insufficient");
  });
  it("executes yesterday's close signal at the next real open, not signal close", () => {
    const bars = fixtures();
    bars[59] = { ...bars[59]!, open: 90, high: 110, low: 90, close: 110 };
    bars[60] = { ...bars[60]!, open: 100, high: 101, low: 99, close: 100 };
    const result = backtestOversoldStrategy(bars, DEFAULT_STRATEGY_PROFILE, DEFAULT_BACKTEST_CONFIG, "fixture", firstSignal);
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    const trade = result.inSample.trades[0]!;
    expect(trade.entryDate).toBe(day(60));
    expect(trade.entryPrice).toBeCloseTo(100 * (1 + DEFAULT_BACKTEST_CONFIG.slippagePct / 100));
    expect(trade.entryPrice).not.toEqual(bars[59]!.close);
    expect(result.outOfSample.tradeCount).toBe(0);
  });
  it("assumes same-day stop before target; includes sell tax, two fees and slippage", () => {
    const bars = fixtures();
    bars[61] = { ...bars[61]!, high: 120, low: 90 };
    const result = backtestOversoldStrategy(bars, DEFAULT_STRATEGY_PROFILE, DEFAULT_BACKTEST_CONFIG, "fixture", firstSignal);
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    const t = result.full.trades[0]!;
    expect(t.exitDate).toBe(day(61));
    expect(t.reason).toBe("stop");
    expect(t.exitPrice).toBeLessThan(t.entryPrice * 0.92);
    expect(t.profit).toBeLessThan(0);
    expect(result.full.totalReturnPct).toBeLessThan(0);
    expect(result.full.winRatePct).toBe(0);
    expect(result.full.profitFactor).toBe(0);
  });
  it("splits in-sample and out-of-sample by trade date and produces comparison and market-regime metrics", () => {
    const bars = fixtures();
    bars[61] = { ...bars[61]!, low: 90 };
    const result = backtestOversoldStrategy(bars, DEFAULT_STRATEGY_PROFILE, DEFAULT_BACKTEST_CONFIG, "fixture", bothSidesSignal);
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.inSample.tradeCount).toBe(1);
    expect(result.outOfSample.tradeCount).toBe(1);
    expect(result.full.tradeCount).toBe(2);
    expect(result.inSample.lastDate < result.outOfSample.firstDate).toBe(true);
    expect(result.outOfSample.trades[0]!.entryDate).toBe(day(120));
    expect(Number.isFinite(result.full.benchmarkReturnPct)).toBe(true);
    expect(result.full.regimes.unknown.trades + result.full.regimes.sideways.trades +
      result.full.regimes.bull.trades + result.full.regimes.bear.trades).toBe(result.full.tradeCount);
  });
  it("does not let later candles affect an earlier signal, and never allows fractional or margin shares", () => {
    const base = fixtures();
    const changed = fixtures();
    changed[130] = { ...changed[130]!, high: 120, low: 85, close: 110 };
    const a = backtestOversoldStrategy(base, DEFAULT_STRATEGY_PROFILE, DEFAULT_BACKTEST_CONFIG, "fixture", firstSignal);
    const b = backtestOversoldStrategy(changed, DEFAULT_STRATEGY_PROFILE, DEFAULT_BACKTEST_CONFIG, "fixture", firstSignal);
    expect(a.status).toBe("available"); expect(b.status).toBe("available");
    if (a.status !== "available" || b.status !== "available") return;
    expect(a.inSample.trades[0]!.entryDate).toBe(b.inSample.trades[0]!.entryDate);
    expect(a.inSample.trades[0]!.entryPrice).toBe(b.inSample.trades[0]!.entryPrice);
    expect(a.inSample.trades[0]!.shares % 1).toBe(0);
    expect(a.inSample.trades[0]!.shares).toBeGreaterThan(0);
  });
  it("does not publish a win rate or profit factor when no trade occurred", () => {
    const result = backtestOversoldStrategy(fixtures(), DEFAULT_STRATEGY_PROFILE, DEFAULT_BACKTEST_CONFIG, "fixture", () => false);
    expect(result.status).toBe("available");
    if (result.status !== "available") return;
    expect(result.full.tradeCount).toBe(0);
    expect(result.full.winRatePct).toBeNull();
    expect(result.full.profitFactor).toBeNull();
    expect(result.full.averageProfit).toBeNull();
    expect(result.full.totalReturnPct).toBe(0);
  });
});
