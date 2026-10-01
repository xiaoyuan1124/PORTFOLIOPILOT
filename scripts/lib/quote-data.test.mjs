import { describe, expect, it } from "vitest";
import {
  combineQuoteMarkets,
  latestQuoteDate,
  isTpexWarrantCode,
  normalizeQuoteDate,
  parseTpexQuoteRows,
  parseTwseMiIndexPayload,
  parseTwseQuoteRows
} from "./quote-data.mjs";

describe("Taiwan quote refresh helpers", () => {
  it("normalizes Gregorian and ROC dates", () => {
    expect(normalizeQuoteDate("20260929")).toBe("2026-09-29");
    expect(normalizeQuoteDate("1150929")).toBe("2026-09-29");
    expect(normalizeQuoteDate("115/09/29")).toBe("2026-09-29");
  });

  it("parses TWSE MI_INDEX tables", () => {
    const payload = {
      stat: "OK",
      tables: [
        { fields: ["指數", "收盤"], data: [["發行量加權股價指數", "1"]] },
        {
          fields: ["證券代號", "證券名稱", "成交股數", "收盤價", "漲跌(+/-)", "漲跌價差"],
          data: [["2330", "台積電", "12,345", "1,250.00", "+", "50.00"]]
        }
      ]
    };

    expect(parseTwseMiIndexPayload(payload, "2026-09-29")).toEqual([
      {
        code: "2330",
        name: "台積電",
        market: "TWSE",
        close: 1250,
        date: "2026-09-29",
        change: 50,
        changePct: 4.166666666666666
      }
    ]);
  });

  it("supports legacy TWSE MI_INDEX fields9/data9 payloads", () => {
    const payload = {
      stat: "OK",
      fields9: ["證券代號", "證券名稱", "收盤價"],
      data9: [["2330", "台積電", "1,251.00"]]
    };
    expect(parseTwseMiIndexPayload(payload, "2026-09-29")[0]?.close).toBe(1251);
  });

  it("recognizes official TPEx warrant code ranges without matching ETFs or stocks", () => {
    expect(isTpexWarrantCode("700000")).toBe(true);
    expect(isTpexWarrantCode("70000P")).toBe(true);
    expect(isTpexWarrantCode("73999Y")).toBe(true);
    expect(isTpexWarrantCode("6488")).toBe(false);
    expect(isTpexWarrantCode("00937B")).toBe(false);
    expect(isTpexWarrantCode("00411A")).toBe(false);
  });

  it("parses TWSE OpenAPI fallback and TPEx closing-price payloads", () => {
    const twse = parseTwseQuoteRows([
      { Date: "1150929", Code: "2330", Name: "台積電", ClosingPrice: "1,250.00", Change: "50.00" }
    ]);
    const tpex = parseTpexQuoteRows([
      { Date: "1150929", SecuritiesCompanyCode: "6488", CompanyName: "環球晶", Close: "445.00", Change: "-5.00" },
      { Date: "1150929", SecuritiesCompanyCode: "700000", CompanyName: "測試認購權證", Close: "1.23", Change: "0.01" }
    ]);

    expect(twse[0]).toEqual({
      code: "2330",
      name: "台積電",
      market: "TWSE",
      close: 1250,
      date: "2026-09-29",
      change: 50,
      changePct: 4.166666666666666
    });
    expect(tpex).toHaveLength(1);
    expect(tpex[0]).toEqual({
      code: "6488",
      name: "環球晶",
      market: "TPEx",
      close: 445,
      date: "2026-09-29",
      change: -5,
      changePct: -1.1111111111111112
    });
  });

  it("fails closed on ex-right/ex-dividend no-comparison rows", () => {
    const twse = parseTwseQuoteRows([
      { Date: "1150929", Code: "2330", Name: "台積電", ClosingPrice: "1,250.00", Change: "X0.00" }
    ]);
    expect(twse[0]?.change).toBeNull();
    expect(twse[0]?.changePct).toBeNull();
  });

  it("never regresses one market to an older official date", () => {
    const existing = [
      { code: "2330", name: "台積電", market: "TWSE", close: 1250, date: "2026-09-29" },
      { code: "6488", name: "環球晶", market: "TPEx", close: 445, date: "2026-09-29" }
    ];
    const twseOlder = [
      { code: "2330", name: "台積電", market: "TWSE", close: 1200, date: "2026-09-24" }
    ];
    const tpexSameDayCorrection = [
      { code: "6488", name: "環球晶", market: "TPEx", close: 448, date: "2026-09-29" }
    ];

    const merged = combineQuoteMarkets(existing, twseOlder, tpexSameDayCorrection);
    expect(merged.find((row) => row.code === "2330")?.close).toBe(1250);
    expect(merged.find((row) => row.code === "6488")?.close).toBe(448);
    expect(latestQuoteDate(merged)).toBe("2026-09-29");
  });
});
