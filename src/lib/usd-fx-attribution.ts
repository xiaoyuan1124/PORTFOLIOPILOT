import type { Holding, PortfolioActivity } from "./types";
import { accountName } from "./local-data";

export type UsdFxAttributionRow = {
  holdingId: string;
  symbol: string;
  name: string;
  account: string;
  quantity: number;
  marketValueTwd: number;
  status: "verified_chain" | "missing_opening" | "incomplete_chain" | "missing_fx";
  reason: string;
  buyCount: number;
  saleCount: number;
  recordedCostTwd: number | null;
  priceImpactTwd: number | null;
  fxImpactTwd: number | null;
  combinedGainTwd: number | null;
  averageRecordedFx: number | null;
};

export type UsdFxAttributionSummary = {
  eligibleCount: number;
  explainedCount: number;
  unknownCount: number;
  eligibleValueTwd: number;
  explainedValueTwd: number;
  unknownValueTwd: number;
  recordedCostTwd: number;
  priceImpactTwd: number;
  fxImpactTwd: number;
  combinedGainTwd: number;
  rows: UsdFxAttributionRow[];
};

function closeTo(a: number, b: number) {
  return Number.isFinite(a) && Number.isFinite(b) &&
    Math.abs(a - b) <= Math.max(1e-6, 1e-8 * Math.max(Math.abs(a), Math.abs(b)));
}

function identityMatches(a: Holding, b: Holding) {
  return a.id === b.id && a.market === b.market &&
    a.currency === b.currency && a.type === b.type &&
    a.symbol.trim().toUpperCase() === b.symbol.trim().toUpperCase() &&
    accountName(a.account) === accountName(b.account);
}

function snapshotMatches(a: Holding, b: Holding) {
  // Quotes can be refreshed separately from transactions. Quantity, USD cost,
  // identity and account must agree; the stored current price need not.
  return identityMatches(a, b) &&
    closeTo(a.quantity, b.quantity) && closeTo(a.averageCost, b.averageCost);
}

function relevantLegacyRow(activity: PortfolioActivity, holding: Holding) {
  return (activity.type === "buy" || activity.type === "sell") &&
    activity.currency === "USD" &&
    activity.symbol.trim().toUpperCase() === holding.symbol.trim().toUpperCase() &&
    accountName(activity.account) === accountName(holding.account) &&
    !activity.inventoryImpact;
}

/**
 * Reconstruct the cost in TWD of the *remaining* USD security shares, using
 * only a complete managed buy/sell inventory chain. Historical ledger-only
 * imports and manually seeded positions cannot establish a defensible opening
 * TWD basis; do not infer one from a current spot rate or a single old trade.
 *
 * FX is the TWD/USD **reference recorded on a managed trade**, not proven
 * actual conversion execution. The split is an explanatory accounting model:
 * price component valued at current FX; FX component on USD cost basis.
 * It excludes realized P/L, cash FX conversion, dividends and tax reporting.
 */
