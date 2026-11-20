/**
 * Read-only long-position trade research. Every price is a user assumption
 * except the explicitly labeled reference close. No orders or portfolio writes.
 */
export type FeeAssumptions = { feePct: number; minimumFeeTwd: number; sellTaxPct: number };
export type PlanInputs = { entry: number; invalidation: number; target: number; budgetTwd: number; maxLossTwd: number; fees?: FeeAssumptions };
export type PlanOutcome = {
  shares: number;
  grossRiskTwd: number;
  grossRewardTwd: number;
  grossRewardRisk: number;
  investedTwd: number;
  estimatedEntryFeeTwd: number | null;
  netRiskTwd: number | null;
  netRewardTwd: number | null;
  netRewardRisk: number | null;
  reason: string;
};

function validPositive(value: number) { return Number.isFinite(value) && value > 0; }
export function simulateLongTradePlan(input: PlanInputs): PlanOutcome {
  const { entry, invalidation, target, budgetTwd, maxLossTwd, fees } = input;
  if (![entry,invalidation,target,budgetTwd,maxLossTwd].every(validPositive)) throw new Error("價格、預算與單筆風險額度都必須大於零。");
  if (!(invalidation < entry && entry < target)) throw new Error("做多計畫需要：失效價 < 進場價 < 目標價。");
  if (fees && (![fees.feePct,fees.minimumFeeTwd,fees.sellTaxPct].every(Number.isFinite) ||
    fees.feePct < 0 || fees.minimumFeeTwd < 0 || fees.sellTaxPct < 0 || fees.feePct > 10 || fees.sellTaxPct > 10)) {
    throw new Error("請核對自行輸入的手續費、最低費用與賣出稅率。");
  }
  const fee = (gross: number) => fees ? Math.max(fees.minimumFeeTwd, gross * fees.feePct / 100) : 0;
  const transaction = (shares: number) => {
    const entryGross = shares * entry;
    const entryFee = fee(entryGross);
    const stopGross = shares * invalidation;
    const targetGross = shares * target;
    const stopCost = fee(stopGross) + (fees ? stopGross * fees.sellTaxPct / 100 : 0);
    const targetCost = fee(targetGross) + (fees ? targetGross * fees.sellTaxPct / 100 : 0);
    return {
      entryFee,
      entryCost: entryGross + entryFee,
      netRisk: shares * (entry - invalidation) + entryFee + stopCost,
      netReward: shares * (target - entry) - entryFee - targetCost
    };
  };
  // Fee-aware, bounded, integer-share binary search. Missing fee assumptions
  // are deliberately represented as unknown, NOT as verified fee-free trading.
  let left = 0;
  let right = Math.min(1_000_000_000, Math.floor(budgetTwd / entry));
  while (left < right) {
    const mid = Math.floor((left + right + 1) / 2);
    const r = transaction(mid);
    if (r.entryCost <= budgetTwd + 1e-7 && r.netRisk <= maxLossTwd + 1e-7) left = mid;
    else right = mid - 1;
  }
  const shares = left;
  const r = transaction(shares);
  const grossRiskTwd = shares * (entry - invalidation);
  const grossRewardTwd = shares * (target - entry);
  return {
    shares,
    grossRiskTwd,
    grossRewardTwd,
    grossRewardRisk: (target - entry) / (entry - invalidation),
    investedTwd: shares * entry,
    estimatedEntryFeeTwd: fees ? r.entryFee : null,
    netRiskTwd: fees ? r.netRisk : null,
    netRewardTwd: fees ? r.netReward : null,
    netRewardRisk: fees && r.netRisk > 0 ? r.netReward / r.netRisk : null,
    reason: shares < 1
      ? "在目前預算／風險限制下可買股數為 0；不強迫進場。"
      : fees
        ? "以自行輸入的費率、最低費用與賣出稅率計算；未包含滑價、匯差與成交保證。"
        : "僅計算毛額，尚未填入券商實際費稅，實際可買股數及損益可能更低。"
  };
}
