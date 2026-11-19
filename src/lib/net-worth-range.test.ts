import { describe, expect, it } from "vitest";
import { snapshotsForRange } from "./calc";
import type { NetWorthSnapshot } from "./types";
const point = (date: string, total = 100): NetWorthSnapshot => ({date,total,cost:90,gain:10,usdTwd:32});
describe("real recorded NAV range windows", () => {
  it("supports 1-day, 1-week, 6-month and year without filling gaps", () => {
    const records = [point("2026-01-01"),point("2026-05-19"),point("2026-05-20"),point("2026-11-18"),point("2026-11-19")];
    expect(snapshotsForRange(records, "1D").map(r=>r.date)).toEqual(["2026-11-18","2026-11-19"]);
    expect(snapshotsForRange(records, "1W").map(r=>r.date)).toEqual(["2026-11-18","2026-11-19"]);
    expect(snapshotsForRange(records, "6M").map(r=>r.date)).toEqual(["2026-05-19","2026-05-20","2026-11-18","2026-11-19"]);
    expect(snapshotsForRange(records,"ALL")).toHaveLength(5);
  });
  it("uses a clamped month-end instead of overflowing into the next month", () => {
    const records = [point("2026-02-28"),point("2026-03-01"),point("2026-03-31")];
    expect(snapshotsForRange(records,"1M").map(r=>r.date)).toEqual(["2026-02-28","2026-03-01","2026-03-31"]);
  });
  it("refuses to fabricate 1D points when the preceding day was not recorded", () => {
    const records = [point("2026-11-12"),point("2026-11-19")];
    expect(snapshotsForRange(records,"1D")).toEqual([records[1]]);
  });
});
