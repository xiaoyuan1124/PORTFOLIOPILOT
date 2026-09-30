import { describe, expect, it } from "vitest";
import type { AppState, Holding } from "./types";
import { localDateKey } from "./calc";
import { applyShareAdjustment, revertCorporateAction } from "./corporate-actions";
import { applySecurityAccountTransfer } from "./security-transfer";

function holding(patch: Partial<Holding> = {}): Holding {
  return {
    id: "h1",
    symbol: "2330",
    name: "台積電",
    market: "TW",
    type: "stock",
    quantity: 10,
    price: 1000,
    averageCost: 900,
    currency: "TWD",
    sector: "半導體",
    account: "券商A",
    priceSource: "TWSE",
    priceAsOf: "2026-09-30",
    ...patch
  };
}

function state(baseHolding = holding()): AppState {
  return {
    holdings: [baseHolding],
    etfCompositions: [],
    journal: [],
    activities: [],
    snapshots: [],
    allocationTargets: [],
    usdTwd: 31.8,
    dataMode: "personal"
  };
}

describe("corporate share adjustments", () => {
  it("applies a 2-for-1 split while preserving total cost basis", () => {
    const next = applyShareAdjustment(state(), {
      id: "split",
      date: "2026-09-30",
      holdingId: "h1",
      ratio: 2,
      note: "1拆2"
    });

    const after = next.holdings[0]!;
    expect(after.quantity).toBe(20);
    expect(after.averageCost).toBe(450);
    expect(after.quantity * after.averageCost).toBeCloseTo(9000, 8);
    expect(after.price).toBe(1000);
    expect(after.priceSource).toBe("TWSE");
    expect(next.activities[0]).toMatchObject({
      type: "corporate_action",
      amount: 0,
      symbol: "2330",
      inventoryImpact: {
        kind: "corporate_action",
        action: "share_adjustment",
        ratio: 2
      }
    });
  });

  it("applies a reverse split and preserves total cost basis", () => {
    const next = applyShareAdjustment(state(), {
      id: "reverse",
      date: "2026-09-30",
      holdingId: "h1",
      ratio: 0.2,
      note: "5併1"
    });

    expect(next.holdings[0]?.quantity).toBe(2);
    expect(next.holdings[0]?.averageCost).toBe(4500);
    expect(next.holdings[0]!.quantity * next.holdings[0]!.averageCost).toBeCloseTo(9000, 8);
  });

  it("supports proportional stock-dividend style share increases", () => {
    const next = applyShareAdjustment(state(), {
      id: "stock-dividend",
      date: "2026-09-30",
      holdingId: "h1",
      ratio: 1.1,
      note: "股數增加10%"
    });

    expect(next.holdings[0]?.quantity).toBeCloseTo(11, 8);
    expect(next.holdings[0]?.averageCost).toBeCloseTo(900 / 1.1, 8);
  });

  it("rejects zero, negative and no-op ratios", () => {
    expect(() => applyShareAdjustment(state(), {
      id: "bad",
      date: "2026-09-30",
      holdingId: "h1",
      ratio: 0,
      note: ""
    })).toThrow(/必須大於 0/);

    expect(() => applyShareAdjustment(state(), {
      id: "noop",
      date: "2026-09-30",
      holdingId: "h1",
      ratio: 1,
      note: ""
    })).toThrow(/不可為 1/);
  });

  it("reverts the latest share adjustment exactly", () => {
    const adjusted = applyShareAdjustment(state(), {
      id: "split",
      date: "2026-09-30",
      holdingId: "h1",
      ratio: 2,
      note: ""
    });
    const reverted = revertCorporateAction(adjusted, "split");

    expect(reverted.holdings).toEqual([holding()]);
    expect(reverted.activities).toHaveLength(0);
  });

  it("rejects rollback after later inventory-linked activity", () => {
    const adjusted = applyShareAdjustment(state(), {
      id: "a",
      date: "2026-09-29",
      holdingId: "h1",
      ratio: 2,
      note: ""
    });

    const withLater = {
      ...adjusted,
      activities: [
        ...adjusted.activities,
        {
          id: "z",
          date: "2026-09-30",
          type: "buy" as const,
          symbol: "2330",
          amount: 1000,
          currency: "TWD" as const,
          fxRate: 1,
          quantity: 1,
          price: 1000,
          note: "",
          account: "券商A",
          inventoryImpact: {
            kind: "trade" as const,
            holdingId: "h1",
            before: adjusted.holdings[0]!,
            after: { ...adjusted.holdings[0]!, quantity: adjusted.holdings[0]!.quantity + 1 },
            fee: 0,
            tax: 0,
            realizedPnl: 0,
            method: "average_cost" as const
          }
        }
      ]
    };

    expect(() => revertCorporateAction(withLater, "a")).toThrow(/最新一筆/);
  });

  it("uses recorded order instead of lexicographic IDs for same-day rollback safety", () => {
    const first = applyShareAdjustment(state(), {
      id: "activity-2026-09-30-9",
      date: "2026-09-30",
      holdingId: "h1",
      ratio: 2,
      note: ""
    });
    const second = applyShareAdjustment(first, {
      id: "activity-2026-09-30-10",
      date: "2026-09-30",
      holdingId: "h1",
      ratio: 2,
      note: ""
    });
    const third = applyShareAdjustment(second, {
      id: "activity-2026-09-30-11",
      date: "2026-09-30",
      holdingId: "h1",
      ratio: 0.5,
      note: ""
    });

    // The two later adjustments net back to the first adjustment's snapshot.
    // A lexicographic ID comparison would mis-order "-10"/"-11" before "-9"
    // and could otherwise allow an unsafe rollback.
    expect(third.holdings[0]).toEqual(first.holdings[0]);
    expect(() => revertCorporateAction(third, "activity-2026-09-30-9")).toThrow(/最新一筆/);
  });

  it("rejects rollback after manual holding drift", () => {
    const adjusted = applyShareAdjustment(state(), {
      id: "split",
      date: "2026-09-30",
      holdingId: "h1",
      ratio: 2,
      note: ""
    });
    const drifted = {
      ...adjusted,
      holdings: [{ ...adjusted.holdings[0]!, price: 999 }]
    };

    expect(() => revertCorporateAction(drifted, "split")).toThrow(/無法安全回滾/);
  });
  it("rejects corporate-action rollback after a later security transfer touched the holding", () => {
    const adjusted = applyShareAdjustment(state(), {
      id: "activity-1",
      date: localDateKey(),
      holdingId: "h1",
      ratio: 2,
      note: ""
    });
    const transferred = applySecurityAccountTransfer(adjusted, {
      id: "activity-2",
      date: localDateKey(),
      sourceHoldingId: "h1",
      destinationAccount: "券商B",
      quantity: 1,
      note: ""
    });

    expect(() => revertCorporateAction(transferred, "activity-1")).toThrow(/持股連動事件/);
  });

});
