import type { AppState, Holding, PortfolioActivity } from "./types";
import { accountName } from "./local-data";
import { activityTouchesSecurityHolding, hasLaterRecordedActivity } from "./activity-order";

export type ShareAdjustmentInput = {
  id: string;
  date: string;
  holdingId: string;
  ratio: number;
  note: string;
};

function snapshotsEqual(a: Holding | null | undefined, b: Holding | null | undefined) {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function applyShareAdjustment(state: AppState, input: ShareAdjustmentInput): AppState {
  const holding = state.holdings.find((item) => item.id === input.holdingId);
  if (!holding || holding.type === "cash") {
    throw new Error("找不到可套用股數調整的投資部位。");
  }
  if (!Number.isFinite(input.ratio) || input.ratio <= 0) {
    throw new Error("股數調整比例必須大於 0。");
  }
  if (Math.abs(input.ratio - 1) <= 1e-12) {
    throw new Error("股數調整比例不可為 1，因為這不會改變股數或成本。");
  }

  const before = { ...holding };
  const after: Holding = {
    ...holding,
    quantity: holding.quantity * input.ratio,
    averageCost: holding.averageCost / input.ratio
  };

  if (!Number.isFinite(after.quantity) || after.quantity <= 0 ||
      !Number.isFinite(after.averageCost) || after.averageCost <= 0) {
    throw new Error("股數調整後的數量或平均成本無效。");
  }

  const activity: PortfolioActivity = {
    id: input.id,
    date: input.date,
    type: "corporate_action",
    symbol: holding.symbol.trim().toUpperCase(),
    amount: 0,
    currency: holding.currency,
    fxRate: holding.currency === "USD" ? state.usdTwd : 1,
    quantity: 0,
    price: 0,
    note: input.note.trim(),
    account: accountName(holding.account),
    inventoryImpact: {
      kind: "corporate_action",
      holdingId: holding.id,
      before,
      after,
      action: "share_adjustment",
      ratio: input.ratio
    }
  };

  return {
    ...state,
    holdings: state.holdings.map((item) => item.id === holding.id ? after : item),
    activities: [...state.activities, activity]
  };
}

export function revertCorporateAction(state: AppState, activityId: string): AppState {
  const activity = state.activities.find((item) => item.id === activityId);
  const impact = activity?.inventoryImpact;
  if (!activity || !impact || impact.kind !== "corporate_action") {
    throw new Error("這筆紀錄不是可回滾的股數調整。");
  }

  const laterLinked = hasLaterRecordedActivity(
    state.activities,
    activity,
    (item) => activityTouchesSecurityHolding(item, impact.holdingId)
  );
  if (laterLinked) {
    throw new Error("此部位後面已有其他持股連動事件，請先從最新一筆開始回滾。");
  }

  const current = state.holdings.find((item) => item.id === impact.holdingId) ?? null;
  if (!snapshotsEqual(current, impact.after)) {
    throw new Error("目前持股已被後續交易、手動修改或校正，無法安全回滾這筆股數調整。");
  }

  return {
    ...state,
    holdings: state.holdings.map((item) => item.id === impact.holdingId ? impact.before : item),
    activities: state.activities.filter((item) => item.id !== activity.id)
  };
}
