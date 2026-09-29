import { emptyState } from "./demo-data";
import type { AppState } from "./types";
import { appStateSchema } from "./schema";

const KEY = "portfoliopilot:v1";

function migrateLegacyState(value: unknown): AppState {
  if (!value || typeof value !== "object") return emptyState;
  const record = value as Record<string, unknown>;
  return appStateSchema.parse({
    holdings: Array.isArray(record.holdings) ? record.holdings : [],
    etfCompositions: Array.isArray(record.etfCompositions) ? record.etfCompositions : [],
    journal: Array.isArray(record.journal) ? record.journal : [],
    activities: Array.isArray(record.activities) ? record.activities : [],
    snapshots: Array.isArray(record.snapshots) ? record.snapshots : [],
    usdTwd: record.usdTwd ?? 31.8,
    dataMode: record.dataMode ?? "personal"
  });
}

export function getInitialState(): AppState {
  if (typeof window === "undefined") return emptyState;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return emptyState;

  try {
    return migrateLegacyState(JSON.parse(raw));
  } catch {
    return emptyState;
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
