import Papa from "papaparse";
import { portfolioCashSummary, portfolioSummary, topHoldings } from "./calc";
import { buildDailyHoldingDrivers, summarizeDailyHoldingDrivers } from "./daily-drivers";
import type { TwQuoteCache } from "./market-data";
import {
  activityAmountTwd,
  exactTimeWeightedReturn,
  modifiedDietzReturn,
  portfolioXirr
} from "./performance";
import { buildPortfolioRiskNotices, calculatePortfolioRisk } from "./portfolio-risk";
import type { AppState } from "./types";
import { analyzeUsdFxAttribution } from "./usd-fx-attribution";

export type PortfolioReportFilters = {
  account?: string | null;
  month?: string;
};

export type PortfolioReport = {
  scope: {
    account: string | null;
    historicalMonth: boolean;
    valuationAsOf: string;
    performanceIsPortfolioWide: boolean;
  };
  asOf: string;
  monthKey: string;
  summary: {
    totalTwd: number;
    costTwd: number;
    unrealizedGainTwd: number;
    unrealizedGainPct: number;
    cashTwd: number;
    cashPct: number;
  };
  performance: {
    exactTwrStatus: "exact" | "insufficient";
    exactTwrPct: number | null;
    exactTwrStartDate: string | null;
    twrProxyPct: number | null;
    xirrPct: number | null;
  };
  month: {
    activityCount: number;
    depositsTwd: number;
    withdrawalsTwd: number;
    dividendsTwd: number;
    standaloneFeesTwd: number;
    buyCount: number;
    sellCount: number;
  };
  daily: {
    date: string;
    totalImpactTwd: number;
    matchedHoldings: number;
    eligibleHoldings: number;
    topPositive: { symbol: string; name: string; impactTwd: number } | null;
    topNegative: { symbol: string; name: string; impactTwd: number } | null;
  } | null;
  risk: {
    riskCoveragePct: number;
    largestCompany: { symbol: string; name: string; portfolioPct: number } | null;
    largestSector: { label: string; portfolioPct: number } | null;
    top5CompanyPct: number;
    notices: ReturnType<typeof buildPortfolioRiskNotices>;
  };
  usdFxAttribution: ReturnType<typeof analyzeUsdFxAttribution>;
  topHoldings: Array<{
    symbol: string;
    name: string;
    account: string;
    valueTwd: number;
    portfolioPct: number;
  }>;
};

function monthKey(date: string) {
  return date.slice(0, 7);
}

function accountName(value?: string) {
  return value?.trim() || "預設帳戶";
}

