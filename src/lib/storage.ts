import { demoState } from "./demo-data";
import type { AppState } from "./types";

const KEY = "portfoliopilot:v1";

export function getInitialState(): AppState {
  if (typeof window === "undefined") return demoState;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return demoState;

  try {
    const parsed = JSON.parse(raw) as AppState;
    if (!Array.isArray(parsed.holdings) || !Array.isArray(parsed.journal)) return demoState;
    return parsed;
  } catch {
    return demoState;
  }
}

export function saveState(state: AppState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(state));
}

export function resetState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
