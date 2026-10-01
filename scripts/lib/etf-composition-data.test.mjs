import { describe, expect, it } from "vitest";
import { chooseStockTable, normalizeDate, parseIssuerComposition } from "./etf-composition-data.mjs";

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
});
