import { describe, expect, it } from "vitest";
import { buildAllocationDrift, buildCurrentAllocationBuckets, targetsFromCurrentAllocation } from "./allocation-targets";
import type { Holding } from "./types";

function holding(patch: Partial<Holding> = {}): Holding {
  return {
    id: "h1",
    symbol: "2330",
    name: "台積電",
    market: "TW",
    type: "stock",
    quantity: 10,
    price: 100,
    averageCost: 90,
    currency: "TWD",
    sector: "半導體",
    account: "券商A",
    ...patch
  };
}

describe("allocation targets", () => {
  it("aggregates the same asset across accounts into one allocation bucket", () => {
    const buckets = buildCurrentAllocationBuckets([
      holding(),
      holding({ id: "h2", quantity: 5, account: "券商B" })
    ], 32);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({
      key: "TW:2330",
      valueTwd: 1500,
      currentPct: 100
    });
  });

  it("keeps TWD and USD cash in separate target buckets", () => {
    const buckets = buildCurrentAllocationBuckets([
      holding({
        id: "cash-twd",
        symbol: "CASH-TWD",
        name: "TWD 現金",
        type: "cash",
        quantity: 1,
        price: 1000,
        averageCost: 1000,
        sector: "現金"
      }),
      holding({
        id: "cash-usd",
        symbol: "CASH-USD",
        name: "USD 現金",
        market: "US",
        type: "cash",
        quantity: 1,
        price: 100,
        averageCost: 100,
        currency: "USD",
        sector: "現金"
      })
    ], 30);

    expect(buckets.map((row) => row.key)).toEqual(["CASH:USD", "CASH:TWD"]);
    expect(buckets[0]?.valueTwd).toBe(3000);
    expect(buckets[1]?.valueTwd).toBe(1000);
  });

  it("includes both unheld targets and currently held untargeted assets in drift", () => {
    const rows = buildAllocationDrift([
      { key: "TW:2330", label: "2330 · 台積電", targetPct: 60 },
      { key: "US:QQQM", label: "QQQM · Invesco NASDAQ 100 ETF", targetPct: 40 }
    ], [
      holding(),
      holding({
        id: "h2",
        symbol: "2317",
        name: "鴻海",
        quantity: 10,
        price: 100,
        averageCost: 90
      })
    ], 32);

    const qqqm = rows.find((row) => row.key === "US:QQQM");
    const honHai = rows.find((row) => row.key === "TW:2317");

    expect(qqqm).toMatchObject({ currentPct: 0, targetPct: 40, driftPct: -40 });
    expect(honHai).toMatchObject({ currentPct: 50, targetPct: 0, driftPct: 50 });
  });

  it("seeds targets from current allocation with an exact 100 percent total", () => {
    const targets = targetsFromCurrentAllocation([
      holding(),
      holding({
        id: "h2",
        symbol: "2317",
        name: "鴻海",
        quantity: 1,
        price: 333,
        averageCost: 300
      })
    ], 32);

    expect(targets.reduce((sum, target) => sum + target.targetPct, 0)).toBeCloseTo(100, 8);
  });
});
