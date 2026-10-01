import type { TwPriceHistoryPoint } from "./price-history-data";

function addMonths(date: string, delta: number) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const firstOfTarget = new Date(Date.UTC(year, monthIndex + delta, 1));
  const targetYear = firstOfTarget.getUTCFullYear();
  const targetMonth = firstOfTarget.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

function normalize(points: TwPriceHistoryPoint[]) {
  const byDate = new Map<string, number>();
  for (const [date, close] of points) {
    if (!Number.isFinite(close) || close <= 0) continue;
    byDate.set(date, close);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)) as TwPriceHistoryPoint[];
}

function startPointForTarget(points: TwPriceHistoryPoint[], targetDate: string, endDate: string) {
  return points.find(([date]) => date >= targetDate && date < endDate) ?? null;
}

export function trailingPriceReturn(points: TwPriceHistoryPoint[], months: number) {
  const rows = normalize(points);
  const end = rows.at(-1);
  if (!end || rows.length < 2) return null;
  const targetDate = addMonths(end[0], -months);
  const start = startPointForTarget(rows, targetDate, end[0]);
  if (!start || start[1] <= 0) return null;
  return {
    startDate: start[0],
    endDate: end[0],
    startClose: start[1],
    endClose: end[1],
    returnPct: (end[1] / start[1] - 1) * 100
  };
}

export function maxDrawdownPct(points: TwPriceHistoryPoint[]) {
  const rows = normalize(points);
  if (rows.length < 2) return null;
  let peak = rows[0]![1];
  let maxDrawdown = 0;
  for (const [, close] of rows) {
    if (close > peak) peak = close;
    if (peak <= 0) continue;
    const drawdown = (close / peak - 1) * 100;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }
  return maxDrawdown;
}

export function annualizedVolatilityPct(points: TwPriceHistoryPoint[]) {
  const rows = normalize(points);
  if (rows.length < 21) return null;
  const returns = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]![1];
    const current = rows[index]![1];
    if (previous <= 0 || current <= 0) continue;
    returns.push(Math.log(current / previous));
  }
  if (returns.length < 20) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}


export function relativePerformancePct(securityReturnPct: number | null, benchmarkReturnPct: number | null) {
  if (
    securityReturnPct === null ||
    benchmarkReturnPct === null ||
    !Number.isFinite(securityReturnPct) ||
    !Number.isFinite(benchmarkReturnPct) ||
    benchmarkReturnPct <= -100
  ) {
    return null;
  }

  return ((1 + securityReturnPct / 100) / (1 + benchmarkReturnPct / 100) - 1) * 100;
}

export function priceHistoryMetrics(points: TwPriceHistoryPoint[]) {
  const rows = normalize(points);
  const latest = rows.at(-1) ?? null;
  const first = rows[0] ?? null;
  return {
    points: rows,
    firstDate: first?.[0] ?? null,
    latestDate: latest?.[0] ?? null,
    oneMonth: trailingPriceReturn(rows, 1),
    threeMonth: trailingPriceReturn(rows, 3),
    sixMonth: trailingPriceReturn(rows, 6),
    oneYear: trailingPriceReturn(rows, 12),
    maxDrawdownPct: maxDrawdownPct(rows),
    annualizedVolatilityPct: annualizedVolatilityPct(rows)
  };
}
