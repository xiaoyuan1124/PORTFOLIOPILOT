import { describe, expect, it } from "vitest";
import type { Holding } from "./types";
import { materialEventsForHoldings, type MaterialEventCache } from "./material-events-data";

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

const cache: MaterialEventCache = {
  generatedAt: "2026-09-30T10:30:00.000Z",
  retentionDays: 45,
  sources: [],
  rows: [
    {
      market: "TWSE",
      code: "7777",
      name: "上市同碼",
      publishedDate: "2026-09-30",
      publishedTime: "16:00:00",
      factDate: "2026-09-30",
      rule: "第51款",
      subject: "上市公告",
      detail: ""
    },
    {
      market: "TPEx",
      code: "7777",
      name: "上櫃同碼",
      publishedDate: "2026-09-30",
      publishedTime: "15:00:00",
      factDate: "2026-09-30",
      rule: "第51款",
      subject: "上櫃公告",
      detail: ""
    },
    {
      market: "TWSE",
      code: "2330",
      name: "台積電",
      publishedDate: "2026-09-29",
      publishedTime: "14:30:00",
      factDate: "2026-09-29",
      rule: "第12款",
      subject: "台積電公告",
      detail: ""
    }
  ]
};

describe("held material events", () => {
  it("shows only events for currently held Taiwan securities", () => {
    const rows = materialEventsForHoldings(cache, [
      holding({ symbol: "2330", priceSource: "TWSE" })
    ]);
    expect(rows.map((row) => row.subject)).toEqual(["台積電公告"]);
  });

  it("uses known venue provenance for same-code securities", () => {
    const rows = materialEventsForHoldings(cache, [
      holding({ symbol: "7777", priceSource: "TPEx" })
    ]);
    expect(rows.map((row) => row.subject)).toEqual(["上櫃公告"]);
  });

  it("fails closed when a manual holding code is ambiguous across venues", () => {
    const rows = materialEventsForHoldings(cache, [
      holding({ symbol: "7777", priceSource: undefined })
    ]);
    expect(rows).toEqual([]);
  });
});
