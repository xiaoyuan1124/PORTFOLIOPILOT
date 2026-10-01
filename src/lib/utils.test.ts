import { describe, expect, it } from "vitest";
import { marketPrice, money } from "./utils";

describe("price formatting", () => {
  it("preserves two decimals for TWD market prices", () => {
    expect(marketPrice(16.35, "TWD")).toContain("16.35");
    expect(marketPrice(16, "TWD")).toContain("16.00");
  });

  it("keeps portfolio money totals on their existing whole-TWD format", () => {
    expect(money(1234.56, "TWD")).not.toContain(".");
  });
});
