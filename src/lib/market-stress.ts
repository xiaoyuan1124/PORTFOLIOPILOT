import type { BenchmarkPoint } from "./benchmark";

export type MarketStressFactor = {
  key: "volatility" | "drawdown" | "momentum";
  label: string;
  value: number;
  percentile: number;
  unit: "%";
};

export type MarketStressDay = {
  date: string;
  index: number;
  score: number;
  factors: MarketStressFactor[];
};

const YEAR_DAYS = 252;
const MOMENTUM_DAYS = 20;
const MIN_BASELINE = 80;

function percentile(value: number, sample: number[]): number {
  if (!sample.length) return 50;
  let below = 0;
  let ties = 0;
  for (const item of sample) {
    if (item < value) below += 1;
    if (item === value) ties += 1;
  }
  return Math.round(((below + ties / 2) / sample.length) * 100);
}

function realizedVolatility(values: number[], end: number): number {
  const returns: number[] = [];
  for (let i = end - MOMENTUM_DAYS + 1; i <= end; i += 1) {
    returns.push(Math.log(values[i] / values[i - 1]));
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * YEAR_DAYS) * 100;
}

/**
 * Independent Taiwan market stress proxy, NOT the ToAlpha index.
 * Only TWSE TAIEX official historical closing prices are used.
 * All three factors use the same as-of date, with no inferred future closes.
 */
export function calculateMarketStress(points: BenchmarkPoint[], today?: string): MarketStressDay[] {
  const deduplicated = new Map<string, number>();
  for (const point of points) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date) || !Number.isFinite(point.value) || point.value <= 0) continue;
    if (today && point.date > today) continue;
    deduplicated.set(point.date, point.value);
  }
  const sorted = [...deduplicated.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-5 * YEAR_DAYS)
    .map(([date, value]) => ({ date, value }));
  if (sorted.length < YEAR_DAYS + MIN_BASELINE) return [];

  const values = sorted.map((point) => point.value);
  const measurements: Array<{ date: string; index: number; volatility: number; drawdown: number; momentum: number }> = [];
  for (let i = YEAR_DAYS - 1; i < sorted.length; i += 1) {
    const peak = Math.max(...values.slice(i - YEAR_DAYS + 1, i + 1));
    measurements.push({
      date: sorted[i].date,
      index: values[i],
      volatility: realizedVolatility(values, i),
      drawdown: ((peak - values[i]) / peak) * 100,
      momentum: ((values[i - MOMENTUM_DAYS] - values[i]) / values[i - MOMENTUM_DAYS]) * 100
    });
  }
  const baseline = {
    volatility: measurements.map((x) => x.volatility),
    drawdown: measurements.map((x) => x.drawdown),
    momentum: measurements.map((x) => x.momentum)
  };
  return measurements.map((item) => {
    const factors: MarketStressFactor[] = [
      { key: "volatility", label: "近 20 日年化波動", value: item.volatility, percentile: percentile(item.volatility, baseline.volatility), unit: "%" },
      { key: "drawdown", label: "距 252 日高點", value: item.drawdown, percentile: percentile(item.drawdown, baseline.drawdown), unit: "%" },
      { key: "momentum", label: "近 20 日跌幅", value: item.momentum, percentile: percentile(item.momentum, baseline.momentum), unit: "%" }
    ];
    return {
      date: item.date,
      index: item.index,
      score: Math.round(factors.reduce((sum, factor) => sum + factor.percentile, 0) / factors.length),
      factors
    };
  });
}

export function marketStressLabel(score: number): string {
  if (score >= 90) return "極度緊張";
  if (score >= 75) return "高度緊張";
  if (score >= 50) return "偏緊張";
  if (score >= 25) return "一般";
  return "相對平靜";
}

export function marketStressDateMismatch(stressDate: string, quoteDate: string | null): boolean {
  return Boolean(quoteDate && quoteDate > stressDate);
}
