import { describe, expect, it } from "vitest";
import { buildDividendSummary, recentMonthKeys } from "./dividend-data";
import type { PortfolioActivity } from "./types";

function activity(patch: Partial<PortfolioActivity> = {}): PortfolioActivity {
  return {
    id: "a1",
    date: "2026-09-15",
    type: "dividend",
    symbol: "2330",
    amount: 100,
    currency: "TWD",
    fxRate: 1,
    quantity: 0,
    price: 0,
    note: "",
    ...patch
  };
}

describe("dividend center", () => {
  it("builds a stable rolling 12 calendar-month key range", () => {
    const months = recentMonthKeys("2026-01-20", 12);
    expect(months[0]).toBe("2025-02");
    expect(months.at(-1)).toBe("2026-01");
    expect(months).toHaveLength(12);
  });

  it("uses each dividend record's historical FX for TWD totals", () => {
    const summary = buildDividendSummary([
      activity(),
      activity({
        id: "usd",
        date: "2026-09-20",
        symbol: "QQQM",
        amount: 10,
        currency: "USD",
        fxRate: 32
      })
    ], "2026-09-30");

    expect(summary.currentMonthTwd).toBe(420);
    expect(summary.currentYearTwd).toBe(420);
    expect(summary.trailing12Twd).toBe(420);
    expect(summary.bySymbol.find((row) => row.symbol === "QQQM")?.amountTwd).toBe(320);
  });

  it("excludes future-dated dividend records from received-income totals", () => {
    const summary = buildDividendSummary([
      activity(),
      activity({ id: "future", date: "2026-10-10", amount: 999 })
    ], "2026-09-30");

    expect(summary.recordCount).toBe(1);
    expect(summary.futureCount).toBe(1);
    expect(summary.lifetimeTwd).toBe(100);
  });

  it("keeps missing-symbol dividend records visible instead of assigning them to a holding", () => {
    const summary = buildDividendSummary([
      activity({ symbol: "   " })
    ], "2026-09-30");

    expect(summary.missingSymbolCount).toBe(1);
    expect(summary.bySymbol[0]?.symbol).toBe("未指定");
  });

  it("ignores non-dividend activities", () => {
    const summary = buildDividendSummary([
      activity(),
      activity({ id: "fee", type: "fee", amount: 50 })
    ], "2026-09-30");

    expect(summary.recordCount).toBe(1);
    expect(summary.lifetimeTwd).toBe(100);
  });
});
