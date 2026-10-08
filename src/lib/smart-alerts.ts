import { buildAllocationDrift } from "./allocation-targets";
import { calculatePortfolioRisk } from "./portfolio-risk";
import type { AppState } from "./types";

export type LocalSmartAlertSettings = {
  enabled: boolean;
  companyExposurePct: number;
  sectorExposurePct: number;
  allocationDriftPct: number;
  watchlistResearchDays: number;
  monthlyContributionReminder: boolean;
  monthlyContributionDay: number;
};

export const DEFAULT_LOCAL_SMART_ALERT_SETTINGS: LocalSmartAlertSettings = {
  enabled: false,
  companyExposurePct: 20,
  sectorExposurePct: 40,
  allocationDriftPct: 5,
  watchlistResearchDays: 14,
  monthlyContributionReminder: false,
  monthlyContributionDay: 1
};

export type SmartAlertTarget =
  | { section: "portfolio"; tab: "risk" | "targets" }
  | {
      section: "research";
      researchKey: string;
      researchType: "stock" | "etf";
    };

export type SmartAlertCandidate = {
  id: string;
  kind: "company" | "sector" | "allocation" | "watchlist";
  title: string;
  body: string;
  target: SmartAlertTarget;
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeLocalSmartAlertSettings(
  value?: Partial<LocalSmartAlertSettings> | null
): LocalSmartAlertSettings {
  return {
    enabled: value?.enabled === true,
    companyExposurePct: clampNumber(value?.companyExposurePct, 20, 1, 100),
    sectorExposurePct: clampNumber(value?.sectorExposurePct, 40, 1, 100),
    allocationDriftPct: clampNumber(value?.allocationDriftPct, 5, 0.5, 100),
    watchlistResearchDays: Math.round(
      clampNumber(value?.watchlistResearchDays, 14, 1, 365)
    ),
    monthlyContributionReminder: value?.monthlyContributionReminder === true,
    monthlyContributionDay: Math.round(
      clampNumber(value?.monthlyContributionDay, 1, 1, 31)
    )
  };
}

function dateKeyToUtcMs(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = Date.UTC(year, month - 1, day);
  return Number.isFinite(date) ? date : null;
}

function elapsedDays(from: string, to: string) {
  const start = dateKeyToUtcMs(from);
  const end = dateKeyToUtcMs(to);
  if (start === null || end === null) return 0;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function evaluateLocalSmartAlerts(
  state: AppState,
  settingsInput: LocalSmartAlertSettings,
  today: string
): SmartAlertCandidate[] {
  const settings = normalizeLocalSmartAlertSettings(settingsInput);
  if (!settings.enabled) return [];

  const candidates: SmartAlertCandidate[] = [];
  const risk = calculatePortfolioRisk(
    state.holdings,
    state.etfCompositions,
    state.usdTwd
  );

  if (
    risk.largestCompany &&
    risk.largestCompany.portfolioPct >= settings.companyExposurePct
  ) {
    candidates.push({
      id: `company:${risk.largestCompany.market}:${risk.largestCompany.symbol}`,
      kind: "company",
      title: "單一公司曝險提醒",
      body: `${risk.largestCompany.name}（${risk.largestCompany.symbol}）目前穿透曝險 ${risk.largestCompany.portfolioPct.toFixed(1)}%，已達你設定的 ${settings.companyExposurePct.toFixed(1)}%。`,
      target: { section: "portfolio", tab: "risk" }
    });
  }

  if (
    risk.largestSector &&
    risk.largestSector.portfolioPct >= settings.sectorExposurePct
  ) {
    candidates.push({
      id: `sector:${risk.largestSector.key}`,
      kind: "sector",
      title: "產業曝險提醒",
      body: `${risk.largestSector.label}目前占總資產 ${risk.largestSector.portfolioPct.toFixed(1)}%，已達你設定的 ${settings.sectorExposurePct.toFixed(1)}%。`,
      target: { section: "portfolio", tab: "risk" }
    });
  }

  const allocationRows = buildAllocationDrift(
    state.allocationTargets ?? [],
    state.holdings,
    state.usdTwd
  )
    .filter((row) => row.targetPct > 0 && row.driftPct >= settings.allocationDriftPct)
    .slice(0, 2);

  for (const row of allocationRows) {
    candidates.push({
      id: `allocation:${row.key}`,
      kind: "allocation",
      title: "配置高於目標",
      body: `${row.label}目前 ${row.currentPct.toFixed(1)}%，高於目標 ${row.targetPct.toFixed(1)}% 共 ${row.driftPct.toFixed(1)} 個百分點。`,
      target: { section: "portfolio", tab: "targets" }
    });
  }

  const watchlistDue = (state.watchlist ?? [])
    .map((item) => ({ item, days: elapsedDays(item.addedAt, today) }))
    .filter(({ days }) => days >= settings.watchlistResearchDays)
    .sort((a, b) => b.days - a.days || a.item.symbol.localeCompare(b.item.symbol))
    .slice(0, 2);

  for (const { item, days } of watchlistDue) {
    candidates.push({
      id: `watchlist:${item.venue}:${item.symbol}`,
      kind: "watchlist",
      title: "自選清單研究提醒",
      body: `${item.symbol} · ${item.name} 已在自選清單 ${days} 天，回來檢查研究資料與原先觀察理由。`,
      target: {
        section: "research",
        researchKey: `${item.venue}:${item.symbol}`,
        researchType: item.type
      }
    });
  }

  return candidates;
}
