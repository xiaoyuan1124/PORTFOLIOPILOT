import type { AllocationTarget, Holding } from "./types";
import { holdingValueTwd } from "./calc";

export type AllocationBucket = {
  key: string;
  label: string;
  valueTwd: number;
  currentPct: number;
};

export type AllocationDriftRow = AllocationBucket & {
  targetPct: number;
  driftPct: number;
};

export function allocationTargetKey(holding: Pick<Holding, "market" | "symbol" | "type" | "currency">) {
  if (holding.type === "cash") return `CASH:${holding.currency}`;
  return `${holding.market}:${holding.symbol.trim().toUpperCase()}`;
}

function allocationLabel(holding: Holding) {
  if (holding.type === "cash") return `${holding.currency} 現金`;
  return `${holding.symbol.trim().toUpperCase()} · ${holding.name}`;
}

export function buildCurrentAllocationBuckets(holdings: Holding[], usdTwd: number): AllocationBucket[] {
  const total = holdings.reduce((sum, holding) => sum + holdingValueTwd(holding, usdTwd), 0);
  const map = new Map<string, { key: string; label: string; valueTwd: number }>();

  for (const holding of holdings) {
    const key = allocationTargetKey(holding);
    const valueTwd = holdingValueTwd(holding, usdTwd);
    const previous = map.get(key);
    map.set(key, {
      key,
      label: previous?.label ?? allocationLabel(holding),
      valueTwd: (previous?.valueTwd ?? 0) + valueTwd
    });
  }

  return [...map.values()]
    .map((row) => ({
      ...row,
      currentPct: total > 0 ? (row.valueTwd / total) * 100 : 0
    }))
    .sort((a, b) => b.valueTwd - a.valueTwd || a.key.localeCompare(b.key));
}

export function targetsFromCurrentAllocation(holdings: Holding[], usdTwd: number): AllocationTarget[] {
  const buckets = buildCurrentAllocationBuckets(holdings, usdTwd);
  if (!buckets.length) return [];

  const targets = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    targetPct: bucket.currentPct
  }));

  const subtotal = targets.slice(0, -1).reduce((sum, target) => sum + target.targetPct, 0);
  const last = targets.at(-1);
  if (last) last.targetPct = Math.max(0.000001, 100 - subtotal);
  return targets;
}

export function buildAllocationDrift(
  targets: AllocationTarget[],
  holdings: Holding[],
  usdTwd: number
): AllocationDriftRow[] {
  const current = buildCurrentAllocationBuckets(holdings, usdTwd);
  const currentByKey = new Map(current.map((bucket) => [bucket.key.toLowerCase(), bucket]));
  const targetByKey = new Map(targets.map((target) => [target.key.toLowerCase(), target]));
  const keys = new Set([...currentByKey.keys(), ...targetByKey.keys()]);

  return [...keys].map((key) => {
    const bucket = currentByKey.get(key);
    const target = targetByKey.get(key);
    const currentPct = bucket?.currentPct ?? 0;
    const targetPct = target?.targetPct ?? 0;

    return {
      key: bucket?.key ?? target?.key ?? key,
      label: bucket?.label ?? target?.label ?? key,
      valueTwd: bucket?.valueTwd ?? 0,
      currentPct,
      targetPct,
      driftPct: currentPct - targetPct
    };
  }).sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct) || b.valueTwd - a.valueTwd);
}
