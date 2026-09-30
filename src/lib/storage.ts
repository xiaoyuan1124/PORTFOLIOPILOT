import { emptyState } from "./demo-data";
import type { AppState } from "./types";
import { appStateSchema } from "./schema";

const KEY = "portfoliopilot:v1";
const RECOVERY_KEY = "portfoliopilot:recovery:v1";

export type InitialStateLoad = {
  state: AppState;
  invalidStoredState: boolean;
  recoveryPreserved: boolean;
};

function migrateLegacyState(value: unknown): AppState {
  if (!value || typeof value !== "object") return emptyState;
  const record = value as Record<string, unknown>;
  return appStateSchema.parse({
    holdings: Array.isArray(record.holdings) ? record.holdings : [],
    etfCompositions: Array.isArray(record.etfCompositions) ? record.etfCompositions : [],
    journal: Array.isArray(record.journal) ? record.journal : [],
    activities: Array.isArray(record.activities) ? record.activities : [],
    snapshots: Array.isArray(record.snapshots) ? record.snapshots : [],
    allocationTargets: Array.isArray(record.allocationTargets) ? record.allocationTargets : [],
    usdTwd: record.usdTwd ?? 31.8,
    dataMode: record.dataMode ?? "personal"
  });
}

function preserveRecovery(raw: string) {
  if (typeof window === "undefined") return false;
  try {
    if (!window.localStorage.getItem(RECOVERY_KEY)) {
      window.localStorage.setItem(RECOVERY_KEY, raw);
    }
    return true;
  } catch {
    return false;
  }
}

export function loadInitialState(): InitialStateLoad {
  if (typeof window === "undefined") {
    return { state: emptyState, invalidStoredState: false, recoveryPreserved: false };
  }

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return { state: emptyState, invalidStoredState: true, recoveryPreserved: false };
  }

  if (!raw) {
    return { state: emptyState, invalidStoredState: false, recoveryPreserved: false };
  }

  try {
    return {
      state: migrateLegacyState(JSON.parse(raw)),
      invalidStoredState: false,
      recoveryPreserved: Boolean(window.localStorage.getItem(RECOVERY_KEY))
    };
  } catch {
    return {
      state: emptyState,
      invalidStoredState: true,
      recoveryPreserved: preserveRecovery(raw)
    };
  }
}

export function getInitialState(): AppState {
  return loadInitialState().state;
}

export function saveState(state: AppState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(appStateSchema.parse(state)));
}

export function getRecoveryBackupRaw() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(RECOVERY_KEY);
  } catch {
    return null;
  }
}

export function clearRecoveryBackup() {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(RECOVERY_KEY);
    return true;
  } catch {
    return false;
  }
}

export function resetState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
