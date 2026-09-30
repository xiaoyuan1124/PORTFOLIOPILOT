import { describe, expect, it } from "vitest";
import { parseTaiwanBrokerInventoryCsv } from "./broker-inventory-csv";
import type { HoldingLookupCandidate } from "./holding-autofill";

const catalog: HoldingLookupCandidate[] = [
  {
    code: "2330",
    name: "台積電",
    venue: "TWSE",
    close: 1000,
    date: "2026-09-30",
    industry: "半導體業",
    type: "stock"
  },
  {
    code: "0050",
    name: "元大台灣50",
    venue: "TWSE",
    close: 210,
    date: "2026-09-30",
    industry: "ETF",
    type: "etf"
  },
  {
    code: "7777",
    name: "測試上市",
    venue: "TWSE",
    close: 50,
    date: "2026-09-30",
    industry: "其他",
    type: "stock"
  },
  {
    code: "7777",
    name: "測試上櫃",
    venue: "TPEx",
    close: 51,
    date: "2026-09-30",
    industry: "其他",
    type: "stock"
  }
];

describe("Taiwan broker inventory CSV adapter", () => {
  it("maps common Chinese inventory headers and enriches from official catalog", () => {
    const rows = parseTaiwanBrokerInventoryCsv([
      "股票代號,股票名稱,庫存股數,平均成本",
      "2330,自訂名稱,\"1,000\",900",
      "0050,ETF,12,180"
    ].join("\n"), "永豐證券", catalog);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      symbol: "2330",
      name: "台積電",
      type: "stock",
      quantity: 1000,
      price: 1000,
      averageCost: 900,
      account: "永豐證券",
      priceSource: "TWSE",
      priceAsOf: "2026-09-30"
    });
    expect(rows[1]).toMatchObject({
      symbol: "0050",
      name: "元大台灣50",
      type: "etf",
      sector: "ETF"
    });
  });

  it("uses an explicit CSV account column over the fallback account", () => {
    const rows = parseTaiwanBrokerInventoryCsv([
      "證券代號,持有股數,成本均價,券商帳戶",
      "2330,10,950,國泰證券-A"
    ].join("\n"), "預設券商", catalog);

    expect(rows[0]?.account).toBe("國泰證券-A");
  });

  it("uses venue hints to resolve same-code market ambiguity", () => {
    const rows = parseTaiwanBrokerInventoryCsv([
      "代號,數量,平均成本,市場別",
      "7777,10,40,上櫃"
    ].join("\n"), "測試帳戶", catalog);

    expect(rows[0]).toMatchObject({
      symbol: "7777",
      name: "測試上櫃",
      price: 51,
      priceSource: "TPEx"
    });
  });

  it("fails closed on same-code venue ambiguity without a market column", () => {
    expect(() => parseTaiwanBrokerInventoryCsv([
      "代號,股數,平均成本",
      "7777,10,40"
    ].join("\n"), "測試帳戶", catalog)).toThrow(/不同市場/);
  });

  it("rejects transaction-style files that do not contain average cost", () => {
    expect(() => parseTaiwanBrokerInventoryCsv([
      "股票代號,成交股數,成交價",
      "2330,10,1000"
    ].join("\n"), "券商", catalog)).toThrow(/平均成本/);
  });

  it("rejects unknown official securities instead of guessing identity", () => {
    expect(() => parseTaiwanBrokerInventoryCsv([
      "symbol,quantity,avgCost",
      "9999,10,100"
    ].join("\n"), "券商", catalog)).toThrow(/官方標的快取/);
  });

  it("rejects duplicate inventory identities in one file", () => {
    expect(() => parseTaiwanBrokerInventoryCsv([
      "代號,股數,平均成本",
      "2330,10,900",
      "2330,5,920"
    ].join("\n"), "券商", catalog)).toThrow(/重複持股/);
  });

  it("requires an explicit fallback account when the file has no account column", () => {
    expect(() => parseTaiwanBrokerInventoryCsv([
      "代號,股數,平均成本",
      "2330,10,900"
    ].join("\n"), "   ", catalog)).toThrow(/預設帳戶名稱/);
  });
});
