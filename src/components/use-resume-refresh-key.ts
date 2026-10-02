"use client";

import { useEffect, useRef, useState } from "react";
import { NATIVE_RESUME_EVENT } from "./native-runtime-bridge";

const DEFAULT_RESUME_REVALIDATE_MS = 60_000;

export function useResumeRefreshKey(minIntervalMs = DEFAULT_RESUME_REVALIDATE_MS) {
  const [refreshKey, setRefreshKey] = useState(0);
  const lastResumeAt = useRef<number | null>(null);

  useEffect(() => {
    lastResumeAt.current = Date.now();

    function refresh() {
      setRefreshKey((value) => value + 1);
    }

    function refreshIfStale() {
      const now = Date.now();
      const previous = lastResumeAt.current ?? now;
      if (now - previous < minIntervalMs) return;
      lastResumeAt.current = now;
      refresh();
    }

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      refreshIfStale();
    }

    function onOnline() {
      lastResumeAt.current = Date.now();
      refresh();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener(NATIVE_RESUME_EVENT, refreshIfStale);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(NATIVE_RESUME_EVENT, refreshIfStale);
    };
  }, [minIntervalMs]);

  return refreshKey;
}
