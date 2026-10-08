import { describe, expect, it } from "vitest";
import { evaluateLocalSmartAlerts, normalizeLocalSmartAlertSettings } from "./smart-alerts";
import type { AppState } from "./types";

const state: AppState = {
  dataMode: "personal",
  usdTwd: 32,
  holdings: [
    {
      id: "2330",
      symbol: "2330",
      name: "台積電",
      market: "TW",
      type: "stock",
      quantity: 8,
      price: 1000,
      averageCost: 800,
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
      price: 2000,
      averageCost: 2000,
      currency: "TWD",
      sector: "現金",
      account: "銀行"
    }
  ],
  etfCompositions: [],
  watchlist: [
    {
      id: "watch-TWSE-0050",
      market: "TW",
      venue: "TWSE",
      symbol: "0050",
      name: "元大台灣50",
      type: "etf",
      industry: "ETF",
      addedAt: "2026-09-01"
    }
  ],
  journal: [],
  activities: [],
  snapshots: [],
  allocationTargets: [
    { key: "TW:2330", label: "2330 · 台積電", targetPct: 60 },
    { key: "CASH:TWD", label: "TWD 現金", targetPct: 40 }
  ]
};

describe("local smart alerts", () => {
  it("stays silent until the user enables alerts", () => {
    const alerts = evaluateLocalSmartAlerts(
      state,
      normalizeLocalSmartAlertSettings({ enabled: false }),
      "2026-10-08"
    );
    expect(alerts).toEqual([]);
  });

  it("builds local risk, allocation and watchlist alerts from portfolio state", () => {
    const alerts = evaluateLocalSmartAlerts(
      state,
      normalizeLocalSmartAlertSettings({
        enabled: true,
        companyExposurePct: 70,
        sectorExposurePct: 70,
        allocationDriftPct: 10,
        watchlistResearchDays: 30
      }),
      "2026-10-08"
    );

    expect(alerts.map((alert) => alert.kind)).toEqual([
      "company",
      "sector",
      "allocation",
      "watchlist"
    ]);
    expect(alerts[0]?.body).toContain("80.0%");
    expect(alerts[2]?.body).toContain("20.0 個百分點");
    expect(alerts[3]?.target).toEqual({
      section: "research",
      researchKey: "TWSE:0050",
      researchType: "etf"
    });
  });

  it("clamps unsafe or malformed user settings", () => {
    const settings = normalizeLocalSmartAlertSettings({
      enabled: true,
      companyExposurePct: -5,
      sectorExposurePct: 500,
      allocationDriftPct: 0,
      watchlistResearchDays: 999,
      monthlyContributionReminder: true,
      monthlyContributionDay: 99
    });

    expect(settings.companyExposurePct).toBe(1);
    expect(settings.sectorExposurePct).toBe(100);
    expect(settings.allocationDriftPct).toBe(0.5);
    expect(settings.watchlistResearchDays).toBe(365);
    expect(settings.monthlyContributionDay).toBe(31);
  });
});
