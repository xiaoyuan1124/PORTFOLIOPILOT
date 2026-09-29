import { describe, expect, it } from "vitest";
import {
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
  });

  it("removes stale security fields from external cash flows", () => {
    expect(normalizeActivitySecurityFields("deposit", "2330", 3, 1000)).toEqual({
      symbol: "",
      quantity: 0,
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