export function buildPortfolioReport(
  state: AppState,
  asOf: string,
  quotes?: TwQuoteCache | null,
  filters: PortfolioReportFilters = {}
): PortfolioReport {
  const account = filters.account?.trim() || null;
  const reportMonth = filters.month ?? monthKey(asOf);
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(reportMonth) || reportMonth > monthKey(asOf)) {
    throw new Error("報告月份格式無效，或晚於估值日。");
  }
  const scopedHoldings = account === null
    ? state.holdings
    : state.holdings.filter((holding) => accountName(holding.account) === account);
  const scopedActivities = account === null
    ? state.activities
    : state.activities.filter((activity) => accountName(activity.account) === account);
  // Today/current stored values are NOT a historical month-end snapshot.
  // Individual account NAV boundaries are not stored, so TWR/XIRR must
  // remain unavailable rather than reuse all-portfolio performance.
  const summary = portfolioSummary(scopedHoldings, state.usdTwd);
  const cash = portfolioCashSummary(scopedHoldings, state.usdTwd);
  const exactTwr = account === null ? exactTimeWeightedReturn(state, asOf) : null;
  const twrProxy = account === null ? modifiedDietzReturn(state, asOf) : null;
  const xirr = account === null ? portfolioXirr(state, asOf) : null;
  const risk = calculatePortfolioRisk(scopedHoldings, state.etfCompositions, state.usdTwd);
  // Retain all activity records to detect cross-account transfers; only
  // holdings within the selected account enter the attributed total.
  const usdFxAttribution = analyzeUsdFxAttribution(scopedHoldings, state.activities, state.usdTwd, asOf);
  const monthActivities = scopedActivities.filter((activity) =>
    activity.date <= asOf && monthKey(activity.date) === reportMonth
  );

  const month = monthActivities.reduce<PortfolioReport["month"]>((result, activity) => {
    const amountTwd = activityAmountTwd(activity);
    result.activityCount += 1;
    if (activity.type === "deposit") result.depositsTwd += amountTwd;
    if (activity.type === "withdrawal") result.withdrawalsTwd += amountTwd;
    if (activity.type === "dividend") result.dividendsTwd += amountTwd;
    if (activity.type === "fee") result.standaloneFeesTwd += amountTwd;
    if (activity.type === "buy") result.buyCount += 1;
    if (activity.type === "sell") result.sellCount += 1;
    return result;
  }, {
    activityCount: 0,
    depositsTwd: 0,
    withdrawalsTwd: 0,
    dividendsTwd: 0,
    standaloneFeesTwd: 0,
    buyCount: 0,
    sellCount: 0
  });

  const driverResult = quotes ? buildDailyHoldingDrivers(scopedHoldings, quotes) : null;
  const driverSummary = driverResult ? summarizeDailyHoldingDrivers(driverResult.rows) : null;
  const daily = driverResult?.latestDate && driverSummary
    ? {
        date: driverResult.latestDate,
        totalImpactTwd: driverSummary.netImpactTwd,
        matchedHoldings: driverResult.matchedHoldings,
        eligibleHoldings: driverResult.eligibleHoldings,
        topPositive: driverSummary.topPositive
          ? {
              symbol: driverSummary.topPositive.symbol,
              name: driverSummary.topPositive.name,
              impactTwd: driverSummary.topPositive.impactTwd
            }
          : null,
        topNegative: driverSummary.topNegative
          ? {
              symbol: driverSummary.topNegative.symbol,
              name: driverSummary.topNegative.name,
              impactTwd: driverSummary.topNegative.impactTwd
            }
          : null
      }
    : null;

  return {
    asOf,
    monthKey: reportMonth,
    scope: {
      account,
      historicalMonth: reportMonth !== monthKey(asOf),
      valuationAsOf: asOf,
      performanceIsPortfolioWide: account === null
    },
    summary: {
      totalTwd: summary.total,
      costTwd: summary.cost,
      unrealizedGainTwd: summary.gain,
      unrealizedGainPct: summary.gainPct,
      cashTwd: cash.cash,
      cashPct: cash.cashPct
    },
    performance: {
      exactTwrStatus: exactTwr?.status ?? "insufficient",
      exactTwrPct: exactTwr?.value == null ? null : exactTwr.value * 100,
      exactTwrStartDate: exactTwr?.startDate ?? null,
      twrProxyPct: twrProxy === null ? null : twrProxy * 100,
      xirrPct: xirr === null ? null : xirr * 100
    },
    month,
    daily,
    risk: {
      riskCoveragePct: risk.riskCoveragePct,
      largestCompany: risk.largestCompany
        ? {
            symbol: risk.largestCompany.symbol,
            name: risk.largestCompany.name,
            portfolioPct: risk.largestCompany.portfolioPct
          }
        : null,
      largestSector: risk.largestSector
        ? {
            label: risk.largestSector.label,
            portfolioPct: risk.largestSector.portfolioPct
          }
        : null,
      top5CompanyPct: risk.top5CompanyPct,
      notices: buildPortfolioRiskNotices(risk)
    },
    usdFxAttribution,
    topHoldings: topHoldings(scopedHoldings, state.usdTwd, 10).map((row) => ({
      symbol: row.holding.symbol,
      name: row.holding.name,
      account: accountName(row.holding.account),
      valueTwd: row.value,
      portfolioPct: row.pct
    }))
  };
}

