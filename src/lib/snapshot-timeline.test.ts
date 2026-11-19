import { describe, expect, it } from "vitest";
import { snapshotTimeline } from "./snapshot-timeline";

describe("snapshot timeline", () => {
  it("marks missing weekdays as gaps and does not invent NAV", () => {
    const points = snapshotTimeline([
      { date: "2026-11-16", total: 100, cost: 90, gain: 10, usdTwd: 30 },
      { date: "2026-11-19", total: 120, cost: 90, gain: 30, usdTwd: 30 }
    ]);
    expect(points.map((p) => p.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"]);
    expect(points.map((p) => p.value)).toEqual([100, null, null, 120]);
  });

  it("skips an unrecorded weekend but keeps a real weekend snapshot", () => {
    const points = snapshotTimeline([
      { date: "2026-11-20", total: 100, cost: 90, gain: 10, usdTwd: 30 },
      { date: "2026-11-21", total: 101, cost: 90, gain: 11, usdTwd: 30 },
      { date: "2026-11-23", total: 102, cost: 90, gain: 12, usdTwd: 30 }
    ]);
    expect(points.map((p) => p.date)).toEqual(["2026-11-20", "2026-11-21", "2026-11-23"]);
  });
});
