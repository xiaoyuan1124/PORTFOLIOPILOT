import { calculatePortfolioRisk } from "./portfolio-risk";
import { holdingValueTwd } from "./calc";
import type { EtfComposition,Holding } from "./types";

/** A read-only approximation in TWD; no orders or portfolio writes. */
export type AdjustmentMode = "hold" | "trim" | "exit" | "add" | "switch";
export type AdjustmentCostAssumptions = {
  buyFeePct:number;sellFeePct:number;minBuyFeeTwd:number;minSellFeeTwd:number;
  sellTaxPct:number;fxSpreadPct:number;
};
export type AdjustmentRequest = {
  mode:AdjustmentMode;fromHoldingId:string;toHoldingId?:string;
  shares?:number;newContributionTwd?:number;costs?:AdjustmentCostAssumptions;
};
export function simulatePortfolioAdjustment(
  holdings:Holding[],
  etfCompositions:EtfComposition[],
  usdTwd:number,
  input:AdjustmentRequest
) {
  if(!Number.isFinite(usdTwd)||usdTwd<=0)throw new Error("美元換算匯率無效。");
  const before=calculatePortfolioRisk(holdings,etfCompositions,usdTwd);
  const costs=input.costs;
  if(costs) {
    if(!Object.values(costs).every(Number.isFinite) || Object.values(costs).some(v=>v<0) ||
      costs.buyFeePct>10 || costs.sellFeePct>10 || costs.sellTaxPct>10 ||
      costs.fxSpreadPct>10 || costs.minBuyFeeTwd>1e6 || costs.minSellFeeTwd>1e6)
      throw new Error("請核對手動輸入的實際費率、最低費用與匯差。");
  }
  if(input.mode==="hold")return {before,after:before,changedHoldings:holdings,
    sharesSold:0,sharesBought:0,unspentTwd:0,spendTwd:0,proceedsTwd:0,
    estimatedCostTwd:costs?0:null,netSaleProceedsTwd:0,
    estimatedBuyFeeTwd:costs?0:null,estimatedSellFeeTaxTwd:costs?0:null,
    affordableShares:0,costsVerified:Boolean(costs)};
  const from=holdings.find(row=>row.id===input.fromHoldingId && row.type!=="cash");
  if(!from)throw new Error("請選擇現有證券持股。");
  const fromUnit=holdingValueTwd({...from,quantity:1},usdTwd);
  if(!Number.isFinite(fromUnit)||fromUnit<=0)throw new Error("持股參考價無效，拒絕換算。");
  const funds=Number(input.newContributionTwd??0);
  if(!Number.isFinite(funds)||funds<0||funds>1e12)throw new Error("額外投入金額必須有效且非負。");
  if(input.mode!=="add"&&funds!==0)throw new Error("新增資金僅限加碼模式。");
  const requested=Number(input.shares??0);
  if(!["hold","exit"].includes(input.mode)&&(!Number.isSafeInteger(requested)||requested<=0))
    throw new Error("交易參考股數需為正整數。");
  const sharesSold=input.mode==="exit"?from.quantity:
    ["trim","switch"].includes(input.mode)?requested:0;
  if(sharesSold>from.quantity||sharesSold<0)throw new Error("賣出股數不能超過現有持股。");
  if(["trim","switch","exit"].includes(input.mode)&&sharesSold<=0)throw new Error("沒有可賣出的證券。");
  let to:Holding|undefined;
  if(input.mode==="switch"){
    to=holdings.find(row=>row.id===input.toHoldingId&&row.type!=="cash");
    if(!to||to.id===from.id)throw new Error("換股目標必須是另一個已持有標的。");
  } else if(input.mode==="add") to=from;
  const toUnit=to?holdingValueTwd({...to,quantity:1},usdTwd):0;
  if(to&&(!Number.isFinite(toUnit)||toUnit<=0))throw new Error("買進標的參考價無效。");
  const proceedsTwd=sharesSold*fromUnit;
  const needsFxSell=Boolean(to&&from.currency==="USD"&&to.currency==="TWD");
  const needsFxBuy=Boolean(to&&to.currency==="USD"&&(input.mode==="add"||from.currency==="TWD"));
  // All user-defined commissions and tax rates are in percent, minimum fees in TWD.
  const sellFeeTax=costs&&sharesSold>0
    ?Math.max(costs.minSellFeeTwd,proceedsTwd*costs.sellFeePct/100)+
      proceedsTwd*costs.sellTaxPct/100+(needsFxSell?proceedsTwd*costs.fxSpreadPct/100:0):0;
  const netSale=proceedsTwd-sellFeeTax;
  if(netSale<-1e-8)throw new Error("手動費率使賣出後金額為負，請核對最低費用。");
  const availableTwd=Math.max(0,netSale)+(input.mode==="add"?funds:0);
  const buyFee=(shares:number)=>{
    if(!costs||shares<=0)return 0;
    const buyGross=shares*toUnit;
    return Math.max(costs.minBuyFeeTwd,buyGross*costs.buyFeePct/100)+
      (needsFxBuy?buyGross*costs.fxSpreadPct/100:0);
  };
  let affordableShares=0;
  if(to&&availableTwd>0){
    let lo=0,hi=Math.min(1_000_000_000,Math.floor(availableTwd/toUnit));
    while(lo<hi){
      const mid=Math.floor((lo+hi+1)/2);
      if(mid*toUnit+buyFee(mid)<=availableTwd+1e-8)lo=mid;
      else hi=mid-1;
    }
    affordableShares=lo;
  }
  const sharesBought=to
    ?input.mode==="add"?Math.min(requested,affordableShares):affordableShares
    :0;
  const spendTwd=sharesBought*toUnit;
  const estimatedBuyFee=buyFee(sharesBought);
  if(spendTwd+estimatedBuyFee>availableTwd+1e-6)throw new Error("情境超過預算。");
  const unspentTwd=Math.max(0,availableTwd-spendTwd-estimatedBuyFee);
  const changedHoldings:Holding[]=holdings.map(row=>{
    if(row.id===from.id)return {...row,quantity:row.quantity-sharesSold+(to?.id===from.id?sharesBought:0)};
    if(row.id===to?.id)return {...row,quantity:row.quantity+sharesBought};
    return {...row};
  }).filter(row=>row.type==="cash"||row.quantity>0);
  if(unspentTwd>1e-8){
    // Cash settlement stays in its native currency for US->US and US exits;
    // other scenarios track the user-supplied TWD budget, not real FX fills.
    const residualUsd=input.mode!=="add"&&from.currency==="USD"&&
      (!to||to.currency==="USD");
    changedHoldings.push({
      id:"__scenario_unspent__",symbol:residualUsd?"USD":"TWD",
      name:"情境餘額（非真實持股）",market:residualUsd?"US":"TW",type:"cash",
      quantity:residualUsd?unspentTwd/usdTwd:unspentTwd,price:1,averageCost:1,
      currency:residualUsd?"USD":"TWD",sector:"現金",account:"情境試算"
    });
  }
  const after=calculatePortfolioRisk(changedHoldings,etfCompositions,usdTwd);
  return {before,after,changedHoldings,sharesSold,sharesBought,unspentTwd,
    spendTwd,proceedsTwd,netSaleProceedsTwd:netSale,
    estimatedCostTwd:costs?sellFeeTax+estimatedBuyFee:null,
    estimatedBuyFeeTwd:costs?estimatedBuyFee:null,
    estimatedSellFeeTaxTwd:costs?sellFeeTax:null,
    affordableShares,costsVerified:Boolean(costs)};
}
