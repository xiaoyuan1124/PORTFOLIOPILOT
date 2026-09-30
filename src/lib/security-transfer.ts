import type { AppState, Holding, PortfolioActivity } from "./types";
import { localDateKey } from "./calc";
import { accountName, holdingIdentityKey } from "./local-data";
import {
  activityTouchesSecurityHolding,
  hasLaterRecordedActivity
} from "./activity-order";
import {
  holdingSnapshotEqual,
  replaceHoldingSnapshot
} from "./cash-account";

export type SecurityAccountTransferInput = {
  id: string;
  date: string;
  sourceHoldingId: string;
  destinationAccount: string;
  quantity: number;
  note: string;
};

function samePriceProvenance(a: Holding, b: Holding) {
  return Math.abs(a.price - b.price) <= 1e-8 &&
    a.priceSource === b.priceSource &&
    a.priceAsOf === b.priceAsOf;
}

function assertTransferQuantity(quantity: number, available: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("移轉股數必須大於 0。");
  }
  if (quantity > available + 1e-9) {
    throw new Error(`移轉股數 ${quantity} 超過目前持有 ${available}。`);
  }
}

function destinationIdentity(source: Holding, destinationAccount: string) {
  return holdingIdentityKey({
    market: source.market,
    symbol: source.symbol,
    account: destinationAccount
  });
}

export function applySecurityAccountTransfer(
  state: AppState,
  input: SecurityAccountTransferInput
): AppState {
  if (input.date !== localDateKey()) {
    throw new Error("證券帳戶移轉只允許從今天的目前庫存往前套用，避免歷史事件重播到現有持股。");
  }

  const source = state.holdings.find((item) => item.id === input.sourceHoldingId);
  if (!source || source.type === "cash") {
    throw new Error("找不到可移轉的股票／ETF 持股。");
  }

  assertTransferQuantity(input.quantity, source.quantity);
  const targetAccount = accountName(input.destinationAccount);
  const sourceAccount = accountName(source.account);
  if (targetAccount.toLowerCase() === sourceAccount.toLowerCase()) {
    throw new Error("目的帳戶不可與目前持股帳戶相同。");
  }

  const targetKey = destinationIdentity(source, targetAccount);
  const destinationBefore = state.holdings.find((item) =>
    item.type !== "cash" && holdingIdentityKey(item) === targetKey
  ) ?? null;

  if (destinationBefore) {
    if (
      destinationBefore.market !== source.market ||
      destinationBefore.symbol.trim().toUpperCase() !== source.symbol.trim().toUpperCase() ||
      destinationBefore.type !== source.type ||
      destinationBefore.currency !== source.currency
    ) {
      throw new Error("目的帳戶既有部位與來源持股身份不一致，無法安全合併。");
    }
    if (!samePriceProvenance(source, destinationBefore)) {
      throw new Error("來源與目的帳戶的目前價格或價格來源／資料日不一致；請先把兩邊價格校正到同一基準，再進行持股移轉。");
    }
  }

  const remaining = source.quantity - input.quantity;
  const sourceAfter = remaining > 1e-9
    ? { ...source, quantity: remaining }
    : null;

  let destinationAfter: Holding;
  if (destinationBefore) {
    const newQuantity = destinationBefore.quantity + input.quantity;
    const totalBasis =
      destinationBefore.quantity * destinationBefore.averageCost +
      input.quantity * source.averageCost;

    destinationAfter = {
      ...destinationBefore,
      quantity: newQuantity,
      averageCost: totalBasis / newQuantity
    };
  } else {
    const destinationHoldingId = `holding-${input.id}-destination`;
    if (state.holdings.some((item) => item.id === destinationHoldingId)) {
      throw new Error("目的持股 ID 已存在，請重新建立移轉事件。");
    }
    destinationAfter = {
      ...source,
      id: destinationHoldingId,
      account: targetAccount,
      quantity: input.quantity,
      averageCost: source.averageCost
    };
  }

  const beforeBasis =
    source.quantity * source.averageCost +
    (destinationBefore ? destinationBefore.quantity * destinationBefore.averageCost : 0);
  const afterBasis =
    (sourceAfter ? sourceAfter.quantity * sourceAfter.averageCost : 0) +
    destinationAfter.quantity * destinationAfter.averageCost;

  if (Math.abs(beforeBasis - afterBasis) > 1e-7 * Math.max(1, Math.abs(beforeBasis))) {
    throw new Error("持股移轉前後總成本基礎不一致，已拒絕寫入。");
  }

  const beforeValue =
    source.quantity * source.price +
    (destinationBefore ? destinationBefore.quantity * destinationBefore.price : 0);
  const afterValue =
    (sourceAfter ? sourceAfter.quantity * sourceAfter.price : 0) +
    destinationAfter.quantity * destinationAfter.price;

  if (Math.abs(beforeValue - afterValue) > 1e-7 * Math.max(1, Math.abs(beforeValue))) {
    throw new Error("持股移轉前後總市值不一致，已拒絕寫入。");
  }

  const activity: PortfolioActivity = {
    id: input.id,
    date: input.date,
    type: "position_transfer",
    symbol: source.symbol.trim().toUpperCase(),
    amount: 0,
    currency: source.currency,
    fxRate: source.currency === "USD" ? state.usdTwd : 1,
    quantity: input.quantity,
    price: 0,
    note: input.note.trim(),
    account: sourceAccount,
    positionTransferImpact: {
      sourceHoldingId: source.id,
      destinationHoldingId: destinationAfter.id,
      sourceBefore: { ...source },
      sourceAfter,
      destinationBefore: destinationBefore ? { ...destinationBefore } : null,
      destinationAfter,
      quantity: input.quantity
    }
  };

  let holdings = replaceHoldingSnapshot(state.holdings, source.id, sourceAfter);
  holdings = replaceHoldingSnapshot(holdings, destinationAfter.id, destinationAfter);

  return {
    ...state,
    holdings,
    activities: [...state.activities, activity]
  };
}

