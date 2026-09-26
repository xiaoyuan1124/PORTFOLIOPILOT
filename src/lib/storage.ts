import { demoState } from "./demo-data";
import type { AppState } from "./types";
import { appStateSchema } from "./schema";

const KEY = "portfoliopilot:v1";

function migrateLegacyState(value: unknown): AppState {
  if (!value || typeof value !== "object") return demoState;
  const record = value as Record<string, unknown>;
  return appStateSchema.parse({
    holdings: Array.isArray(record.holdings) ? record.holdings : [],
    journal: Array.isArray(record.journal) ? record.journal : [],
    snapshots: Array.isArray(record.snapshots) ? record.snapshots : [],
    usdTwd: record.usdTwd ?? 31.8
  });
}

export function getInitialState(): AppState {
  if (typeof window === "undefined") return demoState;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return demoState;

  try {
    return migrateLegacyState(JSON.parse(raw));
  } catch {
    return demoState;
  }
}

export function saveState(state: AppState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(appStateSchema.parse(state)));
}

export function resetState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
