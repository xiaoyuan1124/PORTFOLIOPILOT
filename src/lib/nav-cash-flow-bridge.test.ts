import { describe,it,expect } from "vitest";
import { navCashFlowBridge } from "./nav-cash-flow-bridge";
import type { NetWorthSnapshot,PortfolioActivity } from "./types";
const s=(date:string,total:number):NetWorthSnapshot=>({date,total,cost:total,gain:0,usdTwd:32});
const a=(date:string,type:"deposit"|"withdrawal",amount:number,currency:"TWD"|"USD"="TWD",fxRate=32):PortfolioActivity=>({
  id:date+type,date,type,symbol:"",amount,currency,fxRate,quantity:0,price:0,note:""
});
describe("dated NAV and external-flow reconciliation",()=>{
  it("distinguishes added principal from NAV change rather than calling it investment return",()=>{
    const result=navCashFlowBridge([s("2026-11-18",100000),s("2026-11-20",109000)],[a("2026-11-19","deposit",10000),a("2026-11-20","withdrawal",2000)])!;
    expect(result.depositsTwd).toBe(10000);
    expect(result.withdrawalsTwd).toBe(2000);
    expect(result.changeTwd).toBe(9000);
    expect(result.residualTwd).toBe(1000);
  });
  it("preserves USD cash flows with recorded reference FX and declines to invent invalid conversions",()=>{
    const result=navCashFlowBridge([s("2026-11-18",100000),s("2026-11-20",110000)],[a("2026-11-19","deposit",100,"USD",32),a("2026-11-20","withdrawal",20,"USD",0)])!;
    expect(result.depositsTwd).toBe(3200);
    expect(result.complete).toBe(false);
    expect(result.invalidCashFlows).toBe(1);
    expect(result.residualTwd).toBeNull();
  });
  it("does not attribute same-day opening cash flows without intraday boundary",()=>{
    const result=navCashFlowBridge([s("2026-11-18",100),s("2026-11-19",110)],[a("2026-11-18","deposit",100)])!;
    expect(result.depositsTwd).toBe(0);
    expect(result.residualTwd).toBe(10);
  });
  it("refuses single-day or empty intervals",()=> {
    expect(navCashFlowBridge([s("2026-11-18",100)],[])).toBeNull();
    expect(navCashFlowBridge([s("2026-11-18",100),s("2026-11-18",110)],[])).toBeNull();
  });
});
