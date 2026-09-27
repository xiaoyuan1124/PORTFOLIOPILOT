import { describe, expect, it } from "vitest";
import { parseTwseTaiexTotalReturn, rocDateToIso, rollingMonthStarts, twseMonthUrl } from "./benchmark-data.mjs";

describe("TWSE TAIEX total-return benchmark parser", () => {
  it("converts ROC dates", () => {
    expect(rocDateToIso("115/09/24")).toBe("2026-09-24");
    expect(rocDateToIso("bad")).toBeNull();
  });

  it("parses official MFI94U rows and rejects invalid values", () => {
    expect(parseTwseTaiexTotalReturn({
      stat: "OK",
      data: [
        ["115/09/23", "111,356.64"],
        ["115/09/24", "111,049.87"],
        ["bad", "1"],
        ["115/09/25", "--"]
      ]
    })).toEqual([
      { date: "2026-09-23", value: 111356.64 },
      { date: "2026-09-24", value: 111049.87 }
    ]);
  });

  it("builds deterministic rolling month requests", () => {
    expect(rollingMonthStarts(new Date("2026-09-27T00:00:00Z"), 3)).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01"
    ]);
    expect(twseMonthUrl("2026-09-01")).toContain("date=20260901");
  });
});
