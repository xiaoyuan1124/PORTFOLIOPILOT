import { calculatePortfolioRisk } from "./portfolio-risk";
import { holdingValueTwd } from "./calc";
import type { EtfComposition, Holding } from "./types";

/** Pure, read-only, gross-value simulation; never commits orders or holdings. */
export type AdjustmentMode = "hold" | "trim" | "exit" | "add" | "switch";
export type AdjustmentRequest = {
  mode: AdjustmentMode;
  fromHoldingId: string;
  toHoldingId?: string;
  shares?: number;
  newContributionTwd?: number;
};
export function simulatePortfolioAdjustment(
  holdings: Holding[],
  etfCompositions: EtfComposition[],
  usdTwd: number,
  input: AdjustmentRequest
) {
  if (!Number.isFinite(usdTwd) || usdTwd <= 0) throw new Error("目前的美元換算匯率無效。");
  const before = calculatePortfolioRisk(holdings,etfCompositions,usdTwd);
  if(input.mode==="hold") return {before,after:before,changedHoldings:holdings,sharesSold:0,sharesBought:0,unspentTwd:0,spendTwd:0,proceedsTwd:0};
  const from=holdings.find(row=>row.id===input.fromHoldingId && row.type!=="cash");
  if(!from)throw new Error("請從目前的證券持股選擇要研究的標的。");
  const fromUnit=holdingValueTwd({...from,quantity:1},usdTwd);
  if(!Number.isFinite(fromUnit)||fromUnit<=0)throw new Error("選定持股沒有可用的價格，拒絕試算。");
  const newContributionTwd=Number(input.newContributionTwd??0);
  if(!Number.isFinite(newContributionTwd)||newContributionTwd<0 || newContributionTwd>1e12)throw new Error("額外投入金額必須是有效的非負數。");
  if(input.mode!=="add" && newContributionTwd>0)throw new Error("新增資金只適用分批加碼情境。");
  const rawShares=Number(input.shares??0);
  if(input.mode!=="exit" && (!Number.isSafeInteger(rawShares)||rawShares<=0))throw new Error("請輸入正整數股數。");
  const sharesSold=input.mode==="exit"?from.quantity:input.mode==="trim"||input.mode==="switch"?rawShares:0;
  if((input.mode==="trim"||input.mode==="switch") && sharesSold>from.quantity)throw new Error("模擬賣出股數不可超過現有持股。");
  if((input.mode==="trim"||input.mode==="switch"||input.mode==="exit") && sharesSold<=0)throw new Error("持股為零，無法賣出。");
  let to: Holding | undefined;
  if(input.mode==="switch") {
    to=holdings.find(row=>row.id===input.toHoldingId && row.type!=="cash");
    if(!to || to.id===from.id)throw new Error("請選擇另一個已持有證券作為換股對象；不新增虛構股票。");
  } else if(input.mode==="add") to=from;
  const toUnit=to?holdingValueTwd({...to,quantity:1},usdTwd):0;
  if(to && (!Number.isFinite(toUnit)||toUnit<=0))throw new Error("加碼標的的參考價格無效，拒絕試算。");
  const proceedsTwd=sharesSold*fromUnit;
  const availableTwd=proceedsTwd+(input.mode==="add"?newContributionTwd:0);
  const sharesBought=input.mode==="add"?rawShares:input.mode==="switch"?Math.floor(availableTwd/toUnit+1e-9):0;
  const spendTwd=sharesBought*toUnit;
  if(spendTwd>availableTwd+1e-8)throw new Error("預算不足：不得模擬超過可用資金的買進。");
  const unspentTwd=Math.max(0,availableTwd-spendTwd);
  // Hypothetical cash always stays in the total assets; never silently
  // disappears when trimming or switching. No trade fees/taxes assumed paid.
  const changedHoldings: Holding[]=holdings.map(row=>{
    if(row.id===from.id)return {...row,quantity:row.quantity-sharesSold+(to?.id===from.id?sharesBought:0)};
    if(row.id===to?.id)return {...row,quantity:row.quantity+sharesBought};
    return {...row};
  }).filter(row=>row.type==="cash"||row.quantity>0);
  if(unspentTwd>0)changedHoldings.push({
    id:"__scenario_twd_unspent__",symbol:"CASH",name:"情境餘額（非真實持股）",
    market:"TW",type:"cash",quantity:unspentTwd,price:1,averageCost:1,currency:"TWD",sector:"現金",account:"情境試算"
  });
  const after=calculatePortfolioRisk(changedHoldings,etfCompositions,usdTwd);
  return {before,after,changedHoldings,sharesSold,sharesBought,unspentTwd,spendTwd,proceedsTwd};
}
