import { describe, expect, it } from "vitest";
import {
  isCashFxActivityType,
  isCashTransferActivityType,
  isPositionTransferActivityType,
  isExternalActivityType,
  isTradeActivityType,
  normalizeActivitySecurityFields
} from "./activity-data";

describe("activity type integrity", () => {
  it("recognizes external and trade activity types", () => {
    expect(isExternalActivityType("deposit")).toBe(true);
    expect(isExternalActivityType("withdrawal")).toBe(true);
    expect(isExternalActivityType("buy")).toBe(false);
    expect(isTradeActivityType("buy")).toBe(true);
    expect(isTradeActivityType("sell")).toBe(true);
    expect(isTradeActivityType("dividend")).toBe(false);
    expect(isCashTransferActivityType("transfer")).toBe(true);
    expect(isExternalActivityType("transfer")).toBe(false);
    expect(isCashFxActivityType("fx_conversion")).toBe(true);
    expect(isExternalActivityType("fx_conversion")).toBe(false);
    expect(isPositionTransferActivityType("position_transfer")).toBe(true);
    expect(isExternalActivityType("position_transfer")).toBe(false);
  });

  it("removes stale security fields from external cash flows", () => {
    expect(normalizeActivitySecurityFields("deposit", "2330", 3, 1000)).toEqual({
      symbol: "",
      quantity: 0,
      price: 0
    });
  });

  it("removes stale security fields from internal cash transfers", () => {
    expect(normalizeActivitySecurityFields("transfer", "2330", 3, 1000)).toEqual({
      symbol: "",
      quantity: 0,
      price: 0
    });
  });

  it("removes stale security fields from internal FX conversions", () => {
    expect(normalizeActivitySecurityFields("fx_conversion", "QQQM", 2, 250)).toEqual({
      symbol: "",
      quantity: 0,
      price: 0
    });
  });

  it("keeps symbol and quantity but removes price for security account transfers", () => {
    expect(normalizeActivitySecurityFields("position_transfer", " 2330 ", 4, 1000)).toEqual({
      symbol: "2330",
      quantity: 4,
      price: 0
    });
  });

  it("keeps trade security fields and normalizes the symbol", () => {
    expect(normalizeActivitySecurityFields("buy", " qqqm ", 2, 150)).toEqual({
      symbol: "QQQM",
      quantity: 2,
      price: 150
    });
  });

  it("keeps only the symbol for dividends and fees", () => {
    expect(normalizeActivitySecurityFields("dividend", "2330", 3, 1000)).toEqual({
      symbol: "2330",
      quantity: 0,
      price: 0
    });
  });
});
