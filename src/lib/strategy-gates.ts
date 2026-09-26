import {
  evaluateThreeMonthRevenueGate,
  type RevenueHistoryCache
} from "./revenue-history";
import {
  institutionalByCode,
  type InstitutionalCache
} from "./institutional-data";

export type PreliminaryStrategyResult = {
  code: string;
  name: string;
  market: "TWSE" | "TPEx";
  industry: string;
  revenuePeriods: Array<{ period: string; yoyPct: number | null; revenue: number }>;
  revenuePass: boolean;
  foreign10d: number | null;
  trust10d: number | null;
  foreignPass: boolean;
  trustPass: boolean;
  threeOfficialGatesPass: boolean;
};

export function evaluatePreGrossMarginStrategy(
  revenueCache: RevenueHistoryCache,
  institutionalCache: InstitutionalCache
): PreliminaryStrategyResult[] {
  const revenue = evaluateThreeMonthRevenueGate(revenueCache);
  const institutional = institutionalByCode(institutionalCache);

  return revenue.map((item) => {
    const flow = institutional.get(item.code.toUpperCase()) ?? null;
    const foreignPass = flow !== null && flow.foreign10d > 0;
    const trustPass = flow !== null && flow.trust10d > 0;

    return {
      code: item.code,
      name: item.name,
      market: item.market,
      industry: item.industry,
      revenuePeriods: item.periods,
      revenuePass: item.pass,
      foreign10d: flow?.foreign10d ?? null,
      trust10d: flow?.trust10d ?? null,
      foreignPass,
      trustPass,
      threeOfficialGatesPass: item.pass && foreignPass && trustPass
    };
  }).sort((a, b) => {
    if (a.threeOfficialGatesPass !== b.threeOfficialGatesPass) {
      return a.threeOfficialGatesPass ? -1 : 1;
    }
    const aScore = Number(a.revenuePass) + Number(a.foreignPass) + Number(a.trustPass);
    const bScore = Number(b.revenuePass) + Number(b.foreignPass) + Number(b.trustPass);
    return bScore - aScore;
  });
}
