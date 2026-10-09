import { describe, expect, it } from "vitest";
import type { TwQuoteCache } from "./market-data";
import {
  buildPortfolioReport,
  portfolioReportToCsv,
  portfolioReportToMarkdown
} from "./portfolio-report";
import type { AppState } from "./types";

const state: AppState = {
  dataMode: "personal",
  usdTwd: 32,
  holdings: [
    {
      id: "stock",
      symbol: "2330",
      name: "台積電",
      market: "TW",
      type: "stock",
      quantity: 2,
      price: 1000,
      averageCost: 900,
      currency: "TWD",
      sector: "半導體",
      account: "台股"
    },
    {
      id: "cash",
      symbol: "CASH-TWD",
      name: "台幣現金",
      market: "TW",
      type: "cash",
      quantity: 1,
      price: 1000,
      averageCost: 1000,
      currency: "TWD",
      sector: "現金",
      account: "銀行"
    }
  ],
  etfCompositions: [],
  watchlist: [],
  journal: [],
  activities: [
    {
      id: "deposit",
      date: "2026-10-01",
      type: "deposit",
      symbol: "",
      amount: 500,
      currency: "TWD",
      fxRate: 1,
      quantity: 0,
      price: 0,
      note: "本月入金"
    },
    {
      id: "dividend",
      date: "2026-10-03",
      type: "dividend",
      symbol: "2330",
      amount: 100,
      currency: "TWD",
      fxRate: 1,
      quantity: 0,
      price: 0,
      note: "股息"
    },
    {
      id: "fee",
      date: "2026-10-04",
      type: "fee",
      symbol: "",
      amount: 20,
      currency: "TWD",
      fxRate: 1,
      quantity: 0,
      price: 0,
      note: "費用"
    }
  ],
  snapshots: [
    { date: "2026-09-30", total: 2700, cost: 2600, gain: 100, usdTwd: 32 },
    { date: "2026-10-05", total: 2950, cost: 2800, gain: 150, usdTwd: 32 }
  ],
  allocationTargets: []
};

const quotes: TwQuoteCache = {
  generatedAt: "2026-10-06T06:00:00.000Z",
  sources: [],
  quotes: [
    {
      code: "2330",
      name: "台積電",
      market: "TWSE",
      close: 1000,
      change: 20,
      changePct: 2.04,
      date: "2026-10-06"
    }
  ]
};

