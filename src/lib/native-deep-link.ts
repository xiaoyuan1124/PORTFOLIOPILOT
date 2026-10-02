export const NATIVE_DEEP_LINK_EVENT = "portfoliopilot:native-deep-link";

export type NativeDeepLinkTarget =
  | {
      section: "research";
      researchKey: string;
      researchType: "stock" | "etf";
    }
  | {
      section: "settings";
    };

let pendingDeepLink: string | null = null;

export function buildResearchDeepLink(
  researchKey: string,
  researchType: "stock" | "etf"
) {
  const params = new URLSearchParams({
    key: researchKey,
    type: researchType
  });
  return `portfoliopilot://research?${params.toString()}`;
}

export function buildNotificationSettingsDeepLink() {
  return "portfoliopilot://settings?panel=notifications";
}

export function parseNativeDeepLink(value: string): NativeDeepLinkTarget | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "portfoliopilot:") return null;

    const route = url.hostname || url.pathname.replace(/^\/+/, "");
    if (route === "settings") {
      return { section: "settings" };
    }

    if (route !== "research") return null;

    const researchKey = url.searchParams.get("key")?.trim() ?? "";
    const researchType = url.searchParams.get("type");
    if (!researchKey || (researchType !== "stock" && researchType !== "etf")) {
      return null;
    }

    return {
      section: "research",
      researchKey,
      researchType
    };
  } catch {
    return null;
  }
}

export function publishNativeDeepLink(value: string) {
  if (!parseNativeDeepLink(value)) return false;
  pendingDeepLink = value;

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<string>(NATIVE_DEEP_LINK_EVENT, { detail: value })
    );
  }

  return true;
}

export function consumePendingNativeDeepLink() {
  const value = pendingDeepLink;
  pendingDeepLink = null;
  return value;
}
