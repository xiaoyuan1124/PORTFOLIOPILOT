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

export function netExternalContributions(activities: PortfolioActivity[], throughDate?: string) {
  return activities.reduce((sum, activity) => {
    if (throughDate && activity.date > throughDate) return sum;
    const amount = activityAmountTwd(activity);
    if (activity.type === "deposit") return sum + amount;
    if (activity.type === "withdrawal") return sum - amount;
    return sum;
  }, 0);
}

export type LedgerEconomicsSummary = {
  dividendsTwd: number;
  standaloneFeesTwd: number;
  tradeFeesTwd: number;
  tradeTaxesTwd: number;
  fxConversionValuationDeltaTwd: number;
  incomeAfterStandaloneFeesTwd: number;
};

export function ledgerEconomicsSummary(
  activities: PortfolioActivity[],
  throughDate?: string
): LedgerEconomicsSummary {
  return activities.reduce<LedgerEconomicsSummary>((summary, activity) => {
    if (throughDate && activity.date > throughDate) return summary;
    const fx = activity.currency === "USD" ? activity.fxRate : 1;

    if (activity.type === "dividend") {
      summary.dividendsTwd += activity.amount * fx;
    }
    if (activity.type === "fee") {
      summary.standaloneFeesTwd += activity.amount * fx;
    }
    if (activity.inventoryImpact?.kind === "trade") {
      summary.tradeFeesTwd += activity.inventoryImpact.fee * fx;
      summary.tradeTaxesTwd += activity.inventoryImpact.tax * fx;
    } else if (activity.historicalTrade?.mode === "ledger_only") {
      summary.tradeFeesTwd += activity.historicalTrade.fee * fx;
      summary.tradeTaxesTwd += activity.historicalTrade.tax * fx;
    }
    if (activity.cashFxImpact) {
      const impact = activity.cashFxImpact;
      const valuationRate = impact.valuationTwdPerUsd;
      const sourceValueTwd = impact.fromBefore.currency === "USD"
        ? impact.fromAmount * valuationRate
        : impact.fromAmount;
      const destinationValueTwd = impact.toBefore.currency === "USD"
        ? impact.toAmount * valuationRate
        : impact.toAmount;
      summary.fxConversionValuationDeltaTwd += destinationValueTwd - sourceValueTwd;
    }

    summary.incomeAfterStandaloneFeesTwd =
      summary.dividendsTwd - summary.standaloneFeesTwd;
    return summary;
  }, {
    dividendsTwd: 0,
    standaloneFeesTwd: 0,
    tradeFeesTwd: 0,
    tradeTaxesTwd: 0,
    fxConversionValuationDeltaTwd: 0,
    incomeAfterStandaloneFeesTwd: 0
  });
}

