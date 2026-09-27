import { describe, expect, it } from "vitest";
import { normalizeValuationDate, parseTpexValuations, parseTwseValuations } from "./valuation-data.mjs";

describe("official valuation parsers", () => {
  it("normalizes ROC and Gregorian dates", () => {
    expect(normalizeValuationDate("1150807")).toBe("2026-08-07");
    expect(normalizeValuationDate("115/08/07")).toBe("2026-08-07");
    expect(normalizeValuationDate("20260807")).toBe("2026-08-07");
    expect(normalizeValuationDate("bad")).toBe("");
  });

  it("parses TWSE PE, PB and dividend yield while preserving official blanks", () => {
    expect(parseTwseValuations([
      { Date: "1150807", Code: "2330", Name: "台積電", PEratio: "25.10", DividendYield: "1.75", PBratio: "6.20" },
      { Date: "1150807", Code: "1301", Name: "台塑", PEratio: "", DividendYield: "0.90", PBratio: "0.91" }
    ])).toEqual([
      { code: "2330", name: "台積電", market: "TWSE", date: "2026-08-07", pe: 25.1, pb: 6.2, dividendYield: 1.75 },
      { code: "1301", name: "台塑", market: "TWSE", date: "2026-08-07", pe: null, pb: 0.91, dividendYield: 0.9 }
    ]);
  });

  it("parses TPEx field names and keeps zero yield distinct from missing data", () => {
    expect(parseTpexValuations([
      { Date: "1150807", SecuritiesCompanyCode: "6488", CompanyName: "環球晶", PriceEarningRatio: "18.5", YieldRatio: "0.00", PriceBookRatio: "2.4" }
    ])).toEqual([
      { code: "6488", name: "環球晶", market: "TPEx", date: "2026-08-07", pe: 18.5, pb: 2.4, dividendYield: 0 }
    ]);
  });

  it("drops rows without identity/date or any official valuation value", () => {
    expect(parseTwseValuations([
      { Date: "1150807", Code: "9999", Name: "空白", PEratio: "", DividendYield: "", PBratio: "" },
      { Date: "", Code: "2330", Name: "台積電", PEratio: "20", DividendYield: "1", PBratio: "5" }
    ])).toEqual([]);
  });
});
