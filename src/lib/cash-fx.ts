import type { AppState, PortfolioActivity } from "./types";
import { localDateKey } from "./calc";
import { accountName } from "./local-data";
import { hasLaterRecordedActivity } from "./activity-order";
import {
  activityTouchesCashHolding,
  holdingSnapshotEqual,
  nextCashSnapshot,
  replaceHoldingSnapshot
} from "./cash-account";

export type CashFxConversionInput = {
  id: string;
  date: string;
  fromCashHoldingId: string;
  toCashHoldingId: string;
  fromAmount: number;
  toAmount: number;
  note: string;
};

function assertPositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}必須大於 0。`);
  }
}

export function executionTwdPerUsd(
  fromCurrency: "TWD" | "USD",
  fromAmount: number,
  toAmount: number
) {
  assertPositive(fromAmount, "轉出金額");
  assertPositive(toAmount, "實收金額");
  const rate = fromCurrency === "TWD"
    ? fromAmount / toAmount
    : toAmount / fromAmount;
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("成交換匯匯率無效。");
  }
  return rate;
}

export function applyCashFxConversion(
  state: AppState,
  input: CashFxConversionInput
): AppState {
  if (input.date !== localDateKey()) {
    throw new Error("內部換匯只允許從今天的目前帳戶狀態往前套用，避免歷史重播造成現金餘額失真。");
  }
  if (input.fromCashHoldingId === input.toCashHoldingId) {
    throw new Error("換匯的轉出與轉入帳戶不可相同。");
  }
  assertPositive(input.fromAmount, "轉出金額");
  assertPositive(input.toAmount, "實收金額");

  const from = state.holdings.find((item) => item.id === input.fromCashHoldingId);
  const to = state.holdings.find((item) => item.id === input.toCashHoldingId);
  if (!from || from.type !== "cash" || !to || to.type !== "cash") {
    throw new Error("找不到有效的換匯現金帳戶。");
  }
  if (from.currency === to.currency) {
    throw new Error("同幣別帳戶請使用內部轉帳；換匯必須是 TWD 與 USD 之間的轉換。");
  }

  const executionRate = executionTwdPerUsd(from.currency, input.fromAmount, input.toAmount);
  const fromAfter = nextCashSnapshot(from, -input.fromAmount);
  const toAfter = nextCashSnapshot(to, input.toAmount);

  const activity: PortfolioActivity = {
    id: input.id,
    date: input.date,
    type: "fx_conversion",
    symbol: "",
    amount: input.fromAmount,
    currency: from.currency,
    fxRate: executionRate,
    quantity: 0,
    price: 0,
    note: input.note.trim(),
    account: accountName(from.account),
    cashFxImpact: {
      fromCashHoldingId: from.id,
      toCashHoldingId: to.id,
      fromBefore: { ...from },
      fromAfter,
      toBefore: { ...to },
      toAfter,
      fromAmount: input.fromAmount,
      toAmount: input.toAmount,
      executionTwdPerUsd: executionRate,
      valuationTwdPerUsd: state.usdTwd
    }
  };

  let holdings = replaceHoldingSnapshot(state.holdings, from.id, fromAfter);
  holdings = replaceHoldingSnapshot(holdings, to.id, toAfter);

  return {
    ...state,
    holdings,
    activities: [...state.activities, activity]
  };
}

export function revertCashFxConversion(state: AppState, activityId: string): AppState {
  const activity = state.activities.find((item) => item.id === activityId);
  const impact = activity?.cashFxImpact;
  if (!activity || activity.type !== "fx_conversion" || !impact) {
    throw new Error("這筆紀錄不是可回滾的內部換匯。");
  }

  const laterTouchesEither = hasLaterRecordedActivity(
    state.activities,
    activity,
    (item) =>
      activityTouchesCashHolding(item, impact.fromCashHoldingId) ||
      activityTouchesCashHolding(item, impact.toCashHoldingId)
  );
  if (laterTouchesEither) {
    throw new Error("換匯涉及的任一現金帳戶後面已有其他連動事件，請先從最新一筆開始回滾。");
  }

  const currentFrom = state.holdings.find((item) => item.id === impact.fromCashHoldingId) ?? null;
  const currentTo = state.holdings.find((item) => item.id === impact.toCashHoldingId) ?? null;
  if (
    !holdingSnapshotEqual(currentFrom, impact.fromAfter) ||
    !holdingSnapshotEqual(currentTo, impact.toAfter)
  ) {
    throw new Error("換匯涉及的現金餘額已被後續手動修改或校正，無法安全自動回滾。");
  }

  let holdings = replaceHoldingSnapshot(state.holdings, impact.fromCashHoldingId, impact.fromBefore);
  holdings = replaceHoldingSnapshot(holdings, impact.toCashHoldingId, impact.toBefore);

  return {
    ...state,
    holdings,
    activities: state.activities.filter((item) => item.id !== activity.id)
  };
}