export function incomeAfterFees(activities: PortfolioActivity[], throughDate?: string) {
  return ledgerEconomicsSummary(activities, throughDate).incomeAfterStandaloneFeesTwd;
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

  let left: number = low;
  let right: number = high;
  let leftValue = xnpv(left, ordered);

  for (let i = 0; i < 180; i += 1) {
    const mid: number = (left + right) / 2;
    const midValue = xnpv(mid, ordered);
    if (Math.abs(midValue) < 1e-9) return mid;

    if (leftValue * midValue <= 0) {
      right = mid;
    } else {
      left = mid;
      leftValue = midValue;
    }
  }

  return (left + right) / 2;
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

export function modifiedDietzReturn(state: AppState, throughDate?: string) {
  const snapshots = [...state.snapshots]
    .filter((snapshot) => !throughDate || snapshot.date <= throughDate)
    .sort((a, b) => a.date.localeCompare(b.date));
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


export type ExactTwrResult = {
  status: "exact" | "insufficient";
  value: number | null;
  startDate: string | null;
  endDate: string;
  periods: number;
  externalFlowCount: number;
  boundedFlowCount: number;
  missingBoundaryIds: string[];
  ambiguousDates: string[];
  coverageStartsAfterFirstFlow: boolean;
  reason: string;
};

function isExternalFlow(activity: PortfolioActivity) {
  return activity.type === "deposit" || activity.type === "withdrawal";
}

function signedExternalFlowTwd(activity: PortfolioActivity) {
  const amount = activityAmountTwd(activity);
  return activity.type === "deposit" ? amount : -amount;
}

function exactInsufficient(
  valuationDate: string,
  externalFlowCount: number,
  boundedFlowCount: number,
  reason: string,
  missingBoundaryIds: string[] = [],
  ambiguousDates: string[] = []
): ExactTwrResult {
  return {
    status: "insufficient",
    value: null,
    startDate: null,
    endDate: valuationDate,
    periods: 0,
    externalFlowCount,
    boundedFlowCount,
    missingBoundaryIds,
    ambiguousDates,
    coverageStartsAfterFirstFlow: false,
    reason
  };
}

export function exactTimeWeightedReturn(state: AppState, valuationDate: string): ExactTwrResult {
  const currentValue = portfolioSummary(state.holdings, state.usdTwd).total;
  const external = state.activities
    .map((activity, index) => ({ activity, index }))
    .filter(({ activity }) => isExternalFlow(activity) && activity.date <= valuationDate);

  const externalFlowCount = external.length;
  const boundedFlowCount = external.filter(({ activity }) => activity.preFlowValueTwd !== undefined).length;

  const byDate = new Map<string, Array<{ activity: PortfolioActivity; index: number }>>();
  for (const item of external) {
    const group = byDate.get(item.activity.date) ?? [];
    group.push(item);
    byDate.set(item.activity.date, group);
  }

  const ambiguousDates = [...byDate.entries()].flatMap(([date, items]) => {
    if (items.length <= 1) return [];
    const times = items.map(({ activity }) => activity.time).filter((time): time is string => Boolean(time));
    if (times.length !== items.length || new Set(times).size !== times.length) return [date];
    return [];
  });

  if (ambiguousDates.length) {
    return exactInsufficient(
      valuationDate,
      externalFlowCount,
      boundedFlowCount,
      "同一天有多筆入金／出金時，每一筆都需要不同的發生時間，才能建立可排序的 TWR 邊界。",
      [],
      ambiguousDates
    );
  }

  const ordered = [...external].sort((a, b) => {
    const dateCompare = a.activity.date.localeCompare(b.activity.date);
    if (dateCompare !== 0) return dateCompare;
    const timeCompare = (a.activity.time ?? "").localeCompare(b.activity.time ?? "");
    if (timeCompare !== 0) return timeCompare;
    return a.index - b.index;
  });

  const missingBoundaryIds = ordered
    .filter(({ activity }) => activity.preFlowValueTwd === undefined)
    .map(({ activity }) => activity.id);

  if (missingBoundaryIds.length) {
    return exactInsufficient(
      valuationDate,
      externalFlowCount,
      boundedFlowCount,
      `仍有 ${missingBoundaryIds.length} 筆外部現金流缺少「現金流前淨值」。`,
      missingBoundaryIds
    );
  }

  if (ordered.length === 0) {
    const start = [...state.snapshots]
      .filter((snapshot) => snapshot.date < valuationDate && snapshot.total > 0)
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    if (!start) {
      return exactInsufficient(
        valuationDate,
        0,
        0,
        "沒有外部現金流時，至少需要一筆早於目前估值日的正值淨值快照，才能計算區間 TWR。"
      );
    }

    const value = currentValue / start.total - 1;
    if (!Number.isFinite(value) || value < -1) {
      return exactInsufficient(valuationDate, 0, 0, "起始或目前淨值無法形成有效的 TWR 區間。");
    }

    return {
      status: "exact",
      value,
      startDate: start.date,
      endDate: valuationDate,
      periods: 1,
      externalFlowCount: 0,
      boundedFlowCount: 0,
      missingBoundaryIds: [],
      ambiguousDates: [],
      coverageStartsAfterFirstFlow: false,
      reason: "區間內沒有外部現金流，因此以起始快照與目前淨值直接計算時間加權報酬。"
    };
  }

  let growth = 1;
  let periods = 0;
  const first = ordered[0]!.activity;
  const firstPreFlow = first.preFlowValueTwd!;
  const priorSnapshot = [...state.snapshots]
    .filter((snapshot) => snapshot.date < first.date && snapshot.total > 0)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  let startDate = first.date;
  let coverageStartsAfterFirstFlow = true;

  if (priorSnapshot) {
    const firstPeriodReturn = firstPreFlow / priorSnapshot.total - 1;
    if (!Number.isFinite(firstPeriodReturn) || firstPeriodReturn < -1) {
      return exactInsufficient(
        valuationDate,
        externalFlowCount,
        boundedFlowCount,
        "第一個現金流前淨值與起始快照無法形成有效子期間。"
      );
    }
    growth *= 1 + firstPeriodReturn;
    periods += 1;
    startDate = priorSnapshot.date;
    coverageStartsAfterFirstFlow = false;
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const activity = ordered[index]!.activity;
    const preFlow = activity.preFlowValueTwd!;
    const afterFlow = preFlow + signedExternalFlowTwd(activity);

    if (!Number.isFinite(afterFlow) || afterFlow < 0) {
      return exactInsufficient(
        valuationDate,
        externalFlowCount,
        boundedFlowCount,
        `${activity.date}${activity.time ? ` ${activity.time}` : ""} 的現金流會使邊界後淨值小於 0，請檢查金額或現金流前淨值。`
      );
    }

    const next = ordered[index + 1]?.activity;
    const endValue = next ? next.preFlowValueTwd! : currentValue;

    if (afterFlow === 0) {
      if (endValue === 0) {
        growth *= 1;
        periods += 1;
        continue;
      }
      return exactInsufficient(
        valuationDate,
        externalFlowCount,
        boundedFlowCount,
        `${activity.date} 的現金流後淨值為 0，但下一個邊界／目前淨值不是 0，無法定義該子期間報酬。`
      );
    }

    const periodReturn = endValue / afterFlow - 1;
    if (!Number.isFinite(periodReturn) || periodReturn < -1) {
      return exactInsufficient(
        valuationDate,
        externalFlowCount,
        boundedFlowCount,
        `${activity.date} 之後的子期間無法形成有效 TWR。`
      );
    }

    growth *= 1 + periodReturn;
    periods += 1;
  }

  return {
    status: "exact",
    value: growth - 1,
    startDate,
    endDate: valuationDate,
    periods,
    externalFlowCount,
    boundedFlowCount,
    missingBoundaryIds: [],
    ambiguousDates: [],
    coverageStartsAfterFirstFlow,
    reason: coverageStartsAfterFirstFlow
      ? "所有外部現金流都有邊界估值；因第一筆現金流之前沒有更早的正值快照，TWR 從第一筆現金流完成後開始。"
      : "所有外部現金流都有邊界估值，並從更早的淨值快照開始鏈結所有子期間。"
  };
}