function pct(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function twd(value: number) {
  return `TWD ${Math.round(value).toLocaleString("zh-TW")}`;
}

export function portfolioReportToCsv(report: PortfolioReport) {
  const rows: Array<{ section: string; metric: string; value: string; detail: string }> = [
    { section: "篩選條件", metric: "帳戶", value: report.scope.account ?? "全部帳戶", detail: "" },
    { section: "篩選條件", metric: "活動月份", value: report.monthKey, detail: "" },
    { section: "篩選條件", metric: "持股估值日期", value: report.scope.valuationAsOf, detail: "現在的持股，不是歷史月底庫存" },
    { section: "篩選條件", metric: "績效範圍", value: report.scope.performanceIsPortfolioWide ? "全組合、截至估值日" : "帳戶級無完整淨值邊界，無法計算", detail: "" },
    { section: "總覽", metric: "資料日", value: report.asOf, detail: "" },
    { section: "總覽", metric: "總資產淨值", value: String(report.summary.totalTwd), detail: "TWD" },
    { section: "總覽", metric: "未實現損益", value: String(report.summary.unrealizedGainTwd), detail: pct(report.summary.unrealizedGainPct) },
    { section: "總覽", metric: "現金", value: String(report.summary.cashTwd), detail: pct(report.summary.cashPct) },
    { section: "績效", metric: "Exact TWR", value: pct(report.performance.exactTwrPct), detail: report.performance.exactTwrStatus },
    { section: "績效", metric: "TWR Proxy", value: pct(report.performance.twrProxyPct), detail: "Modified Dietz" },
    { section: "績效", metric: "XIRR", value: pct(report.performance.xirrPct), detail: "" },
    { section: report.monthKey, metric: "入金", value: String(report.month.depositsTwd), detail: "TWD" },
    { section: report.monthKey, metric: "出金", value: String(report.month.withdrawalsTwd), detail: "TWD" },
    { section: report.monthKey, metric: "股息", value: String(report.month.dividendsTwd), detail: "TWD" },
    { section: report.monthKey, metric: "獨立費用", value: String(report.month.standaloneFeesTwd), detail: "TWD" },
    { section: "風險", metric: "曝險覆蓋率", value: pct(report.risk.riskCoveragePct), detail: "" },
    { section: "風險", metric: "最大單一公司", value: report.risk.largestCompany ? pct(report.risk.largestCompany.portfolioPct) : "—", detail: report.risk.largestCompany ? `${report.risk.largestCompany.symbol} ${report.risk.largestCompany.name}` : "" },
    { section: "風險", metric: "最大產業", value: report.risk.largestSector ? pct(report.risk.largestSector.portfolioPct) : "—", detail: report.risk.largestSector?.label ?? "" }
  ];

  rows.push(
    { section: "外幣成本完整度", metric: "美元證券部位", value: String(report.usdFxAttribution.eligibleCount), detail: "不含現金" },
    { section: "外幣成本完整度", metric: "可拆分部位", value: String(report.usdFxAttribution.explainedCount), detail: "完整連動交易鏈" },
    { section: "外幣成本完整度", metric: "缺資料部位", value: String(report.usdFxAttribution.unknownCount), detail: "不納入股價／匯率估算" },
    { section: "外幣成本完整度", metric: "已核對部位現值", value: String(report.usdFxAttribution.explainedValueTwd), detail: "TWD，目前參考匯率估值；不是損益" },
    { section: "外幣成本完整度", metric: "未核對部位現值", value: String(report.usdFxAttribution.unknownValueTwd), detail: "TWD，目前參考匯率估值；不是未知損益額" },
    { section: "外幣成本完整度", metric: "全部美元證券現值", value: String(report.usdFxAttribution.eligibleValueTwd), detail: "TWD，不含美元現金" },
    { section: "外幣成本完整度", metric: "已核對歷史參考成本", value: report.usdFxAttribution.explainedCount ? String(report.usdFxAttribution.recordedCostTwd) : "資料不足", detail: "TWD；只含完整交易鏈的持股" },
    { section: "外幣損益參考估算", metric: "已核對股價影響", value: report.usdFxAttribution.explainedCount ? String(report.usdFxAttribution.priceImpactTwd) : "資料不足", detail: "TWD，使用目前參考匯率" },
    { section: "外幣損益參考估算", metric: "已核對匯率影響", value: report.usdFxAttribution.explainedCount ? String(report.usdFxAttribution.fxImpactTwd) : "資料不足", detail: "TWD，買進時記錄的參考匯率，不代表實際換匯損益" },
    { section: "外幣損益參考估算", metric: "已核對損益合計", value: report.usdFxAttribution.explainedCount ? String(report.usdFxAttribution.combinedGainTwd) : "資料不足", detail: "TWD，僅持有部位，未涵蓋未核對部位" }
  );
  report.usdFxAttribution.rows.forEach((item) => {
    rows.push({
      section: "美元部位來源",
      metric: `${item.symbol} ${item.name} · ${item.account}`,
      value: item.combinedGainTwd === null ? "資料不足" : String(item.combinedGainTwd),
      detail: item.combinedGainTwd === null ? item.reason
        : `股價 ${item.priceImpactTwd}／匯率 ${item.fxImpactTwd}／買進參考 FX ${item.averageRecordedFx}`
    });
    const label = `${item.symbol} ${item.name} · ${item.account}`;
    const verified = item.status === "verified_chain";
    rows.push(
      { section: "美元成本明細", metric: `${label}｜核對狀態`, value: verified ? "完整" : "資料不足", detail: item.reason },
      { section: "美元成本明細", metric: `${label}｜目前股數`, value: String(item.quantity), detail: "股，不等於交易筆數" },
      { section: "美元成本明細", metric: `${label}｜目前部位現值`, value: String(item.marketValueTwd), detail: "TWD，不是損益" },
      { section: "美元成本明細", metric: `${label}｜已核對台幣參考成本`, value: verified ? String(item.recordedCostTwd) : "資料不足", detail: "不完整時不以今天匯率填入" },
      { section: "美元成本明細", metric: `${label}｜買進／賣出事件`, value: verified ? `${item.buyCount}／${item.saleCount}` : "資料不足", detail: "只統計通過完整來源核對的事件" },
      { section: "美元成本明細", metric: `${label}｜平均買進參考 FX`, value: verified ? String(item.averageRecordedFx) : "資料不足", detail: "TWD/USD，非實際換匯執行率" }
    );
  });

  if (report.daily) {
    rows.push(
      { section: "最新交易日", metric: "持倉淨影響估算", value: String(report.daily.totalImpactTwd), detail: `${report.daily.date} · TWD` },
      { section: "最新交易日", metric: "最大推升", value: report.daily.topPositive ? String(report.daily.topPositive.impactTwd) : "—", detail: report.daily.topPositive ? `${report.daily.topPositive.symbol} ${report.daily.topPositive.name}` : "" },
      { section: "最新交易日", metric: "最大拖累", value: report.daily.topNegative ? String(report.daily.topNegative.impactTwd) : "—", detail: report.daily.topNegative ? `${report.daily.topNegative.symbol} ${report.daily.topNegative.name}` : "" }
    );
  }

  report.topHoldings.forEach((holding, index) => {
    rows.push({
      section: "持股",
      metric: `#${index + 1} ${holding.symbol} ${holding.name}`,
      value: String(holding.valueTwd),
      detail: `${holding.account} · ${pct(holding.portfolioPct)}`
    });
  });

  report.risk.notices.forEach((notice) => {
    rows.push({
      section: "提醒",
      metric: notice.title,
      value: notice.severity,
      detail: notice.detail
    });
  });

  return Papa.unparse(rows);
}

export function portfolioReportToMarkdown(report: PortfolioReport) {
  const lines = [
    "# PortfolioPilot 投資報告",
    "",
    `資料日：${report.asOf}`,
    `帳戶：${report.scope.account ?? "全部帳戶"}`,
    `活動月份：${report.monthKey}`,
    `持股估值：${report.scope.valuationAsOf} 的目前部位，非歷史月底庫存`,
    `績效範圍：${report.scope.performanceIsPortfolioWide ? "全組合，截至報告估值日" : "帳戶級資料不足，TWR／XIRR 不計算"}`,
    "",
    "## 總覽",
    `- 總資產淨值：${twd(report.summary.totalTwd)}`,
    `- 未實現損益：${twd(report.summary.unrealizedGainTwd)}（${pct(report.summary.unrealizedGainPct)}）`,
    `- 現金：${twd(report.summary.cashTwd)}（${pct(report.summary.cashPct)}）`,
    "",
    "## 績效",
    `- Exact TWR：${pct(report.performance.exactTwrPct)}（${report.performance.exactTwrStatus}）`,
    `- TWR Proxy：${pct(report.performance.twrProxyPct)}`,
    `- XIRR：${pct(report.performance.xirrPct)}`,
    "",
    `## ${report.monthKey} 活動`,
    `- 入金：${twd(report.month.depositsTwd)}`,
    `- 出金：${twd(report.month.withdrawalsTwd)}`,
    `- 股息：${twd(report.month.dividendsTwd)}`,
    `- 獨立費用：${twd(report.month.standaloneFeesTwd)}`,
    `- 買進／賣出筆數：${report.month.buyCount} / ${report.month.sellCount}`,
    "",
    "## 風險曝險",
    `- 證券曝險覆蓋率：${pct(report.risk.riskCoveragePct)}`,
    `- 最大公司：${report.risk.largestCompany ? `${report.risk.largestCompany.symbol} ${report.risk.largestCompany.name} · ${pct(report.risk.largestCompany.portfolioPct)}` : "—"}`,
    `- 最大產業：${report.risk.largestSector ? `${report.risk.largestSector.label} · ${pct(report.risk.largestSector.portfolioPct)}` : "—"}`,
    ""
  ];

  lines.push(
    "## 美元證券成本與匯率參考拆分",
    `- 可完整核對：${report.usdFxAttribution.explainedCount}/${report.usdFxAttribution.eligibleCount} 筆；資料不足 ${report.usdFxAttribution.unknownCount} 筆`,
    `- 已核對股價影響：${(report.usdFxAttribution.explainedCount ? twd(report.usdFxAttribution.priceImpactTwd) : "資料不足")}`,
    `- 已核對匯率影響：${(report.usdFxAttribution.explainedCount ? twd(report.usdFxAttribution.fxImpactTwd) : "資料不足")}`,
    `- 已核對台幣損益參考合計：${(report.usdFxAttribution.explainedCount ? twd(report.usdFxAttribution.combinedGainTwd) : "資料不足")}`,
    "- 僅計算目前持有且連動買賣成本鏈完整的美元證券；沒有推估資料不足的部位。",
    "- 成本匯率來自交易紀錄的參考 FX，不等於實際換匯成交；不含已實現損益、現金匯兌、股息及稅務。",
    "- 本拆分以目前持股／參考匯率估值，並非所選活動月份的單月報酬；舊版未實現損益採現價 FX 換算成本，定義不同。",
    ""
  );
  report.usdFxAttribution.rows.forEach((row) => {
    lines.push(row.combinedGainTwd === null
      ? `- ${row.symbol}（${row.account}）：資料不足｜${row.reason}`
      : `- ${row.symbol}（${row.account}）：股價 ${twd(row.priceImpactTwd!)}／匯率 ${twd(row.fxImpactTwd!)}／合計 ${twd(row.combinedGainTwd)}`);
  });
  lines.push("");

  if (report.daily) {
    lines.push(
      "## 最新交易日持倉影響",
      `- 日期：${report.daily.date}`,
      `- 淨影響估算：${twd(report.daily.totalImpactTwd)}`,
      `- 最大推升：${report.daily.topPositive ? `${report.daily.topPositive.symbol} ${report.daily.topPositive.name} · ${twd(report.daily.topPositive.impactTwd)}` : "—"}`,
      `- 最大拖累：${report.daily.topNegative ? `${report.daily.topNegative.symbol} ${report.daily.topNegative.name} · ${twd(report.daily.topNegative.impactTwd)}` : "—"}`,
      ""
    );
  }

  lines.push("## 最大持股");
  if (report.topHoldings.length) {
    report.topHoldings.forEach((holding, index) => {
      lines.push(`${index + 1}. ${holding.symbol} ${holding.name} — ${twd(holding.valueTwd)}（${pct(holding.portfolioPct)}）· ${holding.account}`);
    });
  } else {
    lines.push("- 尚無投資標的");
  }

  lines.push("", "## 注意提醒");
  if (report.risk.notices.length) {
    report.risk.notices.forEach((notice) => lines.push(`- ${notice.title}：${notice.detail}`));
  } else {
    lines.push("- 目前沒有觸發 PortfolioPilot 的集中度注意閾值。");
  }

  lines.push(
    "",
    "---",
    "本報告由 PortfolioPilot 依本機持股、交易紀錄與可用官方資料產生；不是投資建議。"
  );

  return lines.join("\n");
}
