"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { publishNativeDeepLink } from "@/lib/native-deep-link";

export const NATIVE_RESUME_EVENT = "portfoliopilot:native-resume";

export function NativeRuntimeBridge() {
  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();
    document.documentElement.dataset.runtime = isNative ? Capacitor.getPlatform() : "web";

    if (!isNative) return;

    const appStateListener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        window.dispatchEvent(new Event(NATIVE_RESUME_EVENT));
      }
    });

    const notificationActionListener = LocalNotifications.addListener(
      "localNotificationActionPerformed",
      ({ notification }) => {
        const deepLink =
          notification.extra &&
          typeof notification.extra === "object" &&
          "deepLink" in notification.extra &&
          typeof notification.extra.deepLink === "string"
            ? notification.extra.deepLink
            : null;

        if (deepLink) {
          publishNativeDeepLink(deepLink);
        }
      }
    );

    return () => {
      void Promise.all([appStateListener, notificationActionListener]).then(
        (listeners) => listeners.forEach((listener) => listener.remove())
      );
    };
  }, []);

  return null;
}
