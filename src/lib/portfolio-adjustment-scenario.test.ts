import {describe,it,expect} from "vitest";
import type {Holding,EtfComposition} from "./types";
import {simulatePortfolioAdjustment} from "./portfolio-adjustment-scenario";
const holdings:Holding[]=[
  {id:"tech",market:"TW",symbol:"2330",name:"台積電",type:"stock",quantity:10,price:1000,averageCost:900,currency:"TWD",sector:"半導體"},
  {id:"etf",market:"TW",symbol:"009816",name:"台股 ETF",type:"etf",quantity:200,price:15,averageCost:14,currency:"TWD",sector:"ETF"},
  {id:"cash",market:"TW",symbol:"TWD",name:"現金",type:"cash",quantity:1000,price:1,averageCost:1,currency:"TWD",sector:"現金"}
];
const constituents:EtfComposition[]=[{id:"etf1",etfMarket:"TW",etfSymbol:"009816",etfName:"ETF",asOf:"2026-11-18",sourceName:"test",sourceUrl:"https://example.com",sourceType:"user_import",constituents:[{symbol:"2330",name:"台積電",market:"TW",weightPct:40,sector:"半導體"}]}];
describe("read-only, ETF look-through portfolio adjustment",()=>{
  it("holds without changing assets",()=>{
    const r=simulatePortfolioAdjustment(holdings,constituents,32,{mode:"hold",fromHoldingId:"tech"});
    expect(r.changedHoldings).toBe(holdings);
    expect(r.before.portfolioValueTwd).toBe(r.after.portfolioValueTwd);
  });
  it("exit keeps sale value in hypothetical cash and removes real tech, not ETF look-through",()=>{
    const r=simulatePortfolioAdjustment(holdings,constituents,32,{mode:"exit",fromHoldingId:"tech"});
    expect(r.sharesSold).toBe(10);
    expect(r.changedHoldings.find(x=>x.id==="tech")).toBeUndefined();
    expect(r.unspentTwd).toBe(10000);
    expect(r.after.portfolioValueTwd).toBeCloseTo(r.before.portfolioValueTwd);
    expect(r.after.unresolvedEtfValueTwd).toBe(r.before.unresolvedEtfValueTwd);
  });
  it("switches to a held ETF and preserves total including unspent cash",()=>{
    const r=simulatePortfolioAdjustment(holdings,constituents,32,{mode:"switch",fromHoldingId:"tech",toHoldingId:"etf",shares:2});
    expect(r.sharesSold).toBe(2);
    expect(r.sharesBought).toBe(133);
    expect(r.unspentTwd).toBe(5);
    expect(r.after.portfolioValueTwd).toBeCloseTo(r.before.portfolioValueTwd);
    expect(r.after.largestCompany?.portfolioPct).toBeLessThan(r.before.largestCompany?.portfolioPct??Infinity);
  });
  it("does not force a buy when budget is smaller than one share, and rejects impossible trade",()=>{
    const r=simulatePortfolioAdjustment(holdings,[],32,{mode:"switch",fromHoldingId:"etf",toHoldingId:"tech",shares:1});
    expect(r.sharesBought).toBe(0);
    expect(r.unspentTwd).toBe(15);
    expect(()=>simulatePortfolioAdjustment(holdings,[],32,{mode:"trim",fromHoldingId:"tech",shares:11})).toThrow();
    expect(()=>simulatePortfolioAdjustment(holdings,[],32,{mode:"add",fromHoldingId:"tech",shares:2,newContributionTwd:1000})).toThrow();
  });
  it("adds funded positions without mandatory defensive cash",()=>{
    const r=simulatePortfolioAdjustment(holdings,[],32,{mode:"add",fromHoldingId:"etf",shares:5,newContributionTwd:100});
    expect(r.sharesBought).toBe(5);
    expect(r.unspentTwd).toBe(25);
    expect(r.after.portfolioValueTwd).toBeCloseTo(r.before.portfolioValueTwd+100);
  });
});
