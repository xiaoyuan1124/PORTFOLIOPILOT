import { allocationTargetKey, buildCurrentAllocationBuckets } from "./allocation-targets";
import { holdingValueTwd } from "./calc";
import type { AllocationTarget, Holding } from "./types";

export type ContributionPlanRow = {
  key: string;
  label: string;
  targetPct: number;
  currentValueTwd: number;
  targetValueTwd: number;
  missingValueTwd: number;
  estimatedUnitPriceTwd: number | null;
  buyUnits: number;
  plannedTwd: number;
  status: "buy" | "cash_reserve" | "no_gap" | "no_price" | "fx_required" | "below_unit" | "out_of_budget";
};

export type ContributionOnlyPlan = {
  contributionTwd: number;
  currentTotalTwd: number;
  futureTotalTwd: number;
  plannedInvestmentTwd: number;
  reservedCashTwd: number;
  unallocatedTwd: number;
  rows: ContributionPlanRow[];
};

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * An educational, read-only plan for deploying *new* TWD funds toward saved
 * allocation targets. No sales, taxes, fees, trades, data uploads, or mutable
 * changes to the portfolio. The price used is a locally stored holding price;
 * a target with no reliable observed price cannot receive fictional units.
 *
 * Uses whole-share minimums for both TW/US as a conservative offline default.
 * Actual brokerage lots, FX execution, fees and tax must be confirmed outside.
 */
export function simulateContributionOnlyPlan(
  targets: AllocationTarget[],
  holdings: Holding[],
  usdTwd: number,
  contributionTwd: number
): ContributionOnlyPlan {
  if (!Number.isFinite(contributionTwd) || contributionTwd <= 0 || contributionTwd > 1_000_000_000_000) {
    throw new Error("投入預算需為正數且不得超過一兆台幣。");
  }
  if (!Number.isFinite(usdTwd) || usdTwd <= 0) {
    throw new Error("缺少有效的美元換匯參考匯率，無法進行配置試算。");
  }
  const targetSum = targets.reduce((sum, target) => sum + target.targetPct, 0);
  if (!targets.length || targets.some((target) => !Number.isFinite(target.targetPct) || target.targetPct < 0)
    || !Number.isFinite(targetSum) || Math.abs(targetSum - 100) > 0.05) {
    throw new Error("請先設定總和為 100% 的有效配置目標。");
  }

  const buckets = buildCurrentAllocationBuckets(holdings, usdTwd);
  const currentTotalTwd = buckets.reduce((sum, row) => sum + row.valueTwd, 0);
  if (!Number.isFinite(currentTotalTwd) || currentTotalTwd < 0) {
    throw new Error("目前持有資產的估值異常，無法安全試算。");
  }
  const futureTotalTwd = currentTotalTwd + contributionTwd;
  const byKey = new Map(buckets.map((row) => [row.key.toUpperCase(), row]));
  const prices = new Map<string, { twd: number; asOf: string }>();
  for (const holding of holdings) {
    if (holding.type === "cash" || holding.quantity <= 0 || holding.price <= 0 || !Number.isFinite(holding.price)) continue;
    const key = allocationTargetKey(holding).toUpperCase();
    const twd = holding.price * (holding.currency === "USD" ? usdTwd : 1);
    if (!Number.isFinite(twd) || twd <= 0) continue;
    const asOf = holding.priceAsOf ?? "";
    const prior = prices.get(key);
    if (!prior || asOf >= prior.asOf) prices.set(key, { twd, asOf });
  }

  const rows: ContributionPlanRow[] = targets.filter((target) => target.targetPct > 0).map((target) => {
    const key = target.key.toUpperCase();
    const currentValueTwd = byKey.get(key)?.valueTwd ?? 0;
    const targetValueTwd = futureTotalTwd * (target.targetPct / 100);
    return {
      key: target.key,
      label: target.label,
      targetPct: target.targetPct,
      currentValueTwd,
      targetValueTwd,
      missingValueTwd: Math.max(0, targetValueTwd - currentValueTwd),
      estimatedUnitPriceTwd: key.startsWith("CASH:") ? null : (prices.get(key)?.twd ?? null),
      buyUnits: 0,
      plannedTwd: 0,
      status: "no_gap"
    };
  });

  let budget = cents(contributionTwd);
  const cashTarget = rows.find((row) => row.key.toUpperCase() === "CASH:TWD");
  let reservedCashTwd = 0;
  if (cashTarget && cashTarget.missingValueTwd > 0) {
    reservedCashTwd = cents(Math.min(budget, cashTarget.missingValueTwd));
    cashTarget.status = reservedCashTwd > 0 ? "cash_reserve" : "out_of_budget";
    cashTarget.plannedTwd = reservedCashTwd;
    budget = cents(budget - reservedCashTwd);
  }

  const securities = rows
    .filter((row) => !row.key.toUpperCase().startsWith("CASH:") && row.missingValueTwd > 0)
    .sort((a, b) => b.missingValueTwd - a.missingValueTwd || a.key.localeCompare(b.key));
  for (const row of securities) {
    const unitPrice = row.estimatedUnitPriceTwd;
    if (unitPrice === null) {
      row.status = "no_price";
      continue;
    }
    const permitted = Math.min(row.missingValueTwd, budget);
    const units = Math.floor(permitted / unitPrice + 1e-10);
    if (units < 1) {
      row.status = budget >= unitPrice ? "below_unit" : "out_of_budget";
      continue;
    }
    const spent = cents(units * unitPrice);
    if (spent > budget + 0.0001) {
      row.status = "below_unit";
      continue;
    }
    row.buyUnits = units;
    row.plannedTwd = spent;
    row.status = "buy";
    budget = cents(Math.max(0, budget - spent));
  }

  for (const row of rows) {
    if (row.key.toUpperCase() === "CASH:USD" && row.missingValueTwd > 0) {
      row.status = "fx_required";
    } else if (row.key.toUpperCase() === "CASH:TWD" && row.missingValueTwd > 0 && row.plannedTwd === 0) {
      row.status = "out_of_budget";
    }
  }

  return {
    contributionTwd,
    currentTotalTwd,
    futureTotalTwd,
    plannedInvestmentTwd: cents(rows.filter((row) => row.status === "buy").reduce((sum, row) => sum + row.plannedTwd, 0)),
    reservedCashTwd,
    unallocatedTwd: cents(Math.max(0, budget)),
    rows: rows.sort((a, b) => b.plannedTwd - a.plannedTwd || b.missingValueTwd - a.missingValueTwd)
  };
}
