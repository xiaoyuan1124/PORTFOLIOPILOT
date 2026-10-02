"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

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

    return () => {
      void appStateListener.then((listener) => listener.remove());
    };
  }, []);

  return null;
}
