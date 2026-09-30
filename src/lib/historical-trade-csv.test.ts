import { describe, expect, it } from "vitest";
import type { AppState } from "./types";
import {
  historicalTradeCsvTemplate,
  importHistoricalTradeCsv,
  latestHistoricalTradeCsvBatch,
  parseHistoricalTradeCsv,
  previewHistoricalTradeCsv,
  undoHistoricalTradeCsvBatch
} from "./historical-trade-csv";

function state(): AppState {
  return {
    holdings: [{
      id: "h1",
      symbol: "2330",
      name: "台積電",
      market: "TW",
      type: "stock",
      quantity: 10,
      price: 1000,
      averageCost: 900,
      currency: "TWD",
      sector: "半導體",
      account: "券商A"
    }],
    etfCompositions: [],
    journal: [],
    activities: [],
    snapshots: [],
    allocationTargets: [],
    usdTwd: 31.8,
    dataMode: "personal"
  };
}

describe("historical trade CSV adapter", () => {
  it("maps common Chinese headers and ROC dates without changing current holdings", () => {
    const csv = [
      "成交日期,買賣別,證券代號,成交股數,成交價,手續費,交易稅",
      "109/01/02,現股買進,2330,2,500,10,0",
      "109/02/03,現股賣出,2330,1,600,5,2"
    ].join("\n");

    const result = importHistoricalTradeCsv(state(), csv, "券商A", "TW");

    expect(result.importedCount).toBe(2);
    expect(result.state.holdings).toEqual(state().holdings);
    expect(result.state.activities[0]).toMatchObject({
      date: "2020-01-02",
      type: "buy",
      symbol: "2330",
      amount: 1010,
      currency: "TWD",
      fxRate: 1,
      historicalTrade: {
        mode: "ledger_only",
        market: "TW",
        fee: 10,
        tax: 0,
        importSource: "csv"
      }
    });
    expect(result.state.activities[1]).toMatchObject({
      date: "2020-02-03",
      type: "sell",
      amount: 593
    });
    expect(result.state.activities.every((item) => item.inventoryImpact === undefined)).toBe(true);
    expect(result.state.activities.every((item) => item.cashImpact === undefined)).toBe(true);
  });

  it("supports compact ROC dates, datetimes and hyphenated US tickers", () => {
    const tw = parseHistoricalTradeCsv([
      "日期,買賣,代號,股數,成交價,手續費,交易稅",
      "1090102,買進,2330,1,100,1,0"
    ].join("\n"), "台股券商", "TW");
    expect(tw[0]?.date).toBe("2020-01-02");

    const us = parseHistoricalTradeCsv([
      "date,type,market,symbol,quantity,price,fee,tax,fxRate,account",
      "2020-01-03 09:30:00,buy,US,BRK-B,1,200,1,0,30,US Broker"
    ].join("\n"), "", null);
    expect(us[0]).toMatchObject({ date: "2020-01-03", symbol: "BRK-B" });
  });

  it("supports English US rows, row accounts and explicit historical FX", () => {
    const rows = parseHistoricalTradeCsv([
      "date,side,ticker,qty,price,commission,tax,currency,fxRate,account,tradeId",
      "2020-03-04,SELL,QQQM,2,100,1,2,USD,29.5,US Broker,T-100"
    ].join("\n"), "", null);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: "2020-03-04",
      type: "sell",
      market: "US",
      symbol: "QQQM",
      account: "US Broker",
      quantity: 2,
      price: 100,
      fee: 1,
      tax: 2,
      fxRate: 29.5
    });
    expect(rows[0]?.importFingerprint).toMatch(/^csv-id-/);
  });

  it("uses explicit row market over the fallback and rejects market/currency conflicts", () => {
    const rows = parseHistoricalTradeCsv([
      "日期,買賣,市場,代號,股數,成交價,手續費,交易稅,匯率,帳戶",
      "2020/01/02,買進,美股,QQQM,1,100,1,0,30,美股券商"
    ].join("\n"), "", "TW");
    expect(rows[0]?.market).toBe("US");

    expect(() => parseHistoricalTradeCsv([
      "日期,買賣,市場,幣別,代號,股數,成交價,手續費,交易稅,匯率,帳戶",
      "2020/01/02,買進,台股,USD,2330,1,100,1,0,30,券商"
    ].join("\n"), "", null)).toThrow(/市場與幣別互相矛盾/);
  });

  it("requires explicit fee and tax columns instead of guessing missing costs", () => {
    expect(() => parseHistoricalTradeCsv([
      "日期,買賣,代號,股數,成交價",
      "2020/01/02,買進,2330,1,100"
    ].join("\n"), "券商", "TW")).toThrow(/手續費/);

    expect(() => parseHistoricalTradeCsv([
      "日期,買賣,代號,股數,成交價,手續費",
      "2020/01/02,買進,2330,1,100,1"
    ].join("\n"), "券商", "TW")).toThrow(/交易稅/);
  });

  it("requires explicit historical FX for US rows", () => {
    expect(() => parseHistoricalTradeCsv([
      "日期,買賣,市場,代號,股數,成交價,手續費,交易稅,帳戶",
      "2020/01/02,買進,US,QQQM,1,100,1,0,美股券商"
    ].join("\n"), "", null)).toThrow(/USD\/TWD 匯率/);
  });

  it("requires a row account or explicit fallback account", () => {
    expect(() => parseHistoricalTradeCsv([
      "日期,買賣,市場,代號,股數,成交價,手續費,交易稅",
      "2020/01/02,買進,TW,2330,1,100,1,0"
    ].join("\n"), "", null)).toThrow(/沒有帳戶/);
  });

  it("allows identical rows without trade IDs but gives each occurrence a stable unique fingerprint", () => {
    const csv = [
      "日期,買賣,代號,股數,成交價,手續費,交易稅",
      "2020/01/02,買進,2330,1,100,1,0",
      "2020/01/02,買進,2330,1,100,1,0"
    ].join("\n");
    const rows = parseHistoricalTradeCsv(csv, "券商", "TW");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.importFingerprint).not.toBe(rows[1]?.importFingerprint);

    const rowsAgain = parseHistoricalTradeCsv(csv, "券商", "TW");
    expect(rowsAgain.map((row) => row.importFingerprint)).toEqual(rows.map((row) => row.importFingerprint));
  });

  it("rejects repeated broker transaction IDs inside one file", () => {
    expect(() => parseHistoricalTradeCsv([
      "日期,買賣,代號,股數,成交價,手續費,交易稅,成交序號",
      "2020/01/02,買進,2330,1,100,1,0,A001",
      "2020/01/03,賣出,2330,1,110,1,1,A001"
    ].join("\n"), "券商", "TW")).toThrow(/成交序號重複/);
  });

  it("rejects re-importing the same file instead of duplicating history", () => {
    const csv = [
      "日期,買賣,代號,股數,成交價,手續費,交易稅,成交序號",
      "2020/01/02,買進,2330,1,100,1,0,A001"
    ].join("\n");
    const first = importHistoricalTradeCsv(state(), csv, "券商", "TW");
    expect(() => importHistoricalTradeCsv(first.state, csv, "券商", "TW")).toThrow(/已經匯入過/);
  });

  it("fails the whole batch when a later row is invalid", () => {
    const base = state();
    const csv = [
      "日期,買賣,代號,股數,成交價,手續費,交易稅",
      "2020/01/02,買進,2330,1,100,1,0",
      "2020/01/03,買進,2330,0,100,1,0"
    ].join("\n");

    expect(() => importHistoricalTradeCsv(base, csv, "券商", "TW")).toThrow(/成交股數/);
    expect(base.activities).toEqual([]);
    expect(base.holdings[0]?.quantity).toBe(10);
  });

  it("keeps current or future trades out of ledger-only CSV backfill", () => {
    expect(() => importHistoricalTradeCsv(state(), [
      "日期,買賣,代號,股數,成交價,手續費,交易稅",
      "2099/01/01,買進,2330,1,100,1,0"
    ].join("\n"), "券商", "TW")).toThrow(/今天以前/);
  });

  it("previews a fully validated batch without mutating state", () => {
    const base = state();
    const csv = [
      "date,type,market,symbol,quantity,price,fee,tax,fxRate,account,tradeId",
      "2020-01-02,buy,TW,2330,2,500,10,3,1,台股券商,TW-1",
      "2020-02-03,sell,US,QQQM,1,100,2,1,30,美股券商,US-1"
    ].join("\n");

    const preview = previewHistoricalTradeCsv(base, csv, "", null);

    expect(base.activities).toEqual([]);
    expect(base.holdings[0]?.quantity).toBe(10);
    expect(preview.importBatchId).toMatch(/^csv-batch-/);
    expect(preview).toMatchObject({
      importedCount: 2,
      buyCount: 1,
      sellCount: 1,
      twCount: 1,
      usCount: 1,
      firstDate: "2020-01-02",
      lastDate: "2020-02-03",
      accounts: ["台股券商", "美股券商"],
      feesTwd: 70,
      taxesTwd: 33
    });
    expect(preview.sampleRows).toHaveLength(2);
    expect(preview.sampleRows[1]).toMatchObject({
      market: "US",
      symbol: "QQQM",
      fxRate: 30
    });
  });

  it("uses the same duplicate guard during preview as the real import", () => {
    const csv = [
      "日期,買賣,市場,代號,股數,成交價,手續費,交易稅,帳戶,成交序號",
      "2020/01/02,買進,TW,2330,1,100,1,0,券商,A001"
    ].join("\n");
    const imported = importHistoricalTradeCsv(state(), csv, "", null);

    expect(() => previewHistoricalTradeCsv(imported.state, csv, "", null)).toThrow(/已經匯入過/);
  });

  it("assigns one stable batch ID to every row and can undo only that batch", () => {
    const firstCsv = [
      "日期,買賣,市場,代號,股數,成交價,手續費,交易稅,帳戶,成交序號",
      "2020/01/02,買進,TW,2330,1,100,1,0,台股券商,A001",
      "2020/01/03,賣出,TW,2330,1,110,1,1,台股券商,A002"
    ].join("\n");
    const secondCsv = [
      "日期,買賣,市場,代號,股數,成交價,手續費,交易稅,匯率,帳戶,成交序號",
      "2020/02/02,買進,US,QQQM,1,200,2,0,30,美股券商,B001"
    ].join("\n");

    const firstRows = parseHistoricalTradeCsv(firstCsv, "", null);
    expect(firstRows[0]?.importBatchId).toMatch(/^csv-batch-/);
    expect(new Set(firstRows.map((row) => row.importBatchId)).size).toBe(1);
    expect(parseHistoricalTradeCsv(firstCsv, "", null).map((row) => row.importBatchId))
      .toEqual(firstRows.map((row) => row.importBatchId));

    const base = state();
    const first = importHistoricalTradeCsv(base, firstCsv, "", null);
    const second = importHistoricalTradeCsv(first.state, secondCsv, "", null);
    const latest = latestHistoricalTradeCsvBatch(second.state);

    expect(second.state.holdings).toEqual(base.holdings);
    expect(latest).toMatchObject({
      importBatchId: second.importBatchId,
      remainingCount: 1,
      firstDate: "2020-02-02",
      lastDate: "2020-02-02",
      accounts: ["美股券商"]
    });

    const undoneSecond = undoHistoricalTradeCsvBatch(second.state, second.importBatchId);
    expect(undoneSecond.activities).toHaveLength(2);
    expect(undoneSecond.activities.every((activity) =>
      activity.historicalTrade?.importBatchId === first.importBatchId
    )).toBe(true);
    expect(undoneSecond.holdings).toEqual(base.holdings);

    const undoneFirst = undoHistoricalTradeCsvBatch(undoneSecond, first.importBatchId);
    expect(undoneFirst.activities).toEqual([]);
    expect(undoneFirst.holdings).toEqual(base.holdings);
    expect(() => undoHistoricalTradeCsvBatch(undoneFirst, first.importBatchId)).toThrow(/已不存在/);
  });

  it("provides a template that parses as both TW and US history", () => {
    const rows = parseHistoricalTradeCsv(historicalTradeCsvTemplate(), "預設帳戶", null);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.market)).toEqual(["TW", "US"]);
  });
});
