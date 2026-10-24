import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKTEST_COSTS, runStrategyBacktest
} from "./strategy-backtest";
import {
  DEFAULT_STRATEGY_PROFILE, evaluateOversoldStrategy, type StrategyCandle
} from "./strategy-lab";
const isoDay = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);

function candles(): StrategyCandle[] {
  return Array.from({ length: 130 }, (_, i) => {
    const close = i < 100 ? 100 : i < 126 ? 100 - 2 * (i - 99) : i === 126 ? 57 : 65 + (i - 127);
    const open = i === 127 ? 61 : close;
    const high = i === 127 ? 73 : Math.max(open, close) + 1;
    const low = i === 127 ? 60 : Math.min(open, close) - 1;
    return { date: isoDay(i), open, high, low, close, volume: i === 126 ? 300 : 100 };
  });
}
describe("V0.93 deterministic next-session simulation", () => {
  it("does not simulate incomplete OHLCV or future dates", () => {
    const fixture = candles();
    expect(runStrategyBacktest(fixture.slice(0, 70), DEFAULT_STRATEGY_PROFILE, isoDay(129)).status).toBe("insufficient");
    expect(runStrategyBacktest(fixture.map((bar, index) => index === 100 ? { ...bar, open: undefined } : bar), DEFAULT_STRATEGY_PROFILE, isoDay(129)).status).toBe("insufficient");
    expect(runStrategyBacktest(fixture, DEFAULT_STRATEGY_PROFILE, isoDay(125)).status).toBe("insufficient");
  });
  it("executes signal at the next real OPEN, never its own closing price", () => {
    const fixture = candles();
    expect(evaluateOversoldStrategy(fixture.slice(0, 127), DEFAULT_STRATEGY_PROFILE).status).toBe("triggered");
    const report = runStrategyBacktest(fixture, DEFAULT_STRATEGY_PROFILE, isoDay(129));
    expect(report.status).toBe("complete");
    expect(report.trades.length).toBe(1);
    expect(report.trades[0]?.signalDate).toBe(isoDay(126));
    expect(report.trades[0]?.entryDate).toBe(isoDay(127));
    expect(report.trades[0]?.entryPrice).toBeCloseTo(61 * (1 + DEFAULT_BACKTEST_COSTS.slippageBps / 10000));
    expect(report.trades[0]?.reason).toBe("target");
    expect(report.trades[0]?.netReturnPct).toBeGreaterThan(0);
    expect(report.trades[0]?.netPnl).toBeGreaterThan(0);
    expect(report.trades[0]?.netPnl).toBeCloseTo(100000 * (report.trades[0]!.netReturnPct / 100));
    expect(report.benchmarkBuyHoldPct).toBeLessThan(0);
  });
  it("does not enter a signal on the final candle without a future open", () => {
    const report = runStrategyBacktest(candles().slice(0, 127), DEFAULT_STRATEGY_PROFILE, isoDay(126));
    expect(report.trades).toHaveLength(0);
    expect(report.status).toBe("no_trades");
    expect(report.pendingLastBarSignals).toBe(1);
  });
  it("pessimistically chooses stop if stop and target both touched in a daily candle", () => {
    const bars = candles();
    bars[127] = { ...bars[127]!, low: 50 };
    const report = runStrategyBacktest(bars, DEFAULT_STRATEGY_PROFILE, isoDay(129));
    expect(report.trades[0]?.reason).toBe("stop");
    expect(report.trades[0]?.netReturnPct).toBeLessThan(0);
    expect(report.trades[0]?.netPnl).toBeLessThan(0);
  });
  it("enforces nonnegative finite transaction costs and preserves OOS trade labels", () => {
    const fixture = candles();
    const report = runStrategyBacktest(fixture, DEFAULT_STRATEGY_PROFILE, isoDay(129));
    expect(report.outOfSample.tradeCount).toBe(1);
    expect(report.inSample.tradeCount).toBe(0);
    expect(report.sampleSplitDate).toBe(isoDay(91));
    expect(report.regime.bear.trades + report.regime.bull.trades + report.regime.sideways.trades + report.regime.unknown.trades).toBe(report.trades.length);
    expect(runStrategyBacktest(fixture, DEFAULT_STRATEGY_PROFILE, isoDay(129), { ...DEFAULT_BACKTEST_COSTS, feeBps: -1 }).status).toBe("insufficient");
  });
  it("handles valid but no-signal history without inventing win rate", () => {
    const flat = candles().map((bar) => ({ ...bar, open: 100, close: 100, high: 101, low: 99, volume: 100 }));
    const report = runStrategyBacktest(flat, DEFAULT_STRATEGY_PROFILE, isoDay(129));
    expect(report.status).toBe("no_trades");
    expect(report.all.tradeCount).toBe(0);
    expect(report.all.winRatePct).toBeNull();
    expect(report.all.profitFactor).toBeNull();
  });
});
