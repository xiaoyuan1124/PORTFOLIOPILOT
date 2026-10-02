import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { PrivacyScreen } from "@capacitor/privacy-screen";

const PRIVACY_KEY = "portfoliopilot:privacy-screen:v1";

export type NativePrivacyState =
  | { available: false; enabled: false }
  | { available: true; enabled: boolean };

function nativeAvailable() {
  return Capacitor.isNativePlatform();
}

export function privacyEnabledFromStoredValue(value: string | null) {
  if (value === "disabled") return false;
  return true;
}

async function applyNativePrivacyScreen(enabled: boolean) {
  if (enabled) {
    await PrivacyScreen.enable({
      android: {
        dimBackground: true,
        privacyModeOnActivityHidden: "dim"
      },
      ios: {
        blurEffect: "dark"
      }
    });
    return;
  }

  await PrivacyScreen.disable();
}

export async function initializeNativePrivacyScreen(): Promise<NativePrivacyState> {
  if (!nativeAvailable()) {
    return { available: false, enabled: false };
  }

  let enabled = true;
  try {
    const { value } = await Preferences.get({ key: PRIVACY_KEY });
    enabled = privacyEnabledFromStoredValue(value);
  } catch {
    enabled = true;
  }

  await applyNativePrivacyScreen(enabled);
  return { available: true, enabled };
}

export async function getNativePrivacyState(): Promise<NativePrivacyState> {
  if (!nativeAvailable()) {
    return { available: false, enabled: false };
  }

  const { enabled } = await PrivacyScreen.isEnabled();
  return { available: true, enabled };
}

export async function setNativePrivacyEnabled(enabled: boolean): Promise<NativePrivacyState> {
  if (!nativeAvailable()) {
    return { available: false, enabled: false };
  }

  await applyNativePrivacyScreen(enabled);
  await Preferences.set({
    key: PRIVACY_KEY,
    value: enabled ? "enabled" : "disabled"
  });

  return { available: true, enabled };
}