export function analyzeUsdFxAttribution(
  holdings: Holding[],
  activities: PortfolioActivity[],
  currentUsdTwd: number,
  throughDate: string
): UsdFxAttributionSummary {
  const candidates = holdings.filter((h) =>
    h.market === "US" && h.currency === "USD" && h.type !== "cash"
  );

  const rows = candidates.map((holding): UsdFxAttributionRow => {
    const marketValueTwd = holding.quantity * holding.price * currentUsdTwd;
    const base: UsdFxAttributionRow = {
      holdingId: holding.id,
      symbol: holding.symbol,
      name: holding.name,
      account: accountName(holding.account),
      quantity: holding.quantity,
      marketValueTwd: Number.isFinite(marketValueTwd) ? marketValueTwd : 0,
      status: "missing_opening",
      reason: "缺少可銜接到目前持股的首次買進及匯率成本紀錄",
      buyCount: 0,
      saleCount: 0,
      recordedCostTwd: null,
      priceImpactTwd: null,
      fxImpactTwd: null,
      combinedGainTwd: null,
      averageRecordedFx: null
    };
    if (!Number.isFinite(currentUsdTwd) || currentUsdTwd <= 0 ||
      !Number.isFinite(holding.quantity) || holding.quantity <= 0 ||
      !Number.isFinite(holding.averageCost) || holding.averageCost <= 0 ||
      !Number.isFinite(holding.price) || holding.price < 0) {
      return { ...base, status: "incomplete_chain", reason: "目前持倉或美元參考匯率無效" };
    }

    let tracked: Holding | null = null;
    let recordedTwdCost = 0;
    let lastDate = "";
    let beganAt = "";
    let reason = "";
    let status: UsdFxAttributionRow["status"] = "verified_chain";
    let buyCount = 0;
    let saleCount = 0;

    // Preserve the app's insertion order for events on the same day; managed
    // trading events are appended as they occur.
    for (const activity of activities) {
      const impact = activity.inventoryImpact;
      const touches = impact?.holdingId === holding.id ||
        activity.positionTransferImpact?.sourceHoldingId === holding.id ||
        activity.positionTransferImpact?.destinationHoldingId === holding.id;
      // Imported, unlinked historical trades in the active lot's period are
      // ambiguous. Distinguish a *previous* closed position from this lot.
      if (!touches && !relevantLegacyRow(activity, holding)) continue;

      if (activity.date > throughDate) {
        status = "incomplete_chain";
        reason = "存在晚於目前報告日的相關交易紀錄";
        break;
      }
      if (lastDate && activity.date < lastDate) {
        status = "incomplete_chain";
        reason = "持股連動交易的紀錄順序與日期不一致";
        break;
      }
      lastDate = activity.date;

      if (activity.positionTransferImpact || impact?.kind === "corporate_action") {
        status = "incomplete_chain";
        reason = "部位轉移或股數調整缺少可追溯的匯率成本";
        break;
      }
      if (impact?.kind !== "trade" || impact.holdingId !== holding.id) {
        if (beganAt && activity.date >= beganAt) {
          status = "incomplete_chain";
          reason = "同期間存在未連動庫存的買賣紀錄";
          break;
        }
        continue;
      }
      if (activity.currency !== "USD" || !["buy", "sell"].includes(activity.type) ||
        (impact.before && !identityMatches(impact.before, holding)) ||
        (impact.after && !identityMatches(impact.after, holding))) {
        status = "incomplete_chain";
        reason = "交易幣別、標的或帳戶與目前持股不一致";
        break;
      }

      if (!tracked) {
        if (impact.before !== null || impact.after === null || activity.type !== "buy" || buyCount > 0) {
          status = "missing_opening";
          reason = "交易鏈沒有完整首次建倉資料";
          break;
        }
        beganAt = activity.date;
      } else if (!impact.before || !snapshotMatches(tracked, impact.before)) {
        status = "incomplete_chain";
        reason = "買賣連動的持股數量或成本出現中斷";
        break;
      }

      if (activity.type === "buy") {
        if (!impact.after || !Number.isFinite(activity.fxRate) || activity.fxRate <= 1 + 1e-8) {
          status = "missing_fx";
          reason = "買進缺少可靠的美元兌台幣交易參考匯率";
          break;
        }
        const beforeUsdCost = tracked ? tracked.quantity * tracked.averageCost : 0;
        const afterUsdCost = impact.after.quantity * impact.after.averageCost;
        const costAddedUsd = afterUsdCost - beforeUsdCost;
        if (!Number.isFinite(costAddedUsd) || costAddedUsd <= 0 ||
          !closeTo(costAddedUsd, activity.amount) ||
          !closeTo(impact.after.quantity - (tracked?.quantity ?? 0), activity.quantity)) {
          status = "incomplete_chain";
          reason = "買進成本或股數與交易紀錄不一致";
          break;
        }
        recordedTwdCost += costAddedUsd * activity.fxRate;
        buyCount += 1;
        tracked = impact.after;
      } else {
        if (!tracked || !impact.before ||
          activity.quantity <= 0 || activity.quantity > tracked.quantity ||
          !closeTo(tracked.quantity - (impact.after?.quantity ?? 0), activity.quantity)) {
          status = "incomplete_chain";
          reason = "賣出紀錄與庫存扣減不一致";
          break;
        }
        // App uses USD average-cost method. A partial sale removes that
        // fraction of the recorded TWD cost basis of the old shares.
        recordedTwdCost *= (tracked.quantity - activity.quantity) / tracked.quantity;
        saleCount += 1;
        tracked = impact.after;
      }
    }

    if (status !== "verified_chain") return { ...base, status, reason, buyCount, saleCount };
    if (!tracked || !beganAt || buyCount === 0) return base;
    if (!snapshotMatches(tracked, holding)) {
      return { ...base, status: "incomplete_chain", reason: "目前部位與最後一筆連動庫存不同；可能曾手動校正", buyCount, saleCount };
    }

    const usdCost = holding.quantity * holding.averageCost;
    const averageRecordedFx = recordedTwdCost / usdCost;
    const priceImpactTwd = holding.quantity * (holding.price - holding.averageCost) * currentUsdTwd;
    const fxImpactTwd = usdCost * currentUsdTwd - recordedTwdCost;
    const combinedGainTwd = marketValueTwd - recordedTwdCost;
    if (![recordedTwdCost, averageRecordedFx, priceImpactTwd, fxImpactTwd, combinedGainTwd].every(Number.isFinite) ||
      recordedTwdCost <= 0 || !closeTo(priceImpactTwd + fxImpactTwd, combinedGainTwd)) {
      return { ...base, status: "incomplete_chain", reason: "重建的台幣成本資料無法核對", buyCount, saleCount };
    }

    return {
      ...base, status: "verified_chain", reason: "完整連動買賣及成交時紀錄的參考匯率",
      buyCount, saleCount, recordedCostTwd: recordedTwdCost, priceImpactTwd, fxImpactTwd,
      combinedGainTwd, averageRecordedFx
    };
  });

  const explained = rows.filter((row) => row.status === "verified_chain");
  return {
    eligibleCount: rows.length,
    explainedCount: explained.length,
    unknownCount: rows.length - explained.length,
    eligibleValueTwd: rows.reduce((sum, row) => sum + row.marketValueTwd, 0),
    explainedValueTwd: explained.reduce((sum, row) => sum + row.marketValueTwd, 0),
    unknownValueTwd: rows.filter((row) => row.status !== "verified_chain").reduce((sum, row) => sum + row.marketValueTwd, 0),
    recordedCostTwd: explained.reduce((sum, row) => sum + row.recordedCostTwd!, 0),
    priceImpactTwd: explained.reduce((sum, row) => sum + row.priceImpactTwd!, 0),
    fxImpactTwd: explained.reduce((sum, row) => sum + row.fxImpactTwd!, 0),
    combinedGainTwd: explained.reduce((sum, row) => sum + row.combinedGainTwd!, 0),
    rows
  };
}
