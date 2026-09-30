import { describe, expect, it } from "vitest";
import type { AppState, Holding } from "./types";
import { localDateKey } from "./calc";
import { applyShareAdjustment } from "./corporate-actions";
import {
  applySecurityAccountTransfer,
  revertSecurityAccountTransfer
} from "./security-transfer";

function security(patch: Partial<Holding> = {}): Holding {
  return {
    id: "source",
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

function state(holdings: Holding[] = [security()]): AppState {
  return {
    holdings,
    etfCompositions: [],
    journal: [],
    activities: [],
    snapshots: [],
    allocationTargets: [],
    usdTwd: 31.8,
    dataMode: "personal"
  };
}

describe("security account transfer", () => {
  it("moves part of a position into a new account without changing value or cost basis", () => {
    const base = state();
    const next = applySecurityAccountTransfer(base, {
      id: "transfer-1",
      date: localDateKey(),
      sourceHoldingId: "source",
      destinationAccount: "券商B",
      quantity: 4,
      note: ""
    });

    expect(next.holdings.find((item) => item.id === "source")).toMatchObject({
      quantity: 6,
      averageCost: 900,
      price: 1000,
      account: "券商A"
    });
    const destination = next.holdings.find((item) => item.account === "券商B");
    expect(destination).toMatchObject({
      symbol: "2330",
      quantity: 4,
      averageCost: 900,
      price: 1000,
      priceSource: "TWSE",
      priceAsOf: "2026-09-30"
    });
    expect(next.activities[0]).toMatchObject({
      type: "position_transfer",
      symbol: "2330",
      amount: 0,
      quantity: 4,
      positionTransferImpact: {
        sourceHoldingId: "source",
        quantity: 4,
        destinationBefore: null
      }
    });

    const beforeValue = base.holdings.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const afterValue = next.holdings.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const beforeBasis = base.holdings.reduce((sum, item) => sum + item.quantity * item.averageCost, 0);
    const afterBasis = next.holdings.reduce((sum, item) => sum + item.quantity * item.averageCost, 0);
    expect(afterValue).toBe(beforeValue);
    expect(afterBasis).toBe(beforeBasis);
  });

  it("merges into an existing destination using weighted cost basis", () => {
    const destination = security({
      id: "destination",
      quantity: 2,
      averageCost: 800,
      account: "券商B"
    });
    const next = applySecurityAccountTransfer(state([security(), destination]), {
      id: "merge",
      date: localDateKey(),
      sourceHoldingId: "source",
      destinationAccount: "券商B",
      quantity: 4,
      note: ""
    });

    expect(next.holdings.find((item) => item.id === "destination")).toMatchObject({
      quantity: 6,
      averageCost: (2 * 800 + 4 * 900) / 6
    });
    expect(next.holdings.find((item) => item.id === "source")?.quantity).toBe(6);

    const reverted = revertSecurityAccountTransfer(next, "merge");
    expect(reverted.holdings).toEqual([security(), destination]);
  });

  it("removes a fully transferred source and restores it exactly on rollback", () => {
    const base = state();
    const moved = applySecurityAccountTransfer(base, {
      id: "full",
      date: localDateKey(),
      sourceHoldingId: "source",
      destinationAccount: "券商B",
      quantity: 10,
      note: ""
    });

    expect(moved.holdings.some((item) => item.id === "source")).toBe(false);
    expect(moved.holdings).toHaveLength(1);
    expect(moved.holdings[0]?.account).toBe("券商B");

    const reverted = revertSecurityAccountTransfer(moved, "full");
    expect(reverted.holdings).toEqual(base.holdings);
    expect(reverted.activities).toEqual([]);
  });

  it("rejects same-account, oversized and historical transfers", () => {
    expect(() => applySecurityAccountTransfer(state(), {
      id: "same",
      date: localDateKey(),
      sourceHoldingId: "source",
      destinationAccount: "券商A",
      quantity: 1,
      note: ""
    })).toThrow(/目的帳戶不可/);

    expect(() => applySecurityAccountTransfer(state(), {
      id: "oversized",
      date: localDateKey(),
      sourceHoldingId: "source",
      destinationAccount: "券商B",
      quantity: 11,
      note: ""
    })).toThrow(/超過目前持有/);

    expect(() => applySecurityAccountTransfer(state(), {
      id: "historical",
      date: "2000-01-01",
      sourceHoldingId: "source",
      destinationAccount: "券商B",
      quantity: 1,
      note: ""
    })).toThrow(/只允許從今天/);
  });

  it("fails closed when an existing destination uses a different current price or provenance", () => {
    const staleDestination = security({
      id: "destination",
      account: "券商B",
      quantity: 2,
      price: 999,
      priceSource: "manual",
      priceAsOf: undefined
    });

    expect(() => applySecurityAccountTransfer(state([security(), staleDestination]), {
      id: "stale",
      date: localDateKey(),
      sourceHoldingId: "source",
      destinationAccount: "券商B",
      quantity: 1,
      note: ""
    })).toThrow(/價格或價格來源／資料日不一致/);
  });

  it("rejects rollback after a later inventory event touched the destination", () => {
    const moved = applySecurityAccountTransfer(state(), {
      id: "activity-1",
      date: localDateKey(),
      sourceHoldingId: "source",
      destinationAccount: "券商B",
      quantity: 4,
      note: ""
    });
    const destination = moved.holdings.find((item) => item.account === "券商B")!;
    const adjusted = applyShareAdjustment(moved, {
      id: "activity-2",
      date: localDateKey(),
      holdingId: destination.id,
      ratio: 2,
      note: ""
    });

    expect(() => revertSecurityAccountTransfer(adjusted, "activity-1")).toThrow(/最新事件/);
  });

  it("rejects rollback after manual drift on either side", () => {
    const moved = applySecurityAccountTransfer(state(), {
      id: "drift",
      date: localDateKey(),
      sourceHoldingId: "source",
      destinationAccount: "券商B",
      quantity: 4,
      note: ""
    });
    const destination = moved.holdings.find((item) => item.account === "券商B")!;
    const drifted = {
      ...moved,
      holdings: moved.holdings.map((item) =>
        item.id === destination.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    };

    expect(() => revertSecurityAccountTransfer(drifted, "drift")).toThrow(/手動修改或校正/);
  });

  it("rejects restoring a fully transferred source if that account identity was recreated", () => {
    const moved = applySecurityAccountTransfer(state(), {
      id: "full-collision",
      date: localDateKey(),
      sourceHoldingId: "source",
      destinationAccount: "券商B",
      quantity: 10,
      note: ""
    });
    const recreated = {
      ...security(),
      id: "manual-recreated"
    };
    const conflicted = {
      ...moved,
      holdings: [...moved.holdings, recreated]
    };

    expect(() => revertSecurityAccountTransfer(conflicted, "full-collision")).toThrow(/已重新建立同一標的/);
  });
});
