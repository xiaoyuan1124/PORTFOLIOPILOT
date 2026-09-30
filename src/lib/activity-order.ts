import type { PortfolioActivity } from "./types";

export function activityTouchesSecurityHolding(
  activity: PortfolioActivity,
  holdingId: string
) {
  return activity.inventoryImpact?.holdingId === holdingId ||
    activity.positionTransferImpact?.sourceHoldingId === holdingId ||
    activity.positionTransferImpact?.destinationHoldingId === holdingId;
}

export function hasLaterRecordedActivity(
  activities: PortfolioActivity[],
  target: PortfolioActivity,
  touches: (candidate: PortfolioActivity) => boolean
) {
  const targetIndex = activities.findIndex((activity) => activity.id === target.id);
  if (targetIndex < 0) {
    throw new Error("找不到要比較的原始活動順序。");
  }

  return activities.some((candidate, index) => {
    if (candidate.id === target.id || !touches(candidate)) return false;
    if (candidate.date > target.date) return true;
    if (candidate.date < target.date) return false;
    return index > targetIndex;
  });
}
