import { Capacitor, registerPlugin } from "@capacitor/core";
import { loadBundledTwQuotes } from "./market-data";
import { buildPortfolioWidgetSnapshot } from "./widget-snapshot";
import type { AppState } from "./types";

interface WidgetSyncPlugin {
  status(): Promise<{ enabled: boolean }>;
  enable(): Promise<{ enabled: boolean }>;
  disable(): Promise<{ enabled: boolean }>;
  clearSnapshot(): Promise<void>;
  sync(options: { snapshotJson: string }): Promise<{ updated: boolean }>;
}

const nativePlugin = registerPlugin<WidgetSyncPlugin>("PortfolioWidgetSync");

// Keep all native writes in order. A revoked preference is checked again by
// Swift, so an already started quote request cannot re-enable sharing.
let pending: Promise<unknown> = Promise.resolve();

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const next = pending.catch(() => undefined).then(op);
  pending = next.catch(() => undefined);
  return next;
}

export function nativeWidgetAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function nativeWidgetStatus() {
  if (!nativeWidgetAvailable()) return { available: false as const, enabled: false };
  const state = await nativePlugin.status();
  return { available: true as const, enabled: state.enabled };
}

export function enableNativeWidgetSharing(state: AppState) {
  return enqueue(async () => {
    if (!nativeWidgetAvailable()) throw new Error("只有 iPhone 原生 App 支援小工具資料共享。");
    if (state.dataMode === "demo") throw new Error("示範資料不可顯示在主畫面小工具。");
    // Native enable starts by deleting all old snapshots.
    await nativePlugin.enable();
    try {
      await publishSnapshot(state);
    } catch (error) {
      // A failed first write should not leave consent enabled ambiguously.
      await nativePlugin.disable();
      throw error;
    }
    return { enabled: true };
  });
}

export function disableNativeWidgetSharing() {
  return enqueue(async () => {
    if (!nativeWidgetAvailable()) throw new Error("只有 iPhone 原生 App 支援小工具資料共享。");
    return nativePlugin.disable();
  });
}

async function publishSnapshot(state: AppState) {
  const current = await nativePlugin.status();
  if (!current.enabled) return { updated: false };
  if (state.dataMode === "demo" || (!state.holdings.length && !(state.watchlist?.length))) {
    await nativePlugin.clearSnapshot();
    return { updated: false };
  }

  // Historical official close files only; this is not a websocket or a
  // background quote service. If offline, keep portfolio summary but suppress
  // the stock list rather than inventing price values.
  const startedAt = new Date();
  const quotes = await loadBundledTwQuotes().catch(() => null);
  const snapshot = buildPortfolioWidgetSnapshot(state, quotes, startedAt);
  if (!snapshot) {
    await nativePlugin.clearSnapshot();
    return { updated: false };
  }
  return nativePlugin.sync({ snapshotJson: JSON.stringify(snapshot) });
}

export function syncNativeWidgetSnapshot(state: AppState) {
  return enqueue(async () => {
    if (!nativeWidgetAvailable()) return { updated: false };
    return publishSnapshot(state);
  });
}
