import type { AppState, Holding, PortfolioActivity } from "./types";
import { accountName } from "./local-data";

export type ManagedTradeInput = {
  id: string;
  date: string;
  type: "buy" | "sell";
  holdingId: string;
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

function holdingSnapshotEqual(a: Holding | null | undefined, b: Holding | null | undefined) {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function applyManagedTrade(state: AppState, input: ManagedTradeInput): AppState {
  const holding = state.holdings.find((item) => item.id === input.holdingId);
  if (!holding || holding.type === "cash") {
    throw new Error("找不到可套用交易的投資部位，請先建立持股。");
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
    }
  };

  return {
    ...state,
    holdings: after
      ? state.holdings.map((item) => item.id === holding.id ? after! : item)
      : state.holdings.filter((item) => item.id !== holding.id),
    activities: [...state.activities, activity]
  };
}

export function revertManagedTrade(state: AppState, activityId: string): AppState {
  const activity = state.activities.find((item) => item.id === activityId);
  const impact = activity?.inventoryImpact;
  if (!activity || !impact || impact.kind !== "trade") {
    throw new Error("這筆紀錄不是可回滾的持股連動交易。");
  }

  const laterLinked = state.activities.some((item) =>
    item.id !== activity.id &&
    item.inventoryImpact?.holdingId === impact.holdingId &&
    (item.date > activity.date || (item.date === activity.date && item.id > activity.id))
  );
  if (laterLinked) {
    throw new Error("此部位後面已有其他持股連動交易，請先從最新一筆開始回滾。");
  }

  const current = state.holdings.find((item) => item.id === impact.holdingId) ?? null;
  if (!holdingSnapshotEqual(current, impact.after)) {
    throw new Error("目前持股已被後續手動修改或校正，無法安全自動回滾這筆交易。");
  }

  const restored = impact.before;
  const holdings = current
    ? state.holdings.map((item) => item.id === restored.id ? restored : item)
    : [...state.holdings, restored];

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
