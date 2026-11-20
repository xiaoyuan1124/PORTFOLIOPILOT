import {describe,it,expect} from "vitest";
import type {Holding,EtfComposition} from "./types";
import {simulatePortfolioAdjustment,type AdjustmentCostAssumptions} from "./portfolio-adjustment-scenario";
const holdings:Holding[]=[
  {id:"tech",market:"TW",symbol:"2330",name:"台積電",type:"stock",quantity:10,price:1000,averageCost:900,currency:"TWD",sector:"半導體"},
  {id:"etf",market:"TW",symbol:"009816",name:"台股 ETF",type:"etf",quantity:200,price:15,averageCost:14,currency:"TWD",sector:"ETF"},
  {id:"cash",market:"TW",symbol:"TWD",name:"現金",type:"cash",quantity:1000,price:1,averageCost:1,currency:"TWD",sector:"現金"}
];
const constituents:EtfComposition[]=[{id:"etf1",etfMarket:"TW",etfSymbol:"009816",etfName:"ETF",asOf:"2026-11-18",sourceName:"test",sourceUrl:"https://example.com",sourceType:"user_import",constituents:[{symbol:"2330",name:"台積電",market:"TW",weightPct:40,sector:"半導體"}]}];
const fees:AdjustmentCostAssumptions={buyFeePct:0.1425,sellFeePct:0.1425,minBuyFeeTwd:20,minSellFeeTwd:20,sellTaxPct:0.3,fxSpreadPct:0.5};
describe("read-only, fee-aware ETF look-through adjustment",()=>{
  it("holds without mutating local assets",()=>{
    const r=simulatePortfolioAdjustment(holdings,constituents,32,{mode:"hold",fromHoldingId:"tech"});
    expect(r.changedHoldings).toBe(holdings);
    expect(r.before.portfolioValueTwd).toBe(r.after.portfolioValueTwd);
  });
  it("exits into hypothetical cash; keeps look-through ETF unknown weight unchanged",()=>{
    const r=simulatePortfolioAdjustment(holdings,constituents,32,{mode:"exit",fromHoldingId:"tech"});
    expect(r.sharesSold).toBe(10);
    expect(r.changedHoldings.find(x=>x.id==="tech")).toBeUndefined();
    expect(r.unspentTwd).toBe(10000);
    expect(r.after.portfolioValueTwd).toBeCloseTo(r.before.portfolioValueTwd);
    expect(r.estimatedCostTwd).toBeNull();
  });
  it("switches into an existing ETF, maintains unused cash and exposure",()=>{
    const r=simulatePortfolioAdjustment(holdings,constituents,32,{mode:"switch",fromHoldingId:"tech",toHoldingId:"etf",shares:2});
    expect(r.sharesBought).toBe(133);
    expect(r.unspentTwd).toBe(5);
    expect(r.after.portfolioValueTwd).toBeCloseTo(r.before.portfolioValueTwd);
    expect(r.after.largestCompany?.portfolioPct).toBeLessThan(r.before.largestCompany?.portfolioPct??Infinity);
  });
  it("affordable shares become zero rather than forcing purchases",()=>{
    const r=simulatePortfolioAdjustment(holdings,[],32,{mode:"switch",fromHoldingId:"etf",toHoldingId:"tech",shares:1});
    expect(r.sharesBought).toBe(0);
    expect(r.unspentTwd).toBe(15);
    const add=simulatePortfolioAdjustment(holdings,[],32,{mode:"add",fromHoldingId:"tech",shares:2,newContributionTwd:1000});
    expect(add.sharesBought).toBe(1);
    expect(add.unspentTwd).toBeCloseTo(0);
    expect(()=>simulatePortfolioAdjustment(holdings,[],32,{mode:"trim",fromHoldingId:"tech",shares:11})).toThrow();
  });
  it("deducts manual fees and taxes without treating assumed gross PnL as actual",()=>{
    const r=simulatePortfolioAdjustment(holdings,constituents,32,{mode:"switch",fromHoldingId:"tech",toHoldingId:"etf",shares:2,costs:fees});
    expect(r.netSaleProceedsTwd).toBeLessThan(r.proceedsTwd);
    expect(r.sharesBought).toBeLessThanOrEqual(133);
    expect(r.estimatedCostTwd).toBeGreaterThan(0);
    expect(r.after.portfolioValueTwd).toBeCloseTo(r.before.portfolioValueTwd-r.estimatedCostTwd!);
  });
  it("checks cross-currency reference FX and retains unspent US proceeds in USD",()=>{
    const us:Holding={id:"us",market:"US",symbol:"VOO",name:"VOO",type:"etf",quantity:2,price:500,averageCost:450,currency:"USD",sector:"美股"};
    const r=simulatePortfolioAdjustment([...holdings,us],[],32,{mode:"exit",fromHoldingId:"us",costs:fees});
    const leftover=r.changedHoldings.find(h=>h.id==="__scenario_unspent__");
    expect(leftover?.currency).toBe("USD");
    expect(r.after.portfolioValueTwd).toBeCloseTo(r.before.portfolioValueTwd-r.estimatedCostTwd!);
    expect(()=>simulatePortfolioAdjustment(holdings,[],0,{mode:"hold",fromHoldingId:"tech"})).toThrow();
  });
  it("requires verified manual cost model; never accepts negative or excessive fee rates",()=>{
    expect(()=>simulatePortfolioAdjustment(holdings,[],32,{mode:"switch",fromHoldingId:"tech",toHoldingId:"etf",shares:2,costs:{...fees,buyFeePct:-1}})).toThrow();
    expect(()=>simulatePortfolioAdjustment(holdings,[],32,{mode:"add",fromHoldingId:"etf",shares:2,newContributionTwd:20,costs:fees})).not.toThrow();
    expect(simulatePortfolioAdjustment(holdings,[],32,{mode:"add",fromHoldingId:"etf",shares:2,newContributionTwd:20,costs:fees}).sharesBought).toBe(0);
  });
});
