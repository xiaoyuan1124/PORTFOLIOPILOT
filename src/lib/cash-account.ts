import type { AppState, Holding, PortfolioActivity } from "./types";
import { accountName } from "./local-data";

export type CashLinkedActivityInput = {
  id: string;
  date: string;
  type: "deposit" | "withdrawal" | "dividend" | "fee";
  cashHoldingId: string;
  amount: number;
  fxRate: number;
  symbol: string;
  note: string;
  time?: string;
  preFlowValueTwd?: number;
};

export function cashBalance(holding: Holding) {
  if (holding.type !== "cash") throw new Error("指定部位不是現金帳戶。");
  return holding.price;
}

function assertCashHolding(holding: Holding | undefined) {
  if (!holding || holding.type !== "cash") {
    throw new Error("找不到可連動的現金帳戶，請先建立現金部位。");
  }
  return holding;
}

export function nextCashSnapshot(holding: Holding, delta: number): Holding | null {
  const cash = assertCashHolding(holding);
  if (!Number.isFinite(delta) || delta === 0) throw new Error("現金異動金額無效。");

  const nextBalance = cash.price + delta;
  if (nextBalance < -1e-9) {
    throw new Error(`${cash.currency} 現金不足：目前 ${cash.price.toLocaleString()}，需要 ${Math.abs(delta).toLocaleString()}。`);
  }
  if (nextBalance <= 1e-9) return null;

  return {
    ...cash,
    quantity: 1,
    price: nextBalance,
    averageCost: nextBalance,
    priceSource: undefined,
    priceAsOf: undefined
  };
}

export function holdingSnapshotEqual(a: Holding | null | undefined, b: Holding | null | undefined) {
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function replaceHoldingSnapshot(
  holdings: Holding[],
  holdingId: string,
  after: Holding | null
) {
  const exists = holdings.some((item) => item.id === holdingId);
  if (after) {
    return exists
      ? holdings.map((item) => item.id === holdingId ? after : item)
      : [...holdings, after];
  }
  return holdings.filter((item) => item.id !== holdingId);
}

function signedDelta(type: CashLinkedActivityInput["type"], amount: number) {
  return type === "deposit" || type === "dividend" ? amount : -amount;
}

export function applyCashLinkedActivity(state: AppState, input: CashLinkedActivityInput): AppState {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("現金異動金額必須大於 0。");
  }
  if (!Number.isFinite(input.fxRate) || input.fxRate <= 0) {
    throw new Error("匯率必須大於 0。");
  }

  const cash = assertCashHolding(state.holdings.find((item) => item.id === input.cashHoldingId));
  const delta = signedDelta(input.type, input.amount);
  const after = nextCashSnapshot(cash, delta);

  const external = input.type === "deposit" || input.type === "withdrawal";
  const activity: PortfolioActivity = {
    id: input.id,
    date: input.date,
    ...(external && input.time ? { time: input.time } : {}),
    type: input.type,
    symbol: input.symbol.trim().toUpperCase(),
    amount: input.amount,
    currency: cash.currency,
    fxRate: cash.currency === "USD" ? input.fxRate : 1,
    quantity: 0,
    price: 0,
    note: input.note.trim(),
    account: accountName(cash.account),
    ...(external && input.preFlowValueTwd !== undefined ? { preFlowValueTwd: input.preFlowValueTwd } : {}),
    cashImpact: {
      cashHoldingId: cash.id,
      before: { ...cash },
      after,
      delta,
      reason: input.type
    }
  };

  return {
    ...state,
    holdings: replaceHoldingSnapshot(state.holdings, cash.id, after),
    activities: [...state.activities, activity]
  };
}

export function revertCashLinkedActivity(state: AppState, activityId: string): AppState {
  const activity = state.activities.find((item) => item.id === activityId);
  const impact = activity?.cashImpact;
  if (!activity || !impact || activity.inventoryImpact) {
    throw new Error("這筆紀錄不是可獨立回滾的現金連動事件。");
  }

  const laterCash = state.activities.some((item) =>
    item.id !== activity.id &&
    item.cashImpact?.cashHoldingId === impact.cashHoldingId &&
    (item.date > activity.date || (item.date === activity.date && item.id > activity.id))
  );
  if (laterCash) {
    throw new Error("此現金帳戶後面已有其他連動事件，請先從最新一筆開始回滾。");
  }

  const current = state.holdings.find((item) => item.id === impact.cashHoldingId) ?? null;
  if (!holdingSnapshotEqual(current, impact.after)) {
    throw new Error("目前現金餘額已被後續修改或校正，無法安全自動回滾。");
  }

  return {
    ...state,
    holdings: replaceHoldingSnapshot(state.holdings, impact.cashHoldingId, impact.before),
    activities: state.activities.filter((item) => item.id !== activity.id)
  };
}
