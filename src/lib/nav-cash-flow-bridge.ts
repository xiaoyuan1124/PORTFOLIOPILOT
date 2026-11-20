import type { NetWorthSnapshot, PortfolioActivity } from "./types";
import { activityAmountTwd } from "./performance";

export type NavCashFlowBridge = {
  startDate: string;
  endDate: string;
  changeTwd: number;
  depositsTwd: number;
  withdrawalsTwd: number;
  netCashFlowTwd: number;
  residualTwd: number | null;
  invalidCashFlows: number;
  complete: boolean;
};

/**
 * Reconciles observable recorded NAV with dated external cash movements only.
 * Residual is NOT investment PnL: manual holding edits, incomplete history,
 * FX marks, corporate actions and pricing corrections may also affect it.
 * Cash flows on the opening date are excluded because intraday ordering
 * relative to a daily closing NAV is unknown.
 */
export function navCashFlowBridge(
  snapshots: NetWorthSnapshot[],
  activities: PortfolioActivity[]
): NavCashFlowBridge | null {
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].filter(x => Number.isFinite(x.total)).sort((a,b)=>a.date.localeCompare(b.date));
  const first=sorted[0],last=sorted.at(-1);
  if(!first || !last || first.date>=last.date)return null;
  let depositsTwd=0,withdrawalsTwd=0,invalidCashFlows=0;
  for (const row of activities) {
    if(row.date <= first.date || row.date > last.date || (row.type!=="deposit" && row.type!=="withdrawal"))continue;
    const amount=activityAmountTwd(row);
    if(!Number.isFinite(amount) || amount<0 || (row.currency==="USD" && (!Number.isFinite(row.fxRate) || row.fxRate<=0))) {
      invalidCashFlows++;
      continue;
    }
    if(row.type==="deposit")depositsTwd+=amount;
    else withdrawalsTwd+=amount;
  }
  const changeTwd=last.total-first.total;
  const netCashFlowTwd=depositsTwd-withdrawalsTwd;
  return {
    startDate:first.date,endDate:last.date,changeTwd,depositsTwd,withdrawalsTwd,netCashFlowTwd,
    residualTwd:invalidCashFlows===0?changeTwd-netCashFlowTwd:null,
    invalidCashFlows,complete:invalidCashFlows===0
  };
}
