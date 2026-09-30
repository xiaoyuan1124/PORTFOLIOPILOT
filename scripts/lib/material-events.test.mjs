import { describe, expect, it } from "vitest";
import {
  materialEventKey,
  mergeMaterialEventRows,
  normalizeMaterialEventDate,
  normalizeMaterialEventTime,
  parseMaterialEventRows
} from "./material-events.mjs";

describe("material event helpers", () => {
  it("normalizes ROC dates and zero-padded statement times", () => {
    expect(normalizeMaterialEventDate("115/09/30")).toBe("2026-09-30");
    expect(normalizeMaterialEventDate("1150930")).toBe("2026-09-30");
    expect(normalizeMaterialEventDate("20260930")).toBe("2026-09-30");
    expect(normalizeMaterialEventDate("1150231")).toBe("");
    expect(normalizeMaterialEventTime("54626")).toBe("05:46:26");
    expect(normalizeMaterialEventTime("15:50:56")).toBe("15:50:56");
  });

  it("parses official OpenAPI rows including the TWSE subject key trailing space", () => {
    const rows = parseMaterialEventRows([{
      "發言日期": "1150930",
      "發言時間": "155056",
      "公司代號": "2330",
      "公司名稱": "台積電",
      "主旨 ": "公告本公司重大訊息",
      "符合條款": "第51款",
      "事實發生日": "1150929",
      "說明": "第一手官方說明"
    }], "TWSE");

    expect(rows).toEqual([{
      market: "TWSE",
      code: "2330",
      name: "台積電",
      publishedDate: "2026-09-30",
      publishedTime: "15:50:56",
      factDate: "2026-09-29",
      rule: "第51款",
      subject: "公告本公司重大訊息",
      detail: "第一手官方說明"
    }]);
  });

  it("merges history by stable event identity and prunes outside retention", () => {
    const old = {
      market: "TWSE",
      code: "2330",
      name: "台積電",
      publishedDate: "2026-08-01",
      publishedTime: "10:00:00",
      factDate: null,
      rule: "第1款",
      subject: "too old",
      detail: ""
    };
    const current = {
      ...old,
      publishedDate: "2026-09-30",
      subject: "current"
    };

    const merged = mergeMaterialEventRows(
      [old, current],
      [{ ...current }],
      { retentionDays: 45, referenceDate: "2026-09-30" }
    );

    expect(merged).toHaveLength(1);
    expect(materialEventKey(merged[0])).toBe(materialEventKey(current));
    expect(merged[0]?.subject).toBe("current");
  });
});
