import { describe, expect, it } from "vitest";
import { chooseStockTable, normalizeDate, parseIssuerComposition, parseNomuraFundAssetsPayload } from "./etf-composition-data.mjs";

const fixture = `
<html><body>
  <table><tr><th>日期</th><th>淨值</th></tr><tr><td>2026/09/30</td><td>16.2</td></tr></table>
  <div>持股比重 (2026/09/30)</div>
  <table>
    <tr><th>股票代號</th><th>股票名稱</th><th>股數</th><th>權重(%)</th></tr>
    <tr><td>2330</td><td>台積電</td><td>1000</td><td>40.5</td></tr>
    <tr><td>2454</td><td>聯發科</td><td>500</td><td>6.5%</td></tr>
    <tr><td>2308</td><td>台達電</td><td>400</td><td>3.5</td></tr>
    <tr><td>2887</td><td>台新新光金</td><td>300</td><td>2.9</td></tr>
    <tr><td>3711</td><td>日月光投控</td><td>200</td><td>1.8</td></tr>
    <tr><td>202610TX</td><td>臺股期貨</td><td>10</td><td>1.5</td></tr>
  </table>
</body></html>`;

describe("ETF issuer composition parser", () => {
  it("chooses a stock table instead of unrelated tables", () => {
    const table = chooseStockTable(fixture);
    expect(table?.stockRows).toHaveLength(5);
    expect(table?.totalWeight).toBeCloseTo(55.2, 8);
  });

  it("normalizes issuer dates", () => {
    expect(normalizeDate("2026/09/30")).toBe("2026-09-30");
    expect(normalizeDate("2026-09-30")).toBe("2026-09-30");
  });

  it("builds a traceable official issuer composition", () => {
    const result = parseIssuerComposition({
      html: fixture,
      etfSymbol: "009816",
      etfName: "凱基台灣TOP50",
      sourceName: "凱基投信",
      sourceUrl: "https://www.kgifund.com.tw/Fund/Detail?fundID=J023",
      datePatterns: [/持股比重\s*\((20\d{2}[\/-]\d{2}[\/-]\d{2})\)/]
    });
    expect(result.asOf).toBe("2026-09-30");
    expect(result.sourceType).toBe("official_issuer");
    expect(result.constituents[0]).toMatchObject({ symbol: "2330", weightPct: 40.5 });
  });

  it("parses Nomura official Fund/GetFundAssets stock rows", () => {
    const result = parseNomuraFundAssetsPayload({
      payload: {
        StatusCode: 0,
        Entries: {
          Data: {
            FundAsset: { NavDate: "2026/09/30" },
            Table: [{
              TableTitle: "股票",
              NavDate: "2026/09/30",
              Rows: [
                ["2330", "台灣積體電路製造", "5034000", "23.57"],
                ["2454", "聯發科技", "1888000", "17.54"],
                ["2308", "台達電子工業", "2635000", "9.4"],
                ["3711", "日月光投資控股", "4121000", "5.47"],
                ["2303", "聯華電子", "14649000", "4.27"]
              ]
            }, {
              TableTitle: "期貨",
              NavDate: "2026/09/30",
              Rows: [["TX", "臺股期貨", "10", "1.93"]]
            }]
          }
        }
      },
      etfSymbol: "00935",
      etfName: "野村臺灣新科技50",
      sourceName: "野村投信官方持股比重",
      sourceUrl: "https://www.nomurafunds.com.tw/ETFWEB/product-description?fundNo=00935&tab=Shareholding"
    });

    expect(result.asOf).toBe("2026-09-30");
    expect(result.constituents).toHaveLength(5);
    expect(result.constituents[0]).toMatchObject({
      symbol: "2330",
      name: "台灣積體電路製造",
      weightPct: 23.57
    });
    expect(result.constituents.some((item) => item.symbol === "TX")).toBe(false);
  });

  it("rejects malformed Nomura holdings instead of silently producing partial data", () => {
    expect(() => parseNomuraFundAssetsPayload({
      payload: {
        StatusCode: 0,
        Entries: { Data: { Table: [{ TableTitle: "股票", NavDate: "2026/09/30", Rows: [["2330", "台積電", "1", "23.57"]] }] } }
      },
      etfSymbol: "00935",
      etfName: "野村臺灣新科技50",
      sourceName: "野村投信官方持股比重",
      sourceUrl: "https://www.nomurafunds.com.tw/ETFWEB/product-description?fundNo=00935&tab=Shareholding"
    })).toThrow(/不完整或權重異常/);
  });
});