describe("portfolio report", () => {
  it("builds a local report from portfolio, activity, risk and official closing quotes", () => {
    const report = buildPortfolioReport(state, "2026-10-06", quotes);

    expect(report.summary.totalTwd).toBe(3000);
    expect(report.summary.costTwd).toBe(2800);
    expect(report.summary.unrealizedGainTwd).toBe(200);
    expect(report.summary.cashTwd).toBe(1000);
    expect(report.month.depositsTwd).toBe(500);
    expect(report.month.dividendsTwd).toBe(100);
    expect(report.month.standaloneFeesTwd).toBe(20);
    expect(report.daily?.date).toBe("2026-10-06");
    expect(report.daily?.totalImpactTwd).toBe(40);
    expect(report.daily?.topPositive?.symbol).toBe("2330");
    expect(report.risk.riskCoveragePct).toBe(100);
    expect(report.risk.largestCompany?.symbol).toBe("2330");
    expect(report.topHoldings[0]?.portfolioPct).toBeCloseTo(2000 / 3000 * 100);
  });

  it("exports the same report as CSV and Markdown without adding a backend", () => {
    const report = buildPortfolioReport(state, "2026-10-06", quotes);
    const csv = portfolioReportToCsv(report);
    const markdown = portfolioReportToMarkdown(report);

    expect(csv).toContain("總資產淨值");
    expect(csv).toContain("2330");
    expect(markdown).toContain("# PortfolioPilot 投資報告");
    expect(markdown).toContain("資料日：2026-10-06");
    expect(markdown).toContain("最大推升：2330 台積電");
  });

  it("filters report holdings and quoted drivers by account, never exporting global TWR as account TWR", () => {
    const perAccount = buildPortfolioReport(state, "2026-10-06", quotes, {
      account: "台股",
      month: "2026-10"
    });
    expect(perAccount.scope.account).toBe("台股");
    expect(perAccount.summary.totalTwd).toBe(2000);
    expect(perAccount.summary.cashTwd).toBe(0);
    expect(perAccount.topHoldings).toHaveLength(1);
    expect(perAccount.topHoldings[0]?.symbol).toBe("2330");
    expect(perAccount.topHoldings[0]?.portfolioPct).toBeCloseTo(100);
    expect(perAccount.daily?.totalImpactTwd).toBe(40);
    // Unassigned historical activities belong to the default account,
    // not the stock brokerage account.
    expect(perAccount.month.activityCount).toBe(0);
    expect(perAccount.performance).toMatchObject({
      exactTwrStatus: "insufficient",
      exactTwrPct: null,
      twrProxyPct: null,
      xirrPct: null
    });
    expect(portfolioReportToCsv(perAccount)).toContain("台股");
    expect(portfolioReportToMarkdown(perAccount)).toContain("帳戶級資料不足");
  });

  it("filters earlier month activities without presenting today's holdings as historical month-end NAV", () => {
    const monthly: AppState = {
      ...state,
      activities: [
        ...state.activities,
        { ...state.activities[0]!, id: "older", date: "2026-09-25", amount: 750, account: "台股" },
        { ...state.activities[1]!, id: "older-dividend", date: "2026-09-29", amount: 50, account: "台股" },
        { ...state.activities[0]!, id: "future", date: "2026-10-09", amount: 9999, account: "台股" }
      ]
    };
    const older = buildPortfolioReport(monthly, "2026-10-06", quotes, {
      account: "台股",
      month: "2026-09"
    });
    expect(older.scope.historicalMonth).toBe(true);
    expect(older.month).toMatchObject({
      depositsTwd: 750, dividendsTwd: 50, activityCount: 2
    });
    expect(older.summary.totalTwd).toBe(2000); // Current holdings, NOT 2026-09 NAV.
    expect(older.scope.valuationAsOf).toBe("2026-10-06");
    expect(portfolioReportToCsv(older)).toContain("不是歷史月底庫存");
    expect(portfolioReportToMarkdown(older)).toContain("活動月份：2026-09");
    expect(portfolioReportToMarkdown(older)).toContain("非歷史月底庫存");
  });

  it("keeps whole-portfolio performance untouched when only the monthly activity view changes", () => {
    const baseline = buildPortfolioReport(state, "2026-10-06", quotes);
    const selected = buildPortfolioReport(state, "2026-10-06", quotes, { month: "2026-09" });
    expect(selected.summary).toEqual(baseline.summary);
    expect(selected.performance).toEqual(baseline.performance);
    expect(selected.month.activityCount).toBe(0);
    expect(selected.scope.performanceIsPortfolioWide).toBe(true);
  });

  it("maps an absent account to empty current holdings without borrowing other accounts' figures", () => {
    const report = buildPortfolioReport(state, "2026-10-06", quotes, {
      account: "尚未使用的新帳戶",
      month: "2026-10"
    });
    expect(report.summary.totalTwd).toBe(0);
    expect(report.topHoldings).toEqual([]);
    expect(report.month.activityCount).toBe(0);
    expect(report.daily?.totalImpactTwd ?? 0).toBe(0);
    expect(report.performance.exactTwrPct).toBeNull();
  });

  it("rejects malformed and future activity month requests", () => {
    expect(() => buildPortfolioReport(state, "2026-10-06", null, { month: "2026-11" })).toThrow(/月份/);
    expect(() => buildPortfolioReport(state, "2026-10-06", null, { month: "2026-13" })).toThrow(/月份/);
    expect(() => buildPortfolioReport(state, "2026-10-06", null, { month: "test" })).toThrow(/月份/);
  });

  it("reports verified USD remaining-share price/FX attribution while preserving original portfolio summary", () => {
    const us = {
      id: "qqqm", symbol: "QQQM", name: "QQQM", market: "US" as const,
      currency: "USD" as const, type: "etf" as const, sector: "ETF",
      quantity: 10, price: 120, averageCost: 100, account: "美股"
    };
    const usState: AppState = {
      ...state,
      holdings: [...state.holdings, us],
      activities: [...state.activities, {
        id: "qqqm-open", date: "2026-10-01", type: "buy", symbol: "QQQM",
        currency: "USD", quantity: 10, price: 100, amount: 1000, fxRate: 30,
        note: "", account: "美股",
        inventoryImpact: {
          kind: "trade", holdingId: "qqqm", before: null,
          after: { ...us, price: 100 }, fee: 0, tax: 0,
          realizedPnl: 0, method: "average_cost"
        }
      }]
    };
    const report = buildPortfolioReport(usState, "2026-10-06", null, { account: "美股", month: "2026-09" });
    expect(report.scope.historicalMonth).toBe(true);
    expect(report.summary.totalTwd).toBe(38400);
    expect(report.summary.unrealizedGainTwd).toBe(6400); // Legacy current-FX convention.
    expect(report.usdFxAttribution).toMatchObject({
      eligibleCount: 1, explainedCount: 1, unknownCount: 0,
      priceImpactTwd: 6400, fxImpactTwd: 2000, combinedGainTwd: 8400
    });
    const csv = portfolioReportToCsv(report);
    const md = portfolioReportToMarkdown(report);
    expect(csv).toContain("已核對匯率影響");
    expect(csv).toContain("2000");
    expect(md).toContain("交易紀錄的參考 FX");
    expect(md).toContain("並非所選活動月份的單月報酬");
  });

  it("never turns unknown FX provenance into zero-gain claims", () => {
    const us = {
      id: "qqqm-import", symbol: "QQQM", name: "QQQM", market: "US" as const,
      currency: "USD" as const, type: "etf" as const, sector: "ETF",
      quantity: 3, price: 120, averageCost: 100, account: "美股"
    };
    const report = buildPortfolioReport({ ...state, holdings: [us] }, "2026-10-06", null);
    expect(report.usdFxAttribution).toMatchObject({
      eligibleCount: 1, explainedCount: 0, unknownCount: 1, unknownValueTwd: 11520
    });
    expect(report.usdFxAttribution.rows[0]?.combinedGainTwd).toBeNull();
    expect(portfolioReportToCsv(report)).toContain("資料不足");
    expect(portfolioReportToMarkdown(report)).toContain("缺少可銜接到目前持股");
  });

  it("still generates a report when the optional closing-quote cache is unavailable", () => {
    const report = buildPortfolioReport(state, "2026-10-06", null);
    expect(report.daily).toBeNull();
    expect(report.summary.totalTwd).toBe(3000);
  });
});
