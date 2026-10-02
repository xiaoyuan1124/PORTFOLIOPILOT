import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import type { AppState } from "./types";
import {
  loadInitialState,
  parseStoredStateRaw,
  preserveRecoveryBackupRaw,
  saveState,
  serializeStoredState,
  type InitialStateLoad
} from "./storage";

const NATIVE_STATE_KEY = "portfoliopilot:native-state:v1";
const LOCAL_REVISION_KEY = "portfoliopilot:native-revision:v1";
const NATIVE_ENVELOPE_VERSION = 1;

type NativeStateEnvelope = {
  version: typeof NATIVE_ENVELOPE_VERSION;
  revision: number;
  state: AppState;
};

export type DurableInitialStateLoad = InitialStateLoad & {
  nativeDurabilityDegraded: boolean;
};

export class NativeDurabilityError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "NativeDurabilityError";
    this.cause = cause;
  }
}

function nativeAvailable() {
  return Capacitor.isNativePlatform();
}

function localRevision() {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(LOCAL_REVISION_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function setLocalRevision(revision: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_REVISION_KEY, String(revision));
}

function nextRevision() {
  return Math.max(Date.now(), localRevision() + 1);
}

export function encodeNativeStateEnvelope(state: AppState, revision: number) {
  if (!Number.isSafeInteger(revision) || revision <= 0) {
    throw new Error("Native storage revision must be a positive safe integer.");
  }

  return JSON.stringify({
    version: NATIVE_ENVELOPE_VERSION,
    revision,
    state: JSON.parse(serializeStoredState(state))
  } satisfies NativeStateEnvelope);
}

export function decodeNativeStateEnvelope(raw: string): NativeStateEnvelope {
  const parsed = JSON.parse(raw) as Partial<NativeStateEnvelope>;
  const revision = parsed.revision;
  if (
    parsed.version !== NATIVE_ENVELOPE_VERSION ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision <= 0 ||
    !parsed.state
  ) {
    throw new Error("Native storage envelope is invalid.");
  }

  return {
    version: NATIVE_ENVELOPE_VERSION,
    revision,
    state: parseStoredStateRaw(JSON.stringify(parsed.state))
  };
}

let nativeWriteQueue: Promise<void> = Promise.resolve();

function queueNativeWrite(raw: string) {
  const operation = nativeWriteQueue
    .catch(() => undefined)
    .then(() => Preferences.set({ key: NATIVE_STATE_KEY, value: raw }));

  nativeWriteQueue = operation;
  return operation;
}

async function replaceNativeState(state: AppState, revision: number) {
  await Preferences.set({
    key: NATIVE_STATE_KEY,
    value: encodeNativeStateEnvelope(state, revision)
  });
}

export async function loadDurableInitialState(): Promise<DurableInitialStateLoad> {
  const local = loadInitialState();
  if (!nativeAvailable()) {
    return { ...local, nativeDurabilityDegraded: false };
  }

  let nativeRaw: string | null;
  try {
    ({ value: nativeRaw } = await Preferences.get({ key: NATIVE_STATE_KEY }));
  } catch {
    return { ...local, nativeDurabilityDegraded: true };
  }

  if (!nativeRaw) {
    if (local.invalidStoredState) {
      return { ...local, nativeDurabilityDegraded: false };
    }

    const revision = nextRevision();
    try {
      setLocalRevision(revision);
      await replaceNativeState(local.state, revision);
      return { ...local, nativeDurabilityDegraded: false };
    } catch {
      return { ...local, nativeDurabilityDegraded: true };
    }
  }

  let native: NativeStateEnvelope;
  try {
    native = decodeNativeStateEnvelope(nativeRaw);
  } catch {
    const recoveryPreserved =
      preserveRecoveryBackupRaw(nativeRaw) || local.recoveryPreserved;

    if (local.invalidStoredState) {
      return {
        ...local,
        recoveryPreserved,
        nativeDurabilityDegraded: true
      };
    }

    const revision = nextRevision();
    try {
      setLocalRevision(revision);
      await replaceNativeState(local.state, revision);
      return {
        ...local,
        recoveryPreserved,
        nativeDurabilityDegraded: false
      };
    } catch {
      return {
        ...local,
        recoveryPreserved,
        nativeDurabilityDegraded: true
      };
    }
  }

  const revision = localRevision();
  if (!local.invalidStoredState && revision > native.revision) {
    try {
      await replaceNativeState(local.state, revision);
      return { ...local, nativeDurabilityDegraded: false };
    } catch {
      return { ...local, nativeDurabilityDegraded: true };
    }
  }

  try {
    saveState(native.state);
    setLocalRevision(native.revision);
  } catch {
    return {
      state: native.state,
      invalidStoredState: true,
      recoveryPreserved: local.recoveryPreserved,
      nativeDurabilityDegraded: false
    };
  }

  return {
    state: native.state,
    invalidStoredState: false,
    recoveryPreserved: local.recoveryPreserved,
    nativeDurabilityDegraded: false
  };
}

export function saveDurableState(state: AppState) {
  const serialized = serializeStoredState(state);
  const validated = parseStoredStateRaw(serialized);

  saveState(validated);

  if (!nativeAvailable()) {
    return Promise.resolve();
  }

  const revision = nextRevision();
  setLocalRevision(revision);
  const raw = encodeNativeStateEnvelope(validated, revision);

  return queueNativeWrite(raw).catch((cause) => {
    throw new NativeDurabilityError(
      "Native durable storage write failed.",
      cause
    );
  });
}
