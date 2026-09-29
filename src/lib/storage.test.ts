import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyState } from "./demo-data";
import { getRecoveryBackupRaw, loadInitialState, saveState } from "./storage";

class MemoryStorage {
  private values = new Map<string, string>();
  failWrites = false;
  failReads = false;

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) {
    if (this.failReads) throw new Error("read blocked");
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("write blocked");
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}

describe("local storage safety", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage }
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("loads a valid stored state normally", () => {
    saveState(emptyState);
    const loaded = loadInitialState();
    expect(loaded.invalidStoredState).toBe(false);
    expect(loaded.state.holdings).toEqual([]);
  });

  it("preserves invalid raw data before returning an empty safe state", () => {
    storage.setItem("portfoliopilot:v1", "{not valid json");
    const loaded = loadInitialState();

    expect(loaded.invalidStoredState).toBe(true);
    expect(loaded.recoveryPreserved).toBe(true);
    expect(getRecoveryBackupRaw()).toBe("{not valid json");
    expect(loaded.state.holdings).toEqual([]);
  });

  it("blocks safe-write assumptions when browser storage cannot be read", () => {
    storage.failReads = true;
    const loaded = loadInitialState();

    expect(loaded.invalidStoredState).toBe(true);
    expect(loaded.recoveryPreserved).toBe(false);
  });

  it("reports when invalid data cannot be copied to recovery storage", () => {
    storage.setItem("portfoliopilot:v1", "{broken");
    storage.failWrites = true;
    const loaded = loadInitialState();

    expect(loaded.invalidStoredState).toBe(true);
    expect(loaded.recoveryPreserved).toBe(false);
  });
});
