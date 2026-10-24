import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseTwseStockDay, mergeStrategyOhlcv } from "./strategy-ohlcv.mjs";

const payload = {
  stat: "OK",
  fields: ["日期", "成交股數", "成交金額", "開盤價", "最高價", "最低價", "收盤價", "漲跌價差"],
  data: [
    ["115/10/22", "1,234,567", "-", "100", "105", "99", "102", "+2"],
    ["115/10/23", "900,000", "-", "102", "103", "100", "101", "-1"],
    ["115/09/30", "111", "-", "100", "105", "99", "102", "+2"]
  ]
};
describe("Official TWSE Strategy OHLCV adapter", () => {
  it("parses share volume, ROC dates and OHLC boundaries", () => {
    const rows = parseTwseStockDay(payload, "2026-10");
    assert.deepEqual(rows, [
      ["2026-10-22", 100, 105, 99, 102, 1234567],
      ["2026-10-23", 102, 103, 100, 101, 900000]
    ]);
  });
  it("skips incomplete rows rather than guessing candle fields", () => {
    assert.deepEqual(parseTwseStockDay({ ...payload, data: [["115/10/22", "1,000", "", "-", "105", "99", "102"]] }, "2026-10"), []);
    assert.deepEqual(parseTwseStockDay({ ...payload, stat: "查無資料" }, "2026-10"), []);
  });
  it("merges by exact trade date, drops impossible future, preserves prior observations", () => {
    const old = [["2026-10-20", 98, 99, 97, 98, 300]];
    const incoming = [...parseTwseStockDay(payload, "2026-10"), ["2026-10-26", 102, 103, 100, 101, 1000]];
    const rows = mergeStrategyOhlcv(old, incoming, "2026-10-24");
    assert.equal(rows.length, 3);
    assert.equal(rows.at(-1)[0], "2026-10-23");
  });
});
