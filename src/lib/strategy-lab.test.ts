import { describe, expect, it } from "vitest";
import { emptyState } from "./demo-data";
import { parseStoredStateRaw, serializeStoredState } from "./storage";
import {
  closeOnlyCandles, computeStrategyIndicators, DEFAULT_STRATEGY_LAB,
  DEFAULT_STRATEGY_PROFILE, evaluateOversoldStrategy, evaluateWatchZone,
  strategyLabStateSchema, type StrategyCandle
} from "./strategy-lab";

function day(i: number) { return new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10); }
const thirtyCloses = Array.from({ length: 45 }, (_, i) => ({ date: day(i), close: 150 - i }));

describe("Strategy Lab v0.92 contract", () => {
  it("seeds six independent editable research thresholds, not orders", () => {
    expect(strategyLabStateSchema.safeParse(DEFAULT_STRATEGY_LAB).success).toBe(true);
    expect(DEFAULT_STRATEGY_LAB.targets.map((target) => target.symbol)).toEqual([
      "2317", "2382", "2345", "2449", "3711", "3037"
    ]);
    expect(DEFAULT_STRATEGY_LAB.targets.every((target) => target.secondPrice < target.firstPrice)).toBe(true);
  });
  it("rejects inverted prices, duplicate targets and missing active profile", () => {
    expect(strategyLabStateSchema.safeParse({
      ...DEFAULT_STRATEGY_LAB,
      targets: [{ ...DEFAULT_STRATEGY_LAB.targets[0], secondPrice: 9999 }]
    }).success).toBe(false);
    expect(strategyLabStateSchema.safeParse({
      ...DEFAULT_STRATEGY_LAB, targets: [DEFAULT_STRATEGY_LAB.targets[0], DEFAULT_STRATEGY_LAB.targets[0]]
    }).success).toBe(false);
    expect(strategyLabStateSchema.safeParse({
      ...DEFAULT_STRATEGY_LAB, activeProfileId: "deleted"
    }).success).toBe(false);
  });
  it("round-trips settings through existing portfolio JSON backup and migration", () => {
    const state = { ...emptyState, strategyLab: DEFAULT_STRATEGY_LAB };
    const roundTrip = parseStoredStateRaw(serializeStoredState(state));
    expect(roundTrip.strategyLab).toEqual(DEFAULT_STRATEGY_LAB);
    expect(roundTrip.holdings).toEqual(emptyState.holdings);
    expect(roundTrip.watchlist).toEqual(emptyState.watchlist ?? []);
  });
  it("old backup with no lab field remains parseable and intact", () => {
    const original = JSON.stringify(emptyState);
    const restored = parseStoredStateRaw(original);
    expect(restored.strategyLab).toBeUndefined();
    expect(restored.holdings).toEqual(emptyState.holdings);
  });
  it("detects lower and upper watch zones without guessing prices", () => {
    expect(evaluateWatchZone(240, 235, 215)).toBe("outside");
    expect(evaluateWatchZone(235, 235, 215)).toBe("first");
    expect(evaluateWatchZone(215, 235, 215)).toBe("second");
    expect(evaluateWatchZone(null, 235, 215)).toBe("insufficient");
  });
  it("returns insufficient rather than a trade from close-only cache", () => {
    const signal = evaluateOversoldStrategy(thirtyCloses);
    expect(signal.rules.rsi.status).toBe("pass");
    expect(signal.rules.kd.status).toBe("insufficient");
    expect(signal.rules.volume.status).toBe("insufficient");
    expect(signal.status).toBe("insufficient");
    expect(signal.asOf).toBe(day(44));
    expect(signal.indicators.macdHistogram).not.toBeNull();
    expect(signal.indicators.sma20).not.toBeNull();
  });
  it("requires enough bars before publishing technical indicators", () => {
    const result = computeStrategyIndicators(thirtyCloses.slice(0, 5), DEFAULT_STRATEGY_PROFILE);
    expect(result.rsi).toBeNull();
    expect(result.macd).toBeNull();
    expect(result.macdSignal).toBeNull();
    expect(result.sma20).toBeNull();
  });
  it("uses prior 20 volumes, excluding the current day, and proper OHLC for K", () => {
    const candles: StrategyCandle[] = Array.from({ length: 45 }, (_, i) => ({
      date: day(i), close: i === 44 ? 99 : 91, high: 100, low: 90, volume: i === 44 ? 250 : 100
    }));
    const result = evaluateOversoldStrategy(candles);
    expect(result.indicators.volumeRatio20).toBeCloseTo(2.5);
    expect(result.rules.volume.status).toBe("pass");
    expect(result.indicators.kdK).not.toBeNull();
    expect(result.rules.kd.status).toBe("pass");
    expect(result.rules.rsi.status).toBe("fail");
    expect(result.status).toBe("not_triggered");
  });
  it("rejects volume if any input bar is missing; does not fabricate K from close", () => {
    const candles = thirtyCloses.map((bar, i) => ({ ...bar, volume: i === 30 ? undefined : 100 }));
    expect(evaluateOversoldStrategy(candles).rules.volume.status).toBe("insufficient");
    expect(evaluateOversoldStrategy(closeOnlyCandles(thirtyCloses.map((bar) => [bar.date, bar.close]))).rules.kd.status).toBe("insufficient");
  });
});
