import type { AppState, Holding, PortfolioActivity } from "./types";
import { accountName, holdingIdentityKey } from "./local-data";
import { localDateKey } from "./calc";
import { activityTouchesSecurityHolding, hasLaterRecordedActivity } from "./activity-order";
import {
  activityTouchesCashHolding,
  holdingSnapshotEqual,
  nextCashSnapshot,
  replaceHoldingSnapshot
} from "./cash-account";

export type ManagedTradeInput = {
  id: string;
  date: string;
  type: "buy" | "sell";
  holdingId: string;
  cashHoldingId: string;
  quantity: number;
  price: number;
  fee: number;
  tax: number;
  fxRate: number;
  note: string;
};

export type NewPositionDraft = Omit<Holding, "quantity" | "averageCost">;

export type NewPositionBuyInput = {
  id: string;
  date: string;
  cashHoldingId: string;
  position: NewPositionDraft;
  quantity: number;
  price: number;
  fee: number;
  tax: number;
  fxRate: number;
  note: string;
};

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label}必須大於 0。`);
}

function assertNonnegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label}不可小於 0。`);
}

export function applyOpeningBuy(state: AppState, input: NewPositionBuyInput): AppState {
  if (input.date !== localDateKey()) {
    throw new Error("首次買進只允許記錄今天實際發生的交易；歷史交易不可重播到目前持股與現金。");
  }

  const cash = state.holdings.find((item) => item.id === input.cashHoldingId);
  if (!cash || cash.type !== "cash") {
    throw new Error("找不到可連動的現金帳戶，請先建立現金部位。");
  }
  if (input.position.type === "cash") {
    throw new Error("首次買進只能建立股票或 ETF 部位。");
  }
  if (cash.currency !== input.position.currency) {
    throw new Error(`新部位幣別為 ${input.position.currency}，不可連動 ${cash.currency} 現金帳戶。`);
  }

  assertPositive(input.quantity, "交易數量");
  assertPositive(input.price, "成交價");
  assertPositive(input.position.price, "目前價格");
  assertNonnegative(input.fee, "手續費");
  assertNonnegative(input.tax, "交易稅");
  assertPositive(input.fxRate, "匯率");

  const normalizedPosition = {
    ...input.position,
    symbol: input.position.symbol.trim().toUpperCase(),
    name: input.position.name.trim(),
    sector: input.position.sector.trim(),
    account: accountName(input.position.account)
  };
  if (!normalizedPosition.symbol || !normalizedPosition.name || !normalizedPosition.sector) {
    throw new Error("首次買進需要完整的標的代號、名稱與分類。");
  }

  const duplicate = state.holdings.some((item) =>
    item.type !== "cash" &&
    holdingIdentityKey(item) === holdingIdentityKey(normalizedPosition)
  );
  if (duplicate) {
    throw new Error("相同市場、代號與帳戶的持股已存在，請改用一般買進。");
  }

  const gross = input.quantity * input.price;
  const amount = gross + input.fee + input.tax;
  const cashAfter = nextCashSnapshot(cash, -amount);
  const after: Holding = {
    ...normalizedPosition,
    quantity: input.quantity,
    averageCost: amount / input.quantity
  };

  const activity: PortfolioActivity = {
    id: input.id,
    date: input.date,
    type: "buy",
    symbol: after.symbol,
    amount,
    currency: after.currency,
    fxRate: after.currency === "TWD" ? 1 : input.fxRate,
    quantity: input.quantity,
    price: input.price,
    note: input.note.trim(),
    account: accountName(after.account),
    inventoryImpact: {
      kind: "trade",
      holdingId: after.id,
      before: null,
      after,
      fee: input.fee,
      tax: input.tax,
      realizedPnl: 0,
      method: "average_cost"
    },
    cashImpact: {
      cashHoldingId: cash.id,
      before: { ...cash },
      after: cashAfter,
      delta: -amount,
      reason: "trade"
    }
  };

  const withPosition = replaceHoldingSnapshot(state.holdings, after.id, after);
  const holdings = replaceHoldingSnapshot(withPosition, cash.id, cashAfter);

  return {
    ...state,
    holdings,
    activities: [...state.activities, activity]
  };
}

