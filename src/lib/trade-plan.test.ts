import { describe,expect,it } from "vitest";
import { simulateLongTradePlan } from "./trade-plan";
const input = {entry:100,invalidation:95,target:110,budgetTwd:30000,maxLossTwd:3000};
describe("local-first trade scenario math",()=>{
  it("calculates risk-based whole shares without claiming a filled order",()=>{
    const r=simulateLongTradePlan(input);
    expect(r.shares).toBe(300);
    expect(r.investedTwd).toBe(30000);
    expect(r.grossRiskTwd).toBe(1500);
    expect(r.grossRewardRisk).toBe(2);
    expect(r.netRiskTwd).toBeNull();
  });
  it("respects both risk cap and budget with nonzero verified manual costs",()=>{
    const r=simulateLongTradePlan({...input,fees:{feePct:0.1425,minimumFeeTwd:20,sellTaxPct:0.3}});
    expect(r.shares).toBeLessThan(300);
    expect(r.investedTwd+(r.estimatedEntryFeeTwd??0)).toBeLessThanOrEqual(input.budgetTwd);
    expect(r.netRiskTwd).toBeLessThanOrEqual(input.maxLossTwd);
    expect(r.netRewardTwd).not.toBeNull();
  });
  it("never buys if one share breaches capital or risk constraints",()=>{
    expect(simulateLongTradePlan({...input,budgetTwd:20}).shares).toBe(0);
    expect(simulateLongTradePlan({...input,maxLossTwd:1}).shares).toBe(0);
  });
  it("rejects nonsensical prices, negative fees and zero stop risk",()=>{
    expect(()=>simulateLongTradePlan({...input,invalidation:100})).toThrow();
    expect(()=>simulateLongTradePlan({...input,target:99})).toThrow();
    expect(()=>simulateLongTradePlan({...input,fees:{feePct:-1,minimumFeeTwd:0,sellTaxPct:0}})).toThrow();
  });
});
