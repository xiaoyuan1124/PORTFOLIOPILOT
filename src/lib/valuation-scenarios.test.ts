import {describe,it,expect} from "vitest";
import {calculateEpsPeScenarios} from "./valuation-scenarios";
const inputs={referenceClose:100,epsTtm:5,scenarios:[
 {label:"悲觀" as const,epsGrowthPct:-20,peMultiple:10},
 {label:"基準" as const,epsGrowthPct:0,peMultiple:20},
 {label:"樂觀" as const,epsGrowthPct:20,peMultiple:25}
]};
describe("user-specified EPS/PE valuation sensitivities",()=>{
 it("calculates transparently without forecasting or inventing official EPS",()=>{
  const r=calculateEpsPeScenarios(inputs);
  expect(r.map(x=>x.hypotheticalPrice)).toEqual([40,100,150]);
  expect(r[0]!.priceChangePct).toBe(-60);
  expect(r[1]!.marginOfSafetyPct).toBe(0);
  expect(r[2]!.priceChangePct).toBe(50);
 });
 it("rejects zero EPS, negative EPS and nonpositive PE",()=>{
  expect(()=>calculateEpsPeScenarios({...inputs,epsTtm:0})).toThrow();
  expect(()=>calculateEpsPeScenarios({...inputs,epsTtm:-1})).toThrow();
  expect(()=>calculateEpsPeScenarios({...inputs,scenarios:[{...inputs.scenarios[0]!,peMultiple:0},...inputs.scenarios.slice(1)]})).toThrow();
 });
 it("rejects impossible or crossed cases instead of silently sorting",()=>{
  expect(()=>calculateEpsPeScenarios({...inputs,scenarios:[{...inputs.scenarios[0]!,peMultiple:99},...inputs.scenarios.slice(1)]})).toThrow(/悲觀/);
  expect(()=>calculateEpsPeScenarios({...inputs,scenarios:[{...inputs.scenarios[0]!,epsGrowthPct:-100},...inputs.scenarios.slice(1)]})).toThrow();
 });
});