function restoreIdentityConflict(
  holdings: Holding[],
  snapshot: Holding,
  excludedId: string
) {
  const key = holdingIdentityKey(snapshot);
  return holdings.some((holding) =>
    holding.id !== excludedId &&
    holdingIdentityKey(holding) === key
  );
}

export function revertSecurityAccountTransfer(
  state: AppState,
  activityId: string
): AppState {
  const activity = state.activities.find((item) => item.id === activityId);
  const impact = activity?.positionTransferImpact;
  if (!activity || activity.type !== "position_transfer" || !impact) {
    throw new Error("這筆紀錄不是可回滾的證券帳戶移轉。");
  }

  const laterTouch = hasLaterRecordedActivity(
    state.activities,
    activity,
    (item) =>
      activityTouchesSecurityHolding(item, impact.sourceHoldingId) ||
      activityTouchesSecurityHolding(item, impact.destinationHoldingId)
  );
  if (laterTouch) {
    throw new Error("來源或目的持股後面已有其他庫存連動事件，請先從最新事件開始回滾。");
  }

  const currentSource = state.holdings.find((item) => item.id === impact.sourceHoldingId) ?? null;
  const currentDestination = state.holdings.find((item) => item.id === impact.destinationHoldingId) ?? null;
  if (
    !holdingSnapshotEqual(currentSource, impact.sourceAfter) ||
    !holdingSnapshotEqual(currentDestination, impact.destinationAfter)
  ) {
    throw new Error("來源或目的持股已被後續手動修改或校正，無法安全自動回滾。");
  }

  if (
    impact.sourceAfter === null &&
    restoreIdentityConflict(state.holdings, impact.sourceBefore, impact.sourceHoldingId)
  ) {
    throw new Error("來源帳戶已重新建立同一標的部位，無法安全還原舊持股。");
  }

  let holdings = replaceHoldingSnapshot(state.holdings, impact.sourceHoldingId, impact.sourceBefore);
  holdings = replaceHoldingSnapshot(
    holdings,
    impact.destinationHoldingId,
    impact.destinationBefore
  );

  return {
    ...state,
    holdings,
    activities: state.activities.filter((item) => item.id !== activity.id)
  };
}
