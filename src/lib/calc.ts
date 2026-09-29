import type { AppState, Holding, NetWorthSnapshot } from "./types";

export type SnapshotRange = "1M" | "3M" | "YTD" | "1Y" | "ALL";

export function holdingValueTwd(holding: Holding, usdTwd: number) {
  const fx = holding.currency === "USD" ? usdTwd : 1;
  return holding.quantity * holding.price * fx;
}

export function holdingCostTwd(holding: Holding, usdTwd: number) {
  const fx = holding.currency === "USD" ? usdTwd : 1;
  return holding.quantity * holding.averageCost * fx;
}

export function portfolioSummary(holdings: Holding[], usdTwd: number) {
  const total = holdings.reduce((sum, h) => sum + holdingValueTwd(h, usdTwd), 0);
  const cost = holdings.reduce((sum, h) => sum + holdingCostTwd(h, usdTwd), 0);
  const gain = total - cost;
  const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

  return { total, cost, gain, gainPct };
}

export function allocationBySector(holdings: Holding[], usdTwd: number) {
  const total = holdings.reduce((sum, h) => sum + holdingValueTwd(h, usdTwd), 0);
  const map = new Map<string, number>();

  for (const holding of holdings) {
    map.set(holding.sector, (map.get(holding.sector) ?? 0) + holdingValueTwd(holding, usdTwd));
  }

  return [...map.entries()]
    .map(([name, value]) => ({ name, value, pct: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

function normalizedAccount(holding: Holding) {
  return holding.account?.trim() || "預設帳戶";
}

export function allocationByAccount(holdings: Holding[], usdTwd: number) {
  const total = holdings.reduce((sum, holding) => sum + holdingValueTwd(holding, usdTwd), 0);
  const map = new Map<string, number>();

  for (const holding of holdings) {
    const account = normalizedAccount(holding);
    map.set(account, (map.get(account) ?? 0) + holdingValueTwd(holding, usdTwd));
  }

  return [...map.entries()]
    .map(([name, value]) => ({ name, value, pct: total ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function portfolioCashSummary(holdings: Holding[], usdTwd: number) {
  const total = holdings.reduce((sum, holding) => sum + holdingValueTwd(holding, usdTwd), 0);
  const cash = holdings
    .filter((holding) => holding.type === "cash")
    .reduce((sum, holding) => sum + holdingValueTwd(holding, usdTwd), 0);
  const invested = Math.max(0, total - cash);
  return {
    total,
    cash,
    invested,
    cashPct: total > 0 ? (cash / total) * 100 : 0,
    investedPct: total > 0 ? (invested / total) * 100 : 0
  };
}

export function topHoldings(holdings: Holding[], usdTwd: number, limit = 5) {
  const total = holdings.reduce((sum, holding) => sum + holdingValueTwd(holding, usdTwd), 0);
  return holdings
    .filter((holding) => holding.type !== "cash")
    .map((holding) => {
      const value = holdingValueTwd(holding, usdTwd);
      return {
        holding,
        value,
        pct: total > 0 ? (value / total) * 100 : 0
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export function latestOfficialPriceDate(holdings: Holding[]) {
  return holdings
    .filter((holding) => holding.market === "TW" && holding.priceSource && holding.priceSource !== "manual" && holding.priceAsOf)
    .map((holding) => holding.priceAsOf!)
    .sort()
    .at(-1) ?? null;
}

function utcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
}

function addUtcMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

export function snapshotsForRange(snapshots: NetWorthSnapshot[], range: SnapshotRange) {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  if (!latest || range === "ALL") return sorted;

  const latestDate = utcDate(latest.date);
  let start: Date;
  if (range === "1M") start = addUtcMonths(latestDate, -1);
  else if (range === "3M") start = addUtcMonths(latestDate, -3);
  else if (range === "1Y") start = addUtcMonths(latestDate, -12);
  else start = new Date(Date.UTC(latestDate.getUTCFullYear(), 0, 1));

  return sorted.filter((snapshot) => utcDate(snapshot.date) >= start);
}

export function snapshotPeriodDelta(snapshots: NetWorthSnapshot[]) {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  const first = sorted[0]!;
  const last = sorted.at(-1)!;
  const amount = last.total - first.total;
  const pct = first.total > 0 ? (amount / first.total) * 100 : 0;
  return { amount, pct, firstDate: first.date, lastDate: last.date };
}

export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function makeSnapshot(state: AppState, date = new Date()): NetWorthSnapshot {
  const summary = portfolioSummary(state.holdings, state.usdTwd);
  return {
    date: localDateKey(date),
    total: summary.total,
    cost: summary.cost,
    gain: summary.gain,
    usdTwd: state.usdTwd
  };
}

export function withTodaySnapshot(state: AppState, date = new Date()): AppState {
  const next = makeSnapshot(state, date);
  const snapshots = state.snapshots.filter((item) => item.date !== next.date);
  return {
    ...state,
    snapshots: [...snapshots, next].sort((a, b) => a.date.localeCompare(b.date)).slice(-1825)
  };
}

export function dailySnapshotDelta(snapshots: NetWorthSnapshot[]) {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  const current = sorted.at(-1)!;
  const previous = sorted.at(-2)!;
  const amount = current.total - previous.total;
  const pct = previous.total > 0 ? (amount / previous.total) * 100 : 0;
  return { amount, pct, previousDate: previous.date };
}

export function passesGrowthScanner(item: {
  revenueYoY: [number, number, number];
  grossMargin: [number, number, number];
  foreign10d: number;
  trust10d: number;
}) {
  const revenuePass = item.revenueYoY.every((v) => v > 20);
  const marginPass = item.grossMargin[0] < item.grossMargin[1] && item.grossMargin[1] < item.grossMargin[2];
  const foreignPass = item.foreign10d > 0;
  const trustPass = item.trust10d > 0;
  return {
    revenuePass,
    marginPass,
    foreignPass,
    trustPass,
    pass: revenuePass && marginPass && foreignPass && trustPass
  };
}
