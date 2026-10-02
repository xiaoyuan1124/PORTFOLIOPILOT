import type { PermissionState } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  buildNotificationSettingsDeepLink,
  buildResearchDeepLink
} from "./native-deep-link";

export type NativeNotificationPermissionState = PermissionState | "unavailable";

export type NativeNotificationResearchTarget = {
  researchKey: string;
  researchType: "stock" | "etf";
  label: string;
};

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
