import type { PermissionState } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Preferences } from "@capacitor/preferences";
import { localDateKey } from "./calc";
import {
  buildNotificationSettingsDeepLink,
  buildPortfolioDeepLink,
  buildResearchDeepLink
} from "./native-deep-link";
import {
  DEFAULT_LOCAL_SMART_ALERT_SETTINGS,
  evaluateLocalSmartAlerts,
  normalizeLocalSmartAlertSettings,
  type LocalSmartAlertSettings,
  type SmartAlertCandidate
} from "./smart-alerts";
import type { AppState } from "./types";

export type NativeNotificationPermissionState = PermissionState | "unavailable";

export type NativeNotificationResearchTarget = {
  researchKey: string;
  researchType: "stock" | "etf";
  label: string;
};

const SMART_ALERT_SETTINGS_KEY = "portfoliopilot:smart-alert-settings:v1";
const SMART_ALERT_LEDGER_KEY = "portfoliopilot:smart-alert-ledger:v1";
const SMART_ALERT_MONTHLY_SCHEDULE_KEY = "portfoliopilot:smart-alert-monthly:v1";
const MONTHLY_NOTIFICATION_BASE_ID = 1_500_000_000;
const MONTHLY_NOTIFICATION_COUNT = 12;

export function nativeNotificationsAvailable() {
  return Capacitor.isNativePlatform();
}

export async function checkNativeNotificationPermission(): Promise<NativeNotificationPermissionState> {
  if (!nativeNotificationsAvailable()) return "unavailable";
  const status = await LocalNotifications.checkPermissions();
  return status.display;
}

export async function requestNativeNotificationPermission(): Promise<NativeNotificationPermissionState> {
  if (!nativeNotificationsAvailable()) return "unavailable";
  const status = await LocalNotifications.requestPermissions();
  return status.display;
}

function notificationId() {
  return Math.max(1, Math.floor(Date.now() % 2_000_000_000));
}

function stableNotificationId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 100_000_000 + ((hash >>> 0) % 900_000_000);
}

export async function scheduleNativeTestNotification(
  target?: NativeNotificationResearchTarget
) {
  if (!nativeNotificationsAvailable()) {
    throw new Error("本機通知只會在 PortfolioPilot Native App 中啟用。");
  }

  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") {
    throw new Error("尚未允許通知。請先在通知設定中開啟權限。");
  }

  const deepLink = target
    ? buildResearchDeepLink(target.researchKey, target.researchType)
    : buildNotificationSettingsDeepLink();

  const result = await LocalNotifications.schedule({
    notifications: [
      {
        id: notificationId(),
        title: "PortfolioPilot 通知測試",
        body: target
          ? `通知已可連回 ${target.label} 的研究頁。`
          : "通知已啟用。點一下可回到 PortfolioPilot 通知設定。",
        schedule: {
          at: new Date(Date.now() + 3_000),
          allowWhileIdle: false
        },
        extra: {
          deepLink
        },
        foreground: true,
        isExactNotification: false
      }
    ]
  });

  return result;
}

export async function loadNativeSmartAlertSettings(): Promise<LocalSmartAlertSettings> {
  if (!nativeNotificationsAvailable()) {
    return DEFAULT_LOCAL_SMART_ALERT_SETTINGS;
  }

  const { value } = await Preferences.get({ key: SMART_ALERT_SETTINGS_KEY });
  if (!value) return DEFAULT_LOCAL_SMART_ALERT_SETTINGS;

  try {
    return normalizeLocalSmartAlertSettings(
      JSON.parse(value) as Partial<LocalSmartAlertSettings>
    );
  } catch {
    return DEFAULT_LOCAL_SMART_ALERT_SETTINGS;
  }
}

export async function saveNativeSmartAlertSettings(
  input: LocalSmartAlertSettings
): Promise<LocalSmartAlertSettings> {
  if (!nativeNotificationsAvailable()) {
    throw new Error("Smart Alerts 只會在 PortfolioPilot Native App 中啟用。");
  }

  const settings = normalizeLocalSmartAlertSettings(input);
  const serialized = JSON.stringify(settings);
  const previous = await Preferences.get({ key: SMART_ALERT_SETTINGS_KEY });

  await Preferences.set({
    key: SMART_ALERT_SETTINGS_KEY,
    value: serialized
  });

  if (previous.value !== serialized) {
    await Promise.all([
      Preferences.remove({ key: SMART_ALERT_LEDGER_KEY }),
      Preferences.remove({ key: SMART_ALERT_MONTHLY_SCHEDULE_KEY })
    ]);
  }

  return settings;
}

function candidateDeepLink(candidate: SmartAlertCandidate) {
  if (candidate.target.section === "research") {
    return buildResearchDeepLink(
      candidate.target.researchKey,
      candidate.target.researchType
    );
  }
  return buildPortfolioDeepLink(candidate.target.tab);
}

