import { describe, expect, it } from "vitest";
import { analyzeUsdFxAttribution } from "./usd-fx-attribution";
import type { Holding, PortfolioActivity } from "./types";

function holding(id = "us-a", quantity = 10, averageCost = 100, price = 120, account = "美股券商"): Holding {
  return {
    id, symbol: "QQQM", name: "Invesco QQQM", market: "US", type: "etf",
    quantity, averageCost, price, currency: "USD", sector: "ETF", account
  };
}
function trade(
  id: string, type: "buy" | "sell", before: Holding | null, after: Holding | null,
  amount: number, quantity: number, fxRate: number, date = "2026-10-07"
): PortfolioActivity {
  return {
    id, date, type, symbol: "QQQM", amount, quantity, price: amount / quantity,
    currency: "USD", fxRate, note: "", account: "美股券商",
    inventoryImpact: { kind: "trade", holdingId: "us-a", before, after, fee: 0, tax: 0, realizedPnl: 0, method: "average_cost" }
  };
}

describe("USD holding attribution with complete cost provenance", () => {
  it("splits price and recorded-FX effects without equating today's converted cost with historical TWD basis", () => {
    const last = holding();
    const result = analyzeUsdFxAttribution([last], [trade("open", "buy", null, last, 1000, 10, 30)], 32, "2026-10-09");
    const row = result.rows[0]!;
    expect(row).toMatchObject({
      status: "verified_chain", recordedCostTwd: 30000,
      priceImpactTwd: 6400, fxImpactTwd: 2000, combinedGainTwd: 8400,
      averageRecordedFx: 30
    });
    expect(row.priceImpactTwd! + row.fxImpactTwd!).toBeCloseTo(row.combinedGainTwd!);
    expect(result).toMatchObject({ eligibleCount: 1, explainedCount: 1, unknownCount: 0, unknownValueTwd: 0 });
  });

  it("tracks two buys at different FX rates and prorates historic TWD cost through a partial sell", () => {
    const first = holding("us-a", 10, 100, 100);
    const second = holding("us-a", 15, 1550 / 15, 110);
    const last = holding("us-a", 12, 1550 / 15, 120);
    const activities = [
      trade("open", "buy", null, first, 1000, 10, 30, "2026-10-01"),
      trade("add", "buy", first, second, 550, 5, 31, "2026-10-02"),
      trade("sell", "sell", second, last, 330, 3, 33, "2026-10-03")
    ];
    const result = analyzeUsdFxAttribution([last], activities, 32, "2026-10-09");
    const row = result.rows[0]!;
    expect(row.status).toBe("verified_chain");
    expect(row).toMatchObject({ buyCount: 2, saleCount: 1, quantity: 12 });
    expect(row.recordedCostTwd).toBeCloseTo(37640);
    expect(row.priceImpactTwd).toBeCloseTo(6400);
    expect(row.fxImpactTwd).toBeCloseTo(2040);
    expect(row.combinedGainTwd).toBeCloseTo(8440);
  });

  it("refuses imported or manually seeded holdings with no linked opening purchase", () => {
    const current = holding();
    const result = analyzeUsdFxAttribution([current], [], 32, "2026-10-09");
    expect(result.rows[0]).toMatchObject({
      status: "missing_opening", priceImpactTwd: null, fxImpactTwd: null,
      recordedCostTwd: null
    });
    expect(result.unknownValueTwd).toBeCloseTo(38400);
    expect(result.explainedValueTwd).toBe(0);
  });

  it("refuses invalid placeholder FX and broken inventory chains", () => {
    const first = holding("us-a", 10, 100, 100);
    const current = holding("us-a", 12, 100, 120);
    const missingFx = analyzeUsdFxAttribution([first], [trade("open", "buy", null, first, 1000, 10, 1)], 32, "2026-10-09");
    expect(missingFx.rows[0]?.status).toBe("missing_fx");

    const broken = analyzeUsdFxAttribution([current], [trade("open", "buy", null, first, 1000, 10, 30)], 32, "2026-10-09");
    expect(broken.rows[0]?.status).toBe("incomplete_chain");

    const wrongBefore = holding("us-a", 9, 100, 100);
    const second = holding("us-a", 12, 125, 120);
    const gap = analyzeUsdFxAttribution([second], [
      trade("open", "buy", null, first, 1000, 10, 30),
      trade("add", "buy", wrongBefore, second, 600, 3, 31)
    ], 32, "2026-10-09");
    expect(gap.rows[0]?.status).toBe("incomplete_chain");
  });

  it("does not borrow purchase history across accounts with the same symbol", () => {
    const current = holding("us-b", 10, 100, 120, "第二帳戶");
    const unrelated = trade("open", "buy", null, holding(), 1000, 10, 30);
    const row = analyzeUsdFxAttribution([current], [unrelated], 32, "2026-10-09").rows[0];
    expect(row?.status).toBe("missing_opening");
    expect(row?.combinedGainTwd).toBeNull();
  });

  it("rejects unrelated historical ledger-only trades during an active linked lot", () => {
    const first = holding();
    const baseline = trade("open", "buy", null, first, 1000, 10, 30, "2026-10-01");
    const legacy: PortfolioActivity = {
      ...trade("old", "buy", null, first, 1000, 10, 30, "2026-10-02"),
      historicalTrade: { mode: "ledger_only", market: "US", fee: 0, tax: 0 },
      inventoryImpact: undefined
    };
    const row = analyzeUsdFxAttribution([first], [baseline, legacy], 32, "2026-10-09").rows[0];
    expect(row?.status).toBe("incomplete_chain");
  });

  it("excludes future-dated linked purchases and avoids mixing cash with security FX attribution", () => {
    const first = holding();
    const result = analyzeUsdFxAttribution([
      first,
      { ...holding("us-cash"), type: "cash", price: 250, quantity: 1, averageCost: 250 }
    ], [trade("open", "buy", null, first, 1000, 10, 30, "2026-10-12")], 32, "2026-10-09");
    expect(result).toMatchObject({ eligibleCount: 1, explainedCount: 0, unknownCount: 1 });
    expect(result.rows[0]?.status).toBe("incomplete_chain");
  });

  it("never fabricates gains for US holdings when spot FX is invalid", () => {
    const first = holding();
    const row = analyzeUsdFxAttribution([first], [trade("open", "buy", null, first, 1000, 10, 30)], 0, "2026-10-09").rows[0];
    expect(row?.status).toBe("incomplete_chain");
    expect(row?.combinedGainTwd).toBeNull();
  });
});
