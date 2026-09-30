import type { AppState, Holding, PortfolioActivity } from "./types";
import { localDateKey, portfolioSummary } from "./calc";
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
  capturePreFlowFromCurrentState?: boolean;
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

export function nextCashSnapshot(holding: Holding, delta: number): Holding {
  const cash = assertCashHolding(holding);
  if (!Number.isFinite(delta) || delta === 0) throw new Error("現金異動金額無效。");

  const nextBalance = cash.price + delta;
  if (nextBalance < -1e-9) {
    throw new Error(`${cash.currency} 現金不足：目前 ${cash.price.toLocaleString()}，需要 ${Math.abs(delta).toLocaleString()}。`);
  }
  const normalizedBalance = Math.abs(nextBalance) <= 1e-9 ? 0 : nextBalance;

  return {
    ...cash,
    quantity: 1,
    price: normalizedBalance,
    averageCost: normalizedBalance,
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

  const external = input.type === "deposit" || input.type === "withdrawal";
  if (input.capturePreFlowFromCurrentState && !external) {
    throw new Error("只有入金／出金可以自動擷取 TWR 邊界。");
  }
  if (input.capturePreFlowFromCurrentState && input.preFlowValueTwd !== undefined) {
    throw new Error("自動擷取與手動 TWR 邊界不可同時使用。");
  }
  if (input.capturePreFlowFromCurrentState && input.date !== localDateKey()) {
    throw new Error("歷史入金／出金不可使用目前淨值作為 TWR 邊界，請改用手動補登。");
  }
  if (input.capturePreFlowFromCurrentState && !input.time) {
    throw new Error("自動擷取 TWR 邊界時必須保留事件時間。");
  }
  if (
    input.capturePreFlowFromCurrentState &&
    state.activities.some((activity) =>
      (activity.type === "deposit" || activity.type === "withdrawal") &&
      activity.date === input.date &&
      activity.time === input.time
    )
  ) {
    throw new Error("同一分鐘已有入金／出金事件，無法安全自動決定 TWR 邊界順序；請改用手動模式填入實際時間與邊界。");
  }

  const cash = assertCashHolding(state.holdings.find((item) => item.id === input.cashHoldingId));
  const delta = signedDelta(input.type, input.amount);
  const after = nextCashSnapshot(cash, delta);

  const capturedPreFlowValueTwd = input.capturePreFlowFromCurrentState
    ? portfolioSummary(state.holdings, state.usdTwd).total
    : input.preFlowValueTwd;
  const preFlowValueSource = input.capturePreFlowFromCurrentState
    ? "system_current_state" as const
    : input.preFlowValueTwd !== undefined
      ? "manual" as const
      : undefined;

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
    ...(external && capturedPreFlowValueTwd !== undefined ? { preFlowValueTwd: capturedPreFlowValueTwd } : {}),
    ...(external && preFlowValueSource ? { preFlowValueSource } : {}),
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
