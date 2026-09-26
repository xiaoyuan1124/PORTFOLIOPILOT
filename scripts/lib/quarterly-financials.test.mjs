import { describe, expect, it } from "vitest";
import {
  deriveSingleQuarterRows,
  evaluateGrossMarginTrend,
  parseMopsQuarterlyHtml
} from "./quarterly-financials.mjs";

const sampleHtml = `
<table>
<tr><th>公司代號</th><th>公司名稱</th><th>營業收入</th><th>營業成本</th><th>營業毛利（毛損）</th></tr>
<tr><td>2330</td><td>台積電</td><td>1,000</td><td>600</td><td>400</td></tr>
</table>
<table>
<tr><th>公司代號</th><th>公司名稱</th><th>利息淨收益</th><th>本期淨利（淨損）</th></tr>
<tr><td>2881</td><td>富邦金</td><td>100</td><td>20</td></tr>
</table>`;

describe("MOPS quarterly statement parser", () => {
  it("keeps general-industry gross-profit rows and marks special statement families not applicable", () => {
    const parsed = parseMopsQuarterlyHtml(sampleHtml);
    expect(parsed.generalRows).toEqual([
      { code: "2330", name: "台積電", revenue: 1000, operatingCost: 600, grossProfit: 400 }
    ]);
    expect(parsed.notApplicable).toEqual([{ code: "2881", name: "富邦金" }]);
  });
});

describe("single-quarter derivation", () => {
  it("uses Q1 cumulative figures directly", () => {
    const rows = deriveSingleQuarterRows({
      currentRows: [{ code: "2330", name: "台積電", revenue: 100, operatingCost: 60, grossProfit: 40 }],
      previousRows: null,
      period: "2026-Q1",
      market: "TWSE"
    });
    expect(rows[0]?.grossMarginPct).toBe(40);
    expect(rows[0]?.revenue).toBe(100);
  });

  it("subtracts prior cumulative figures for Q2-Q4 before calculating margin", () => {
    const rows = deriveSingleQuarterRows({
      currentRows: [{ code: "2330", name: "台積電", revenue: 230, operatingCost: 130, grossProfit: 100 }],
      previousRows: [{ code: "2330", name: "台積電", revenue: 100, operatingCost: 60, grossProfit: 40 }],
      period: "2026-Q2",
      market: "TWSE"
    });
    expect(rows[0]).toMatchObject({ revenue: 130, operatingCost: 70, grossProfit: 60, grossMarginPct: 46.15 });
  });
});

describe("gross-margin trend gate", () => {
  const row = (period, grossMarginPct) => ({ period, grossMarginPct });

  it("passes only on strict three-quarter improvement", () => {
    const result = evaluateGrossMarginTrend(
      [row("2025-Q4", 30), row("2026-Q1", 31), row("2026-Q2", 32)],
      ["2025-Q4", "2026-Q1", "2026-Q2"]
    );
    expect(result.status).toBe("pass");
  });

  it("fails flat or declining sequences", () => {
    const result = evaluateGrossMarginTrend(
      [row("2025-Q4", 30), row("2026-Q1", 30), row("2026-Q2", 32)],
      ["2025-Q4", "2026-Q1", "2026-Q2"]
    );
    expect(result.status).toBe("fail");
  });

  it("returns insufficient when any expected quarter is missing", () => {
    const result = evaluateGrossMarginTrend(
      [row("2025-Q4", 30), row("2026-Q2", 32)],
      ["2025-Q4", "2026-Q1", "2026-Q2"]
    );
    expect(result.status).toBe("insufficient");
  });
});
