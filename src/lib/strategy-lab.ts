import { z } from "zod";
import type { TwPriceHistoryPoint } from "./price-history-data";

const positivePrice = z.number().finite().positive().max(10_000_000);
export const strategyTargetSchema = z.object({
  id: z.string().min(1).max(80),
  symbol: z.string().regex(/^[A-Z0-9]{4,10}$/),
  venue: z.enum(["TWSE", "TPEx"]),
  name: z.string().trim().min(1).max(80),
  firstPrice: positivePrice,
  secondPrice: positivePrice,
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500)
}).refine((target) => target.secondPrice < target.firstPrice, {
  message: "第二階段價位必須低於第一階段。", path: ["secondPrice"]
});
export const strategyProfileSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  rsiPeriod: z.number().int().min(2).max(100),
  rsiBelow: z.number().finite().min(1).max(99),
  volumeMultiple: z.number().finite().min(1).max(20),
  kdPeriod: z.number().int().min(2).max(100),
  kdCrossAbove: z.number().finite().min(1).max(99),
  stopLossPct: z.number().finite().min(0.1).max(95),
  takeProfitPct: z.number().finite().min(0.1).max(500)
});
export const strategyLabStateSchema = z.object({
  version: z.literal(1),
  targets: z.array(strategyTargetSchema).max(100),
  profiles: z.array(strategyProfileSchema).min(1).max(20),
  activeProfileId: z.string().min(1)
}).superRefine((state, ctx) => {
  const targets = new Set<string>();
  state.targets.forEach((target, index) => {
    const key = target.venue + ":" + target.symbol;
    if (targets.has(key)) ctx.addIssue({ code: "custom", path: ["targets", index], message: "觀察清單不能重複加入同一標的。" });
    targets.add(key);
  });
  const profiles = new Set<string>();
  state.profiles.forEach((profile, index) => {
    if (profiles.has(profile.id)) ctx.addIssue({ code: "custom", path: ["profiles", index], message: "策略 ID 不可重複。" });
    profiles.add(profile.id);
  });
  if (!profiles.has(state.activeProfileId)) ctx.addIssue({
    code: "custom", path: ["activeProfileId"], message: "選取的策略不存在。"
  });
});
export type StrategyLabState = z.infer<typeof strategyLabStateSchema>;
export type StrategyLabTarget = StrategyLabState["targets"][number];
export type StrategyProfile = StrategyLabState["profiles"][number];
export const DEFAULT_STRATEGY_PROFILE: StrategyProfile = {
  id: "oversold-b", name: "B · 超跌反彈（實驗）",
  rsiPeriod: 14, rsiBelow: 30, volumeMultiple: 2,
  kdPeriod: 9, kdCrossAbove: 20, stopLossPct: 8, takeProfitPct: 16
};
// Research thresholds, not orders or current fair values. No mutation of holdings.
export const DEFAULT_STRATEGY_LAB: StrategyLabState = {
  version: 1,
  activeProfileId: "oversold-b",
  profiles: [DEFAULT_STRATEGY_PROFILE],
  targets: [
    { id: "TWSE:2317", venue: "TWSE", symbol: "2317", name: "鴻海", firstPrice: 235, secondPrice: 215, createdAt: "2026-10-24", note: "研究門檻，非買進價。" },
    { id: "TWSE:2382", venue: "TWSE", symbol: "2382", name: "廣達", firstPrice: 300, secondPrice: 275, createdAt: "2026-10-24", note: "研究門檻，非買進價。" },
    { id: "TWSE:2345", venue: "TWSE", symbol: "2345", name: "智邦", firstPrice: 1700, secondPrice: 1500, createdAt: "2026-10-24", note: "研究門檻，非買進價。" },
    { id: "TWSE:2449", venue: "TWSE", symbol: "2449", name: "京元電子", firstPrice: 245, secondPrice: 220, createdAt: "2026-10-24", note: "研究門檻，非買進價。" },
    { id: "TWSE:3711", venue: "TWSE", symbol: "3711", name: "日月光投控", firstPrice: 585, secondPrice: 520, createdAt: "2026-10-24", note: "研究門檻，非買進價。" },
    { id: "TWSE:3037", venue: "TWSE", symbol: "3037", name: "欣興", firstPrice: 950, secondPrice: 820, createdAt: "2026-10-24", note: "研究門檻，非買進價。" }
  ]
};
export type StrategyCandle = { date: string; close: number; high?: number; low?: number; volume?: number };
export type IndicatorResult = {
  asOf: string | null; close: number | null; bars: number;
  sma20: number | null; ema20: number | null; rsi: number | null;
  macd: number | null; macdSignal: number | null; macdHistogram: number | null;
  kdK: number | null; kdD: number | null; kdPreviousK: number | null; volumeRatio20: number | null;
};
function validBars(input: StrategyCandle[]): StrategyCandle[] {
  const byDate = new Map<string, StrategyCandle>();
  for (const bar of input) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.date) || !Number.isFinite(bar.close) || bar.close <= 0) continue;
    const high = bar.high, low = bar.low, volume = bar.volume;
    byDate.set(bar.date, {
      date: bar.date, close: bar.close,
      ...(high !== undefined && low !== undefined && Number.isFinite(high) && Number.isFinite(low) &&
        high >= bar.close && low <= bar.close && low > 0 ? { high, low } : {}),
      ...(volume !== undefined && Number.isFinite(volume) && volume >= 0 ? { volume } : {})
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
function average(values: number[]) { return values.reduce((a, b) => a + b, 0) / values.length; }
function emaSeries(prices: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(prices.length).fill(null);
  if (prices.length < period) return out;
  let ema = average(prices.slice(0, period));
  out[period - 1] = ema;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i]! * (2 / (period + 1)) + ema * (1 - 2 / (period + 1));
    out[i] = ema;
  }
  return out;
}
function rsiWilder(prices: number[], period: number): number | null {
  if (prices.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const delta = prices[i]! - prices[i - 1]!;
    gains += Math.max(delta, 0);
    losses += Math.max(-delta, 0);
  }
  gains /= period; losses /= period;
  for (let i = period + 1; i < prices.length; i++) {
    const delta = prices[i]! - prices[i - 1]!;
    gains = (gains * (period - 1) + Math.max(delta, 0)) / period;
    losses = (losses * (period - 1) + Math.max(-delta, 0)) / period;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  return 100 - 100 / (1 + gains / losses);
}
// Taiwan KD (9,3,3): RSV -> smoothed K, starting K=50.
// Only a complete OHLC history is eligible; no close-only approximation.
function kdSmoothed(bars: StrategyCandle[], period: number, end: number): { k: number; d: number } | null {
  if (end + 1 < period) return null;
  let k = 50;
  let d = 50;
  for (let i = period - 1; i <= end; i++) {
    const window = bars.slice(i + 1 - period, i + 1);
    if (window.some((bar) => bar.high === undefined || bar.low === undefined)) return null;
    const highest = Math.max(...window.map((bar) => bar.high!));
    const lowest = Math.min(...window.map((bar) => bar.low!));
    const rsv = highest === lowest ? 50 : (bars[i]!.close - lowest) / (highest - lowest) * 100;
    k = (2 * k + rsv) / 3;
    d = (2 * d + k) / 3;
  }
  return { k, d };
}
export function computeStrategyIndicators(input: StrategyCandle[], profile: StrategyProfile): IndicatorResult {
  const bars = validBars(input);
  const closes = bars.map((bar) => bar.close);
  const last = bars.at(-1);
  const fast = emaSeries(closes, 12), slow = emaSeries(closes, 26);
  const line = closes.map((_, i) => fast[i] !== null && slow[i] !== null ? fast[i]! - slow[i]! : null);
  const signalSeries = emaSeries(line.filter((v): v is number => v !== null), 9);
  const macd = line.at(-1) ?? null, macdSignal = signalSeries.at(-1) ?? null;
  const volumeWindow = bars.slice(-21, -1);
  const volumeRatio20 = last?.volume !== undefined &&
    volumeWindow.length === 20 && volumeWindow.every((bar) => bar.volume !== undefined) &&
    average(volumeWindow.map((bar) => bar.volume!)) > 0
      ? last.volume / average(volumeWindow.map((bar) => bar.volume!))
      : null;
  return {
    asOf: last?.date ?? null, close: last?.close ?? null, bars: bars.length,
    sma20: closes.length >= 20 ? average(closes.slice(-20)) : null,
    ema20: emaSeries(closes, 20).at(-1) ?? null,
    rsi: rsiWilder(closes, profile.rsiPeriod),
    macd, macdSignal, macdHistogram: macd !== null && macdSignal !== null ? macd - macdSignal : null,
    kdK: last ? kdSmoothed(bars, profile.kdPeriod, bars.length - 1)?.k ?? null : null,
    kdD: last ? kdSmoothed(bars, profile.kdPeriod, bars.length - 1)?.d ?? null : null,
    kdPreviousK: bars.length >= 2 ? kdSmoothed(bars, profile.kdPeriod, bars.length - 2)?.k ?? null : null,
    volumeRatio20
  };
}
export type GateResult = { status: "pass" | "fail" | "insufficient"; reason: string };
export type StrategySignal = {
  status: "triggered" | "not_triggered" | "insufficient";
  asOf: string | null;
  rules: { rsi: GateResult; volume: GateResult; kd: GateResult };
  indicators: IndicatorResult;
  source: string;
};
export function evaluateOversoldStrategy(
  candles: StrategyCandle[], profile: StrategyProfile = DEFAULT_STRATEGY_PROFILE,
  source = "TWSE／TPEx · 歷史收盤快取"
): StrategySignal {
  const ind = computeStrategyIndicators(candles, profile);
  const rsi: GateResult = ind.rsi === null
    ? { status: "insufficient", reason: "RSI 歷史交易日不足。" }
    : { status: ind.rsi < profile.rsiBelow ? "pass" : "fail", reason: "RSI " + ind.rsi.toFixed(2) + "；門檻低於 " + profile.rsiBelow + "。" };
  const volume: GateResult = ind.volumeRatio20 === null
    ? { status: "insufficient", reason: "缺少連續 21 個交易日的真實成交量，無法驗證量能。" }
    : { status: ind.volumeRatio20 > profile.volumeMultiple ? "pass" : "fail", reason: "當日量比前 20 日均量 " + ind.volumeRatio20.toFixed(2) + " 倍；門檻高於 " + profile.volumeMultiple + " 倍。" };
  const kd: GateResult = ind.kdK === null || ind.kdPreviousK === null
    ? { status: "insufficient", reason: "缺少歷史最高／最低價（OHLC），不能以收盤價冒充 KD。" }
    : { status: ind.kdPreviousK <= profile.kdCrossAbove && ind.kdK > profile.kdCrossAbove ? "pass" : "fail",
        reason: "K 值 " + ind.kdPreviousK.toFixed(2) + " → " + ind.kdK.toFixed(2) + "；需向上突破 " + profile.kdCrossAbove + "。" };
  const statuses = [rsi.status, volume.status, kd.status];
  return {
    status: statuses.includes("insufficient") ? "insufficient" : statuses.every((s) => s === "pass") ? "triggered" : "not_triggered",
    asOf: ind.asOf, rules: { rsi, volume, kd }, indicators: ind, source
  };
}
export function evaluateWatchZone(close: number | null, first: number, second: number) {
  if (close === null || !Number.isFinite(close) || close <= 0) return "insufficient" as const;
  if (close <= second) return "second" as const;
  if (close <= first) return "first" as const;
  return "outside" as const;
}
export function closeOnlyCandles(points: TwPriceHistoryPoint[]): StrategyCandle[] {
  return points.map(([date, close]) => ({ date, close }));
}


export function newestVerifiedClose(
  candidates: Array<{ date: string; close: number; source: "quote" | "history" }>,
  today: string
): { date: string; close: number; source: "quote" | "history" } | null {
  const valid = candidates.filter((item) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || item.date > today ||
      !Number.isFinite(item.close) || item.close <= 0) return false;
    const instant = new Date(item.date + "T00:00:00Z");
    return !Number.isNaN(instant.getTime()) && instant.toISOString().slice(0, 10) === item.date;
  });
  valid.sort((a, b) => b.date.localeCompare(a.date) || (a.source === "quote" ? -1 : 1));
  return valid[0] ?? null;
}