async function loadSmartAlertLedger() {
  const { value } = await Preferences.get({ key: SMART_ALERT_LEDGER_KEY });
  if (!value) return {} as Record<string, string>;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return {} as Record<string, string>;
  }
}

function monthFingerprint(settings: LocalSmartAlertSettings) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return [
    settings.enabled,
    settings.monthlyContributionReminder,
    settings.monthlyContributionDay,
    month
  ].join(":");
}

function monthlyReminderDates(day: number) {
  const now = new Date();
  const result: Date[] = [];

  for (let offset = 0; result.length < MONTHLY_NOTIFICATION_COUNT && offset < 15; offset += 1) {
    const year = now.getFullYear();
    const month = now.getMonth() + offset;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const date = new Date(
      year,
      month,
      Math.min(day, lastDay),
      9,
      0,
      0,
      0
    );

    if (date.getTime() > now.getTime() + 60_000) {
      result.push(date);
    }
  }

  return result;
}

async function cancelMonthlyContributionReminders() {
  const pending = await LocalNotifications.getPending();
  const monthly = pending.notifications
    .filter(
      (notification) =>
        notification.id >= MONTHLY_NOTIFICATION_BASE_ID &&
        notification.id < MONTHLY_NOTIFICATION_BASE_ID + MONTHLY_NOTIFICATION_COUNT
    )
    .map((notification) => ({ id: notification.id }));

  if (monthly.length) {
    await LocalNotifications.cancel({ notifications: monthly });
  }
}

async function syncMonthlyContributionReminders(
  settings: LocalSmartAlertSettings,
  canSchedule: boolean
) {
  const fingerprint = monthFingerprint(settings);
  const saved = await Preferences.get({ key: SMART_ALERT_MONTHLY_SCHEDULE_KEY });

  if (saved.value === fingerprint) {
    return 0;
  }

  await cancelMonthlyContributionReminders();

  if (
    !settings.enabled ||
    !settings.monthlyContributionReminder ||
    !canSchedule
  ) {
    if (!settings.enabled || !settings.monthlyContributionReminder) {
      await Preferences.set({
        key: SMART_ALERT_MONTHLY_SCHEDULE_KEY,
        value: fingerprint
      });
    }
    return 0;
  }

  const dates = monthlyReminderDates(settings.monthlyContributionDay);
  if (!dates.length) return 0;

  await LocalNotifications.schedule({
    notifications: dates.map((date, index) => ({
      id: MONTHLY_NOTIFICATION_BASE_ID + index,
      title: "定期定額提醒",
      body: "今天是你設定的每月投入提醒日。打開 PortfolioPilot 檢查計畫、配置與現金水位。",
      schedule: {
        at: date,
        allowWhileIdle: false
      },
      extra: {
        deepLink: buildPortfolioDeepLink("targets"),
        smartAlert: "monthly-contribution"
      },
      foreground: true,
      isExactNotification: false
    }))
  });

  await Preferences.set({
    key: SMART_ALERT_MONTHLY_SCHEDULE_KEY,
    value: fingerprint
  });

  return dates.length;
}

export type NativeSmartAlertSyncResult = {
  candidates: number;
  scheduled: number;
  monthlyScheduled: number;
};

export async function syncNativeSmartAlerts(
  state: AppState
): Promise<NativeSmartAlertSyncResult> {
  if (!nativeNotificationsAvailable()) {
    return { candidates: 0, scheduled: 0, monthlyScheduled: 0 };
  }

  const settings = await loadNativeSmartAlertSettings();
  const permission = await LocalNotifications.checkPermissions();
  const canSchedule = permission.display === "granted";
  const monthlyScheduled = await syncMonthlyContributionReminders(
    settings,
    canSchedule
  );

  if (!settings.enabled || !canSchedule) {
    return { candidates: 0, scheduled: 0, monthlyScheduled };
  }

  const today = localDateKey();
  const candidates = evaluateLocalSmartAlerts(state, settings, today);
  const ledger = await loadSmartAlertLedger();
  const fresh = candidates
    .filter((candidate) => ledger[candidate.id] !== today)
    .slice(0, 4);

  if (!fresh.length) {
    return {
      candidates: candidates.length,
      scheduled: 0,
      monthlyScheduled
    };
  }

  await LocalNotifications.schedule({
    notifications: fresh.map((candidate, index) => ({
      id: stableNotificationId(`smart:${candidate.id}`),
      title: candidate.title,
      body: candidate.body,
      schedule: {
        at: new Date(Date.now() + 1_200 + index * 500),
        allowWhileIdle: false
      },
      extra: {
        deepLink: candidateDeepLink(candidate),
        smartAlert: candidate.kind,
        smartAlertId: candidate.id
      },
      foreground: true,
      isExactNotification: false
    }))
  });

  for (const candidate of fresh) {
    ledger[candidate.id] = today;
  }

  await Preferences.set({
    key: SMART_ALERT_LEDGER_KEY,
    value: JSON.stringify(ledger)
  });

  return {
    candidates: candidates.length,
    scheduled: fresh.length,
    monthlyScheduled
  };
}
