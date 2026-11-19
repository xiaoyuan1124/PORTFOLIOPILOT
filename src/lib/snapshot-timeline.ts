import type { NetWorthSnapshot } from "./types";

export type SnapshotTimelinePoint = {
  date: string;
  time: number;
  value: number | null;
};

/**
 * Show true calendar spacing and visible gaps in locally recorded NAV.
 * Never forward-fill missing prices or fabricate portfolio history.
 */
export function snapshotTimeline(snapshots: NetWorthSnapshot[]): SnapshotTimelinePoint[] {
  const byDay = new Map(
    snapshots
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.total))
      .map((item) => [item.date, item.total] as const)
  );
  const dates = [...byDay.keys()].sort();
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last) return [];
  const startMs = Date.parse(first + "T00:00:00Z");
  const endMs = Date.parse(last + "T00:00:00Z");
  const result: SnapshotTimelinePoint[] = [];
  for (let day = startMs; day <= endMs; day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    const value = byDay.get(date);
    const weekday = new Date(day).getUTCDay();
    // Weekends have no official TWSE closing session, unless explicitly recorded.
    if (weekday === 0 || weekday === 6) {
      if (value === undefined) continue;
    }
    result.push({ date, time: day, value: value ?? null });
  }
  return result;
}
