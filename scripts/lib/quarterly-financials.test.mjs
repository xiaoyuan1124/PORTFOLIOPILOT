import { describe, expect, it } from "vitest";
import {
  deriveSingleQuarterRows,
  evaluateGrossMarginTrend,
  isTransientMopsRequestError,
  parseMopsQuarterlyHtml,
  retryTransientMopsRequest
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
  it("extracts optional explicit profit and EPS columns, excluding ambiguous continuing-operation profit",()=>{
    const html='<table><tr>'+["公司代號","公司名稱","營業收入","營業成本","營業毛利（毛損）","營業利益（損失）","本期淨利（淨損）","基本每股盈餘（元）"].map(v=>'<th>'+v+'</th>').join("")+'</tr><tr>'+["2330","測試","1000","600","400","200","(50)","-0.50"].map(v=>'<td>'+v+'</td>').join("")+'</tr></table>';
    expect(parseMopsQuarterlyHtml(html).generalRows[0]).toMatchObject({operatingIncome:200,netIncome:-50,cumulativeEps:-0.5});
    expect(parseMopsQuarterlyHtml(html.replace("本期淨利（淨損）","繼續營業單位本期淨利")).generalRows[0].netIncome).toBeUndefined();
  });
  it("derives additive profits but never subtracts cumulative EPS; missing prior stays unknown",()=>{
    const current={code:"2330",name:"A",revenue:250,operatingCost:150,grossProfit:100,operatingIncome:30,netIncome:15,cumulativeEps:1.8};
    const previous={code:"2330",name:"A",revenue:100,operatingCost:60,grossProfit:40,operatingIncome:10,netIncome:20,cumulativeEps:2};
    const row=deriveSingleQuarterRows({currentRows:[current],previousRows:[previous],period:"2026-Q2",market:"TWSE"})[0];
    expect(row).toMatchObject({operatingIncome:20,netIncome:-5,operatingMarginPct:13.33,netMarginPct:-3.33,cumulativeEps:1.8});
    expect(deriveSingleQuarterRows({currentRows:[current],previousRows:[{...previous,operatingIncome:null}],period:"2026-Q2",market:"TWSE"})[0].operatingIncome).toBeUndefined();
  });
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


describe("MOPS transient retry", () => {
  it("retries a transient fetch failure and eventually returns", async () => {
    let calls = 0;
    const sleeps = [];
    const result = await retryTransientMopsRequest(
      async () => {
        calls += 1;
        if (calls < 3) {
          const error = new TypeError("fetch failed");
          error.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
          throw error;
        }
        return "ok";
      },
      {
        attempts: 4,
        baseDelayMs: 100,
        sleepImpl: async (ms) => { sleeps.push(ms); }
      }
    );

    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it("does not retry a schema or completeness error", async () => {
    let calls = 0;
    await expect(retryTransientMopsRequest(
      async () => {
        calls += 1;
        throw new Error("MOPS quarterly financials: general-industry header is missing a required field");
      },
      { sleepImpl: async () => {} }
    )).rejects.toThrow(/header/);
    expect(calls).toBe(1);
  });

  it("retries an empty MOPS statement payload so another official host can be tried", async () => {
    let calls = 0;
    const result = await retryTransientMopsRequest(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error("empty statement"), { code: "MOPS_EMPTY_PAYLOAD" });
        }
        return "fallback-ok";
      },
      { attempts: 2, sleepImpl: async () => {} }
    );
    expect(result).toBe("fallback-ok");
    expect(calls).toBe(2);
  });

  it("treats HTTP 429 and 5xx as transient but not ordinary 4xx", () => {
    expect(isTransientMopsRequestError(Object.assign(new Error("empty"), { code: "MOPS_EMPTY_PAYLOAD" }))).toBe(true);
    expect(isTransientMopsRequestError(Object.assign(new Error("rate limit"), { status: 429 }))).toBe(true);
    expect(isTransientMopsRequestError(Object.assign(new Error("server"), { status: 503 }))).toBe(true);
    expect(isTransientMopsRequestError(Object.assign(new Error("bad request"), { status: 400 }))).toBe(false);
  });
});
