import { describe, expect, it } from "vitest";
import {
  combineQuoteMarkets,
  latestQuoteDate,
  normalizeQuoteDate,
  parseTpexQuoteRows,
  parseTwseQuoteRows
} from "./quote-data.mjs";

describe("Taiwan quote refresh helpers", () => {
  it("normalizes Gregorian and ROC dates", () => {
    expect(normalizeQuoteDate("20260929")).toBe("2026-09-29");
    expect(normalizeQuoteDate("1150929")).toBe("2026-09-29");
    expect(normalizeQuoteDate("115/09/29")).toBe("2026-09-29");
  });

  it("parses TWSE and TPEx closing-price payloads", () => {
    const twse = parseTwseQuoteRows([
      { Date: "1150929", Code: "2330", Name: "台積電", ClosingPrice: "1,250.00" }
    ]);
    const tpex = parseTpexQuoteRows([
      { Date: "1150929", SecuritiesCompanyCode: "6488", CompanyName: "環球晶", Close: "445.00" }
    ]);

    expect(twse[0]).toEqual({ code: "2330", name: "台積電", market: "TWSE", close: 1250, date: "2026-09-29" });
    expect(tpex[0]).toEqual({ code: "6488", name: "環球晶", market: "TPEx", close: 445, date: "2026-09-29" });
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
