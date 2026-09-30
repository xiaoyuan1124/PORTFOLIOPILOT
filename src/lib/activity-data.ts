import type { ActivityType } from "./types";

export function isExternalActivityType(type: ActivityType) {
  return type === "deposit" || type === "withdrawal";
}

export function isTradeActivityType(type: ActivityType) {
  return type === "buy" || type === "sell";
}

export function isCashTransferActivityType(type: ActivityType) {
  return type === "transfer";
}

export function isCashFxActivityType(type: ActivityType) {
  return type === "fx_conversion";
}

export function isPositionTransferActivityType(type: ActivityType) {
  return type === "position_transfer";
}

export function normalizeActivitySecurityFields(
  type: ActivityType,
  symbol: string,
  quantity: number,
  price: number
) {
  const normalizedSymbol = symbol.trim().toUpperCase();

  if (isExternalActivityType(type) || isCashTransferActivityType(type) || isCashFxActivityType(type)) {
    return { symbol: "", quantity: 0, price: 0 };
  }

  if (isTradeActivityType(type)) {
    return {
      symbol: normalizedSymbol,
      quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
      price: Number.isFinite(price) && price >= 0 ? price : 0
    };
  }

  if (isPositionTransferActivityType(type)) {
    return {
      symbol: normalizedSymbol,
      quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
      price: 0
    };
  }

  return {
    symbol: normalizedSymbol,
    quantity: 0,
    price: 0
  };
}