export function applyManagedTrade(state: AppState, input: ManagedTradeInput): AppState {
  if (input.date !== localDateKey()) {
    throw new Error("持股連動交易只允許記錄今天實際發生的交易；歷史買賣不可重播到目前庫存與現金。");
  }

  const holding = state.holdings.find((item) => item.id === input.holdingId);
  if (!holding || holding.type === "cash") {
    throw new Error("找不到可套用交易的投資部位，請先建立持股。");
  }

  const cash = state.holdings.find((item) => item.id === input.cashHoldingId);
  if (!cash || cash.type !== "cash") {
    throw new Error("找不到可連動的現金帳戶，請先建立現金部位。");
  }
  if (cash.currency !== holding.currency) {
    throw new Error(`交易幣別為 ${holding.currency}，不可連動 ${cash.currency} 現金帳戶。`);
  }

  assertPositive(input.quantity, "交易數量");
  assertPositive(input.price, "成交價");
  assertNonnegative(input.fee, "手續費");
  assertNonnegative(input.tax, "交易稅");
  assertPositive(input.fxRate, "匯率");

  if (input.type === "sell" && input.quantity > holding.quantity + 1e-9) {
    throw new Error(`賣出數量 ${input.quantity} 超過目前持有 ${holding.quantity}。`);
  }

  const gross = input.quantity * input.price;
  const before = { ...holding };
  let after: Holding | null;
  let amount: number;
  let realizedPnl = 0;

  if (input.type === "buy") {
    const newQuantity = holding.quantity + input.quantity;
    const totalBasis =
      holding.quantity * holding.averageCost +
      gross +
      input.fee +
      input.tax;

    after = {
      ...holding,
      quantity: newQuantity,
      averageCost: totalBasis / newQuantity
    };
    amount = gross + input.fee + input.tax;
  } else {
    const netProceeds = gross - input.fee - input.tax;
    if (netProceeds <= 0) {
      throw new Error("賣出淨收入必須大於 0，請檢查成交價、手續費與交易稅。");
    }

    const remaining = holding.quantity - input.quantity;
    realizedPnl = netProceeds - input.quantity * holding.averageCost;
    after = remaining > 1e-9
      ? { ...holding, quantity: remaining }
      : null;
    amount = netProceeds;
  }

  const cashDelta = input.type === "buy" ? -amount : amount;
  const cashAfter = nextCashSnapshot(cash, cashDelta);

  const activity: PortfolioActivity = {
    id: input.id,
    date: input.date,
    type: input.type,
    symbol: holding.symbol.trim().toUpperCase(),
    amount,
    currency: holding.currency,
    fxRate: holding.currency === "TWD" ? 1 : input.fxRate,
    quantity: input.quantity,
    price: input.price,
    note: input.note.trim(),
    account: accountName(holding.account),
    inventoryImpact: {
      kind: "trade",
      holdingId: holding.id,
      before,
      after,
      fee: input.fee,
      tax: input.tax,
      realizedPnl,
      method: "average_cost"
    },
    cashImpact: {
      cashHoldingId: cash.id,
      before: { ...cash },
      after: cashAfter,
      delta: cashDelta,
      reason: "trade"
    }
  };

  const withSecurity = replaceHoldingSnapshot(state.holdings, holding.id, after);
  const holdings = replaceHoldingSnapshot(withSecurity, cash.id, cashAfter);

  return {
    ...state,
    holdings,
    activities: [...state.activities, activity]
  };
}

export function revertManagedTrade(state: AppState, activityId: string): AppState {
  const activity = state.activities.find((item) => item.id === activityId);
  const impact = activity?.inventoryImpact;
  if (!activity || !impact || impact.kind !== "trade") {
    throw new Error("這筆紀錄不是可回滾的持股連動交易。");
  }

  const laterLinked = hasLaterRecordedActivity(
    state.activities,
    activity,
    (item) => activityTouchesSecurityHolding(item, impact.holdingId)
  );
  if (laterLinked) {
    throw new Error("此部位後面已有其他持股連動事件，請先從最新一筆開始回滾。");
  }

  const cashImpact = activity.cashImpact;
  const laterCash = cashImpact
    ? hasLaterRecordedActivity(
        state.activities,
        activity,
        (item) => activityTouchesCashHolding(item, cashImpact.cashHoldingId)
      )
    : false;
  if (laterCash) {
    throw new Error("這筆交易使用的現金帳戶後面已有其他連動事件，請先從最新一筆開始回滾。");
  }

  const current = state.holdings.find((item) => item.id === impact.holdingId) ?? null;
  if (!holdingSnapshotEqual(current, impact.after)) {
    throw new Error("目前持股已被後續手動修改或校正，無法安全自動回滾這筆交易。");
  }

  if (cashImpact) {
    const currentCash = state.holdings.find((item) => item.id === cashImpact.cashHoldingId) ?? null;
    if (!holdingSnapshotEqual(currentCash, cashImpact.after)) {
      throw new Error("目前現金餘額已被後續修改或校正，無法安全自動回滾這筆交易。");
    }
  }

  if (
    impact.after === null &&
    impact.before &&
    state.holdings.some((item) =>
      item.id !== impact.holdingId &&
      holdingIdentityKey(item) === holdingIdentityKey(impact.before!)
    )
  ) {
    throw new Error("原持股帳戶已重新建立同一標的部位，無法安全還原已賣出的舊持股。");
  }

  let holdings = replaceHoldingSnapshot(state.holdings, impact.holdingId, impact.before);
  if (cashImpact) {
    holdings = replaceHoldingSnapshot(holdings, cashImpact.cashHoldingId, cashImpact.before);
  }

  return {
    ...state,
    holdings,
    activities: state.activities.filter((item) => item.id !== activity.id)
  };
}

export function realizedManagedTradePnlTwd(activities: PortfolioActivity[]) {
  return activities.reduce((sum, activity) => {
    const impact = activity.inventoryImpact;
    if (!impact || impact.kind !== "trade" || activity.type !== "sell") return sum;
    const fx = activity.currency === "USD" ? activity.fxRate : 1;
    return sum + impact.realizedPnl * fx;
  }, 0);
}
