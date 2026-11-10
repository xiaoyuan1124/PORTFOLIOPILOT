import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUANT_CONFIG, quantSignals, projectGrowthScenarios,
  runQuantResearch, validateQuantPrices, type QuantPrice
} from "./quant-research";

function fixture(n = 300, mode: "volatile" | "flat" | "trend" = "volatile"): QuantPrice[] {
  let t = Date.UTC(2024, 0, 2);
  const prices: QuantPrice[] = [];
  let price = 100;
  while (prices.length < n) {
    const date = new Date(t);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) {
      const i = prices.length;
      const factor = mode === "flat" ? 1
        : mode === "trend" ? 1.002
        : 1.0007 + 0.025 * Math.sin(i * 0.37);
      price *= factor;
      prices.push([date.toISOString().slice(0, 10), price]);
    }
    t += 86_400_000;
  }
  return prices;
}
describe("PilotQuant native historical and path model", () => {
  it("rejects missing, duplicate and unsorted official observations", () => {
    expect(() => validateQuantPrices(fixture(119))).toThrow(/120/);
    expect(() => validateQuantPrices([...fixture(), fixture()[0]])).toThrow();
    const prices = fixture();
    prices[1] = [prices[1][0], -5];
    expect(() => validateQuantPrices(prices)).toThrow();
  });
  it("executes only on the following close, never at its signal close", () => {
    const prices = fixture();
    const report = runQuantResearch(prices);
    const signals = quantSignals(prices, DEFAULT_QUANT_CONFIG);
    for (const trade of report.total.trades) {
      const i = prices.findIndex(p => p[0] === trade.date);
      expect(i).toBeGreaterThan(0);
      expect(trade.signalDate).toBe(prices[i - 1][0]);
      expect(signals[i - 1]).toBe(trade.action === "買入" ? "buy" : "sell");
    }
    expect(report.total.equity).toHaveLength(prices.length);
  });
  it("deducts commission, minimum fee, slippage and sell-side tax", () => {
    const data = fixture(300);
    const cost = runQuantResearch(data, DEFAULT_QUANT_CONFIG);
    const free = runQuantResearch(data, {
      ...DEFAULT_QUANT_CONFIG, feeBps: 0, minimumFeeTwd: 0, slippageBps: 0, sellTaxBps: 0
    });
    expect(cost.total.endingEquity).toBeLessThan(free.total.endingEquity);
    expect(cost.total.buyHoldReturnPct).toBeLessThan(free.total.buyHoldReturnPct);
  });
  it("does not spend unsettled T+2 proceeds when reinvesting", () => {
    const prices = fixture(300);
    const cfg = DEFAULT_QUANT_CONFIG;
    const trades = runQuantResearch(prices, cfg).total.trades;
    let settledCash = cfg.capital;
    const unsettled: Array<{ release: number; amount: number }> = [];
    let sells = 0;
    for (const trade of trades) {
      const day = prices.findIndex(p => p[0] === trade.date);
      expect(day).toBeGreaterThanOrEqual(0);
      if (trade.action === "買入") {
        const blocked = unsettled.filter(p => p.release > day).reduce((sum, row) => sum + row.amount, 0);
        const debit = trade.price * trade.shares + trade.fees;
        expect(debit).toBeLessThanOrEqual(settledCash - blocked + 0.001);
        settledCash -= debit;
      } else {
        sells++;
        const net = trade.price * trade.shares - trade.fees - trade.tax;
        settledCash += net;
        unsettled.push({ release: day + 2, amount: net });
      }
      expect(trade.cashAfter).toBeCloseTo(settledCash, 5);
    }
    expect(sells).toBeGreaterThan(0);
  });
  it("does not count open positions as a closed win", () => {
    const report = runQuantResearch(fixture(200, "trend"));
    expect(report.total.wins).toBeLessThanOrEqual(report.total.completedTrades);
    if (report.total.completedTrades === 0) expect(report.total.winRatePct).toBeNull();
  });
  it("retains an independent 70/30 holdout and cannot leak later data into training", () => {
    const a = fixture(300);
    const b = a.map(p => [p[0], p[1]] as QuantPrice);
    for (let i = 215; i < b.length; i++) b[i] = [b[i][0], b[i][1] * 1.3];
    const rA = runQuantResearch(a), rB = runQuantResearch(b);
    expect(rA.splitDate).toBe(a[210][0]);
    expect(rA.inSample.totalReturnPct).toEqual(rB.inSample.totalReturnPct);
    expect(rA.outOfSample.firstDate).toBe(a[210][0]);
    expect(rA.outOfSample.equity.length).toBe(90);
  });
  it("rejects invalid strategy and budget configuration", () => {
    expect(() => runQuantResearch(fixture(), { ...DEFAULT_QUANT_CONFIG, fast: 100, slow: 20 })).toThrow(/短均線/);
    expect(() => runQuantResearch(fixture(), { ...DEFAULT_QUANT_CONFIG, capital: -1 })).toThrow(/本金/);
  });
  it("supports all three strategies and cost-matched buy-and-hold", () => {
    for (const strategy of ["sma", "rsi", "breakout"] as const) {
      const report = runQuantResearch(fixture(), { ...DEFAULT_QUANT_CONFIG, strategy });
      expect(Number.isFinite(report.total.totalReturnPct)).toBe(true);
      expect(Number.isFinite(report.outOfSample.buyHoldReturnPct)).toBe(true);
    }
  });
  it("produces deterministic ordered scenario percentiles and historical anchor", () => {
    const p = fixture();
    const one = projectGrowthScenarios(p, 126, 1124), two = projectGrowthScenarios(p, 126, 1124);
    expect(one).toEqual(two);
    expect(one.paths).toHaveLength(127);
    expect(one.paths[0].median).toBeCloseTo(p.at(-1)![1]);
    for (const row of one.paths) {
      expect(row.low).toBeLessThanOrEqual(row.median);
      expect(row.median).toBeLessThanOrEqual(row.high);
      expect(Number.isFinite(row.high)).toBe(true);
    }
  });
  it("rejects unrealistic raw-price corporate action jumps and unknown horizon", () => {
    const p = fixture();
    p[p.length - 1] = [p.at(-1)![0], p.at(-1)![1] * 1.6];
    expect(() => projectGrowthScenarios(p)).toThrow(/拆併股/);
    expect(() => projectGrowthScenarios(fixture(), 19)).toThrow(/期間/);
  });
  it("remains a descriptive simulation with flat input, not an assured positive forecast", () => {
    const p = fixture(300, "flat");
    const result = projectGrowthScenarios(p, 21);
    expect(result.paths[21].median).toBeCloseTo(result.lastClose);
    expect(result.annualVolatilityPct).toBe(0);
  });
});
