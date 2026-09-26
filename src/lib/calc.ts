import type { Holding } from "./types";

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
