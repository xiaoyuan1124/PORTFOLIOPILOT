import type { AppState, PortfolioActivity } from "./types";
import { portfolioSummary } from "./calc";

const DAY_MS = 86_400_000;

function utcDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, (month ?? 1) - 1, day ?? 1);
}

function daysBetween(start: string, end: string) {
  return (utcDay(end) - utcDay(start)) / DAY_MS;
}

export function activityAmountTwd(activity: PortfolioActivity) {
  return activity.amount * (activity.currency === "USD" ? activity.fxRate : 1);
}

export function netExternalContributions(activities: PortfolioActivity[]) {
  return activities.reduce((sum, activity) => {
    const amount = activityAmountTwd(activity);
    if (activity.type === "deposit") return sum + amount;
    if (activity.type === "withdrawal") return sum - amount;
    return sum;
  }, 0);
}

export function incomeAfterFees(activities: PortfolioActivity[]) {
  return activities.reduce((sum, activity) => {
    const amount = activityAmountTwd(activity);
    if (activity.type === "dividend") return sum + amount;
    if (activity.type === "fee") return sum - amount;
    return sum;
  }, 0);
}

type DatedCashFlow = { date: string; value: number };

function xnpv(rate: number, flows: DatedCashFlow[]) {
  if (rate <= -1 || !Number.isFinite(rate)) return Number.POSITIVE_INFINITY;
  const first = flows[0]?.date;
  if (!first) return 0;

  return flows.reduce((sum, flow) => {
    const years = daysBetween(first, flow.date) / 365;
    return sum + flow.value / Math.pow(1 + rate, years);
  }, 0);
}

export function calculateXirr(flows: DatedCashFlow[]) {
  const ordered = [...flows]
    .filter((flow) => Number.isFinite(flow.value))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (ordered.length < 2) return null;
  if (!ordered.some((flow) => flow.value < 0) || !ordered.some((flow) => flow.value > 0)) return null;
  if (daysBetween(ordered[0]!.date, ordered.at(-1)!.date) <= 0) return null;

  const exactZero = xnpv(0, ordered);
  if (Math.abs(exactZero) < 1e-9) return 0;

  const candidates = [
    -0.9999, -0.99, -0.9, -0.75, -0.5, -0.25, -0.1, 0,
    0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000
  ];

  let low: number | null = null;
  let high: number | null = null;
  let previousRate = candidates[0]!;
  let previousValue = xnpv(previousRate, ordered);

  for (const rate of candidates.slice(1)) {
    const value = xnpv(rate, ordered);
    if (Number.isFinite(previousValue) && Number.isFinite(value) && previousValue * value <= 0) {
      low = previousRate;
      high = rate;
      break;
    }
    previousRate = rate;
    previousValue = value;
  }

  if (low === null || high === null) return null;

  let lowValue = xnpv(low, ordered);
  for (let i = 0; i < 180; i += 1) {
    const mid = (low + high) / 2;
    const midValue = xnpv(mid, ordered);
    if (Math.abs(midValue) < 1e-9) return mid;

    if (lowValue * midValue <= 0) {
      high = mid;
    } else {
      low = mid;
      lowValue = midValue;
    }
  }

  return (low + high) / 2;
}

export function portfolioXirr(state: AppState, valuationDate: string) {
  const currentValue = portfolioSummary(state.holdings, state.usdTwd).total;
  const flows: DatedCashFlow[] = state.activities
    .filter((activity) => activity.date <= valuationDate)
    .flatMap((activity) => {
      const amount = activityAmountTwd(activity);
      if (activity.type === "deposit") return [{ date: activity.date, value: -amount }];
      if (activity.type === "withdrawal") return [{ date: activity.date, value: amount }];
      return [];
    });

  if (currentValue > 0) flows.push({ date: valuationDate, value: currentValue });
  return calculateXirr(flows);
}

export function modifiedDietzReturn(state: AppState) {
  const snapshots = [...state.snapshots].sort((a, b) => a.date.localeCompare(b.date));
  if (snapshots.length < 2) return null;

  let growth = 1;
  let usablePeriods = 0;

  for (let i = 1; i < snapshots.length; i += 1) {
    const start = snapshots[i - 1]!;
    const end = snapshots[i]!;
    const totalDays = daysBetween(start.date, end.date);
    if (totalDays <= 0 || start.total <= 0) continue;

    const periodFlows = state.activities
      .filter((activity) =>
        (activity.type === "deposit" || activity.type === "withdrawal") &&
        activity.date > start.date &&
        activity.date <= end.date
      )
      .map((activity) => {
        const signed = activityAmountTwd(activity) * (activity.type === "deposit" ? 1 : -1);
        const elapsedDays = daysBetween(start.date, activity.date);
        const remaining = Math.max(0, totalDays - elapsedDays);
        const weight = Math.min(1, Math.max(0, (remaining + 0.5) / totalDays));
        return { signed, weight };
      });

    const netFlow = periodFlows.reduce((sum, flow) => sum + flow.signed, 0);
    const weightedFlow = periodFlows.reduce((sum, flow) => sum + flow.signed * flow.weight, 0);
    const denominator = start.total + weightedFlow;
    if (denominator <= 0) continue;

    const periodReturn = (end.total - start.total - netFlow) / denominator;
    if (!Number.isFinite(periodReturn) || periodReturn < -1) continue;

    growth *= 1 + periodReturn;
    usablePeriods += 1;
  }

  return usablePeriods ? growth - 1 : null;
}
