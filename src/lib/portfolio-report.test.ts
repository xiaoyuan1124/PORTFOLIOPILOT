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

  it("still generates a report when the optional closing-quote cache is unavailable", () => {
    const report = buildPortfolioReport(state, "2026-10-06", null);
    expect(report.daily).toBeNull();
    expect(report.summary.totalTwd).toBe(3000);
  });
});
