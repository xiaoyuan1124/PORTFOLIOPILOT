import { describe, expect, it } from "vitest";
import type { Holding } from "./types";
import { isHeldTwSecurity, resolveHeldTwSecurityKeys } from "./research-holdings";

function holding(overrides: Partial<Holding>): Holding {
  return {
    id: "h",
    symbol: "2330",
    name: "台積電",
    market: "TW",
    type: "stock",
    quantity: 1,
    price: 1000,
    averageCost: 900,
    currency: "TWD",
    sector: "半導體",
    ...overrides
  };
}

describe("venue-aware research holding identity", () => {
  it("uses known TWSE/TPEx provenance to avoid same-code false held badges", () => {
    const keys = resolveHeldTwSecurityKeys(
      [holding({ symbol: "7777", priceSource: "TWSE" })],
      [
        { market: "TWSE", code: "7777" },
        { market: "TPEx", code: "7777" }
      ]
    );

    expect(isHeldTwSecurity(keys, "TWSE", "7777")).toBe(true);
    expect(isHeldTwSecurity(keys, "TPEx", "7777")).toBe(false);
  });

  it("resolves an unknown venue only when the official code is unique", () => {
    const keys = resolveHeldTwSecurityKeys(
      [holding({ symbol: "2330", priceSource: undefined })],
      [{ market: "TWSE", code: "2330" }]
    );

    expect(isHeldTwSecurity(keys, "TWSE", "2330")).toBe(true);
  });

  it("fails closed when an unknown-venue code exists on multiple markets", () => {
    const keys = resolveHeldTwSecurityKeys(
      [holding({ symbol: "7777", priceSource: undefined })],
      [
        { market: "TWSE", code: "7777" },
        { market: "TPEx", code: "7777" }
      ]
    );

    expect(keys.size).toBe(0);
  });

  it("ignores cash and US holdings", () => {
    const keys = resolveHeldTwSecurityKeys(
      [
        holding({ type: "cash", symbol: "CASH-TWD" }),
        holding({ market: "US", symbol: "QQQM", currency: "USD", type: "etf" })
      ],
      [{ market: "TWSE", code: "QQQM" }]
    );

    expect(keys.size).toBe(0);
  });
});
