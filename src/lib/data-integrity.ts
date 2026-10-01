import type { AppState } from "./types";
import { exactTimeWeightedReturn } from "./performance";

export type DataIntegritySeverity = "warning" | "info";
export type DataIntegrityActionTarget = "holdings" | "activity" | "performance" | "historical_csv";

export interface DataIntegrityAction {
  label: string;
  target: DataIntegrityActionTarget;
}

export interface DataIntegrityItem {
  id:
    | "future_activities"
    | "future_snapshots"
    | "tw_price_provenance"
    | "tw_future_price_date"
    | "twr_missing_boundary"
    | "twr_ambiguous_order"
    | "snapshot_missing_today"
    | "legacy_csv_batch"
    | "legacy_csv_filename"
    | "manual_us_price";
  severity: DataIntegritySeverity;
  title: string;
  detail: string;
  count: number;
  examples: string[];
  action: DataIntegrityAction;
}

export interface DataIntegrityReport {
  today: string;
  warningCount: number;
  infoCount: number;
  items: DataIntegrityItem[];
}

function examples(values: string[], limit = 3) {
  return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function accountLabel(account?: string) {
  return account?.trim() || "預設帳戶";
}

function holdingLabel(symbol: string, account?: string) {
  return `${symbol} · ${accountLabel(account)}`;
}

function activityLabel(activity: AppState["activities"][number]) {
  const symbol = activity.symbol.trim();
  return [
    activity.date + (activity.time ? ` ${activity.time}` : ""),
    activity.type,
    symbol || null,
    accountLabel(activity.account)
  ].filter(Boolean).join(" · ");
}

function latestSnapshotOnOrBefore(state: AppState, today: string) {
  return [...state.snapshots]
    .filter((snapshot) => snapshot.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

export function portfolioDataIntegrity(
  state: AppState,
  today: string
): DataIntegrityReport {
  const items: DataIntegrityItem[] = [];

  const futureActivities = state.activities.filter((activity) => activity.date > today);
  if (futureActivities.length) {
    items.push({
      id: "future_activities",
      severity: "warning",
      title: "有未來日期的交易／現金流",
      detail: "目前績效計算會排除未來日期資料；請檢查是否誤輸入日期。",
      count: futureActivities.length,
      examples: examples(futureActivities.map(activityLabel)),
      action: { label: "查看交易紀錄", target: "activity" }
    });
  }

  const futureSnapshots = state.snapshots.filter((snapshot) => snapshot.date > today);
  if (futureSnapshots.length) {
    items.push({
      id: "future_snapshots",
      severity: "warning",
      title: "有未來日期的淨值快照",
      detail: "未來快照不應參與今天的績效時間線，建議先確認裝置日期或舊備份內容。",
      count: futureSnapshots.length,
      examples: examples(futureSnapshots.map((snapshot) => snapshot.date)),
      action: { label: "查看績效快照", target: "performance" }
    });
  }

  const twInvestments = state.holdings.filter(
    (holding) => holding.market === "TW" && holding.type !== "cash"
  );
  const twWithoutOfficialPrice = twInvestments.filter(
    (holding) =>
      (holding.priceSource !== "TWSE" && holding.priceSource !== "TPEx") ||
      !holding.priceAsOf
  );
  if (twWithoutOfficialPrice.length) {
    items.push({
      id: "tw_price_provenance",
      severity: "warning",
      title: "台股價格缺少官方來源或資料日",
      detail: "這些部位仍可估值，但目前價格無法驗證為 TWSE／TPEx 的具日期官方收盤價。",
      count: twWithoutOfficialPrice.length,
      examples: examples(twWithoutOfficialPrice.map((holding) => holdingLabel(holding.symbol, holding.account))),
      action: { label: "前往持股更新", target: "holdings" }
    });
  }

  const twFuturePriceDates = twInvestments.filter(
    (holding) => Boolean(holding.priceAsOf && holding.priceAsOf > today)
  );
  if (twFuturePriceDates.length) {
    items.push({
      id: "tw_future_price_date",
      severity: "warning",
      title: "台股價格來源日期晚於今天",
      detail: "官方價格資料日不應落在目前日期之後；請重新更新行情或檢查備份資料。",
      count: twFuturePriceDates.length,
      examples: examples(twFuturePriceDates.map((holding) => `${holdingLabel(holding.symbol, holding.account)} · ${holding.priceAsOf}`)),
      action: { label: "前往持股檢查", target: "holdings" }
    });
  }

  const externalFlowsThroughToday = state.activities.filter(
    (activity) =>
      (activity.type === "deposit" || activity.type === "withdrawal") &&
      activity.date <= today
  );
  const missingTwrBoundaries = externalFlowsThroughToday.filter(
    (activity) => activity.preFlowValueTwd === undefined
  );
  if (missingTwrBoundaries.length) {
    items.push({
      id: "twr_missing_boundary",
      severity: "warning",
      title: "Exact TWR 還缺現金流前淨值",
      detail: "部分入金／出金沒有事件前淨值，因此 Exact TWR 目前只能維持 insufficient／fallback 狀態。",
      count: missingTwrBoundaries.length,
      examples: examples(missingTwrBoundaries.map(activityLabel)),
      action: { label: "補 TWR 邊界", target: "activity" }
    });
  }

  const exactTwr = exactTimeWeightedReturn(state, today);
  if (exactTwr.ambiguousDates.length) {
    items.push({
      id: "twr_ambiguous_order",
      severity: "warning",
      title: "同日多筆外部現金流缺少唯一排序",
      detail: "同一天多筆入金／出金需要不同時間，否則無法建立可驗證的 Exact TWR 邊界順序。",
      count: exactTwr.ambiguousDates.length,
      examples: examples(exactTwr.ambiguousDates),
      action: { label: "補現金流時間", target: "activity" }
    });
  }

  if (state.holdings.length) {
    const latestSnapshot = latestSnapshotOnOrBefore(state, today);
    if (!latestSnapshot || latestSnapshot.date < today) {
      items.push({
        id: "snapshot_missing_today",
        severity: "warning",
        title: "今天尚未留下最新淨值快照",
        detail: latestSnapshot
          ? `目前最近快照是 ${latestSnapshot.date}；今天的資產狀態還沒進入歷史淨值時間線。`
          : "目前有持股，但尚沒有可用的淨值快照歷史。",
        count: 1,
        examples: [latestSnapshot ? `最近快照 ${latestSnapshot.date}` : "無可用快照"],
        action: { label: "查看績效快照", target: "performance" }
      });
    }
  }

  const importedHistoricalTrades = state.activities.filter(
    (activity) => activity.historicalTrade?.importSource === "csv"
  );
  const legacyWithoutBatch = importedHistoricalTrades.filter(
    (activity) => !activity.historicalTrade?.importBatchId
  );
  if (legacyWithoutBatch.length) {
    items.push({
      id: "legacy_csv_batch",
      severity: "info",
      title: "部分舊 CSV 歷史交易沒有 batch ID",
      detail: "這些 V0.66／V0.67 舊資料仍可正常使用，但無法使用 V0.68+ 的整批撤銷與批次稽核功能。",
      count: legacyWithoutBatch.length,
      examples: examples(legacyWithoutBatch.map(activityLabel)),
      action: { label: "查看歷史 CSV", target: "historical_csv" }
    });
  }

  const legacyWithoutFilename = importedHistoricalTrades.filter(
    (activity) => !activity.historicalTrade?.importFileName
  );
  if (legacyWithoutFilename.length) {
    items.push({
      id: "legacy_csv_filename",
      severity: "info",
      title: "部分 CSV 歷史交易沒有來源檔名",
      detail: "這不影響計算，但稽核時無法直接知道原始匯入檔名；系統不會猜測補值。",
      count: legacyWithoutFilename.length,
      examples: examples(legacyWithoutFilename.map(activityLabel)),
      action: { label: "查看歷史 CSV", target: "historical_csv" }
    });
  }

  const manualUsPrices = state.holdings.filter(
    (holding) => holding.market === "US" && holding.type !== "cash"
  );
  if (manualUsPrices.length) {
    items.push({
      id: "manual_us_price",
      severity: "info",
      title: "美股價格目前屬手動維護",
      detail: "零成本模式尚未接入授權清楚的美股即時／收盤價來源，這些部位需由你自行確認價格。",
      count: manualUsPrices.length,
      examples: examples(manualUsPrices.map((holding) => holdingLabel(holding.symbol, holding.account))),
      action: { label: "前往持股確認", target: "holdings" }
    });
  }

  return {
    today,
    warningCount: items.filter((item) => item.severity === "warning").length,
    infoCount: items.filter((item) => item.severity === "info").length,
    items
  };
}
