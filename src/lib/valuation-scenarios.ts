/**
 * User-authored EPS/PE sensitivities only. Official PE is a reference, NOT
 * forward EPS. Does not pretend to obtain licensed analyst forecasts.
 */
export type EpsPeScenario = { label: "悲觀" | "基準" | "樂觀"; epsGrowthPct: number; peMultiple: number };
export type ValuationInputs = { referenceClose: number; epsTtm: number; scenarios: EpsPeScenario[] };
export type ValuationOutcome = {
  label: EpsPeScenario["label"];
  epsScenario: number;
  hypotheticalPrice: number;
  priceChangePct: number;
  marginOfSafetyPct: number;
  formula: string;
};
export function calculateEpsPeScenarios(input: ValuationInputs): ValuationOutcome[] {
  if (!Number.isFinite(input.referenceClose) || input.referenceClose <= 0) throw new Error("缺少可信且正數的參考收盤價。");
  if (!Number.isFinite(input.epsTtm) || input.epsTtm <= 0) throw new Error("負 EPS、零 EPS 或缺值不能套用正本益比情境。");
  if (input.scenarios.length !== 3 || new Set(input.scenarios.map(s=>s.label)).size !== 3 ||
    input.scenarios.some(s=>!Number.isFinite(s.epsGrowthPct)||s.epsGrowthPct<=-100||s.epsGrowthPct>1000||
      !Number.isFinite(s.peMultiple)||s.peMultiple<=0||s.peMultiple>1000))
    throw new Error("請核對三種情境的 EPS 增長率與正數本益比，EPS 不能降至零或負值。");
  const values=input.scenarios.map(s=>{
    const epsScenario=input.epsTtm*(1+s.epsGrowthPct/100);
    const hypotheticalPrice=epsScenario*s.peMultiple;
    if (!Number.isFinite(hypotheticalPrice)||hypotheticalPrice<=0) throw new Error("情境數值溢位，無法計算。");
    return {label:s.label,epsScenario,hypotheticalPrice,
      priceChangePct:(hypotheticalPrice/input.referenceClose-1)*100,
      marginOfSafetyPct:(1-input.referenceClose/hypotheticalPrice)*100,
      formula:`假設 EPS ${input.epsTtm} × (1 + ${s.epsGrowthPct}%) × 假設 PE ${s.peMultiple}`};
  });
  if (values[0]!.hypotheticalPrice>values[1]!.hypotheticalPrice ||
    values[1]!.hypotheticalPrice>values[2]!.hypotheticalPrice) {
    throw new Error("情境價位需依悲觀 ≤ 基準 ≤ 樂觀排列；請調整假設，不自動重排資料。");
  }
  return values;
}
