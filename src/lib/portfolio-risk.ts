import { holdingValueTwd } from "./calc";
import { calculateEtfLookThrough, type CompanyExposure } from "./etf-lookthrough";
import type { EtfComposition, Holding } from "./types";

export type RiskSlice = {
  key: string;
  label: string;
  valueTwd: number;
  portfolioPct: number;
};

export type PortfolioRiskNotice = {
  id: string;
  severity: "attention" | "info";
  title: string;
  detail: string;
  valuePct?: number;
};

export type PortfolioRiskResult = {
  portfolioValueTwd: number;
  investedValueTwd: number;
  cashValueTwd: number;
  cashPct: number;
  resolvedCompanyValueTwd: number;
  resolvedCompanyPct: number;
  riskCoveragePct: number;
  unresolvedEtfValueTwd: number;
  unresolvedEtfPct: number;
  companyExposures: CompanyExposure[];
  sectorExposures: RiskSlice[];
  marketExposures: RiskSlice[];
  largestCompany: CompanyExposure | null;
  largestSector: RiskSlice | null;
  top5CompanyPct: number;
  top3SectorPct: number;
  resolvedCompanyHhi: number | null;
  effectiveCompanyCount: number | null;
};

function pct(value: number, denominator: number) {
  return denominator > 0 ? (value / denominator) * 100 : 0;
}

function aggregate(
  exposures: CompanyExposure[],
  portfolioValueTwd: number,
  keyOf: (exposure: CompanyExposure) => string,
  labelOf: (key: string) => string = (key) => key
): RiskSlice[] {
  const map = new Map<string, number>();
  for (const exposure of exposures) {
    const key = keyOf(exposure) || "未分類";
    map.set(key, (map.get(key) ?? 0) + exposure.totalValueTwd);
  }

  return [...map.entries()]
    .map(([key, valueTwd]) => ({
      key,
      label: labelOf(key),
      valueTwd,
      portfolioPct: pct(valueTwd, portfolioValueTwd)
    }))
    .sort((a, b) => b.valueTwd - a.valueTwd);
}

function marketLabel(market: string) {
  if (market === "TW") return "台灣";
  if (market === "US") return "美國";
  return market;
}

export function calculatePortfolioRisk(
  holdings: Holding[],
  compositions: EtfComposition[],
  usdTwd: number
): PortfolioRiskResult {
  const lookThrough = calculateEtfLookThrough(holdings, compositions, usdTwd);
  const portfolioValueTwd = lookThrough.portfolioValueTwd;
  const cashValueTwd = holdings
    .filter((holding) => holding.type === "cash")
    .reduce((sum, holding) => sum + holdingValueTwd(holding, usdTwd), 0);
  const investedValueTwd = Math.max(portfolioValueTwd - cashValueTwd, 0);
  const resolvedCompanyValueTwd = lookThrough.exposures.reduce(
    (sum, exposure) => sum + exposure.totalValueTwd,
    0
  );

  const companyExposures = lookThrough.exposures;
  const sectorExposures = aggregate(
    companyExposures,
    portfolioValueTwd,
    (exposure) => exposure.sector || "未分類"
  );
  const marketExposures = aggregate(
    companyExposures,
    portfolioValueTwd,
    (exposure) => exposure.market,
    marketLabel
  );

  const top5CompanyValue = companyExposures
    .slice(0, 5)
    .reduce((sum, exposure) => sum + exposure.totalValueTwd, 0);
  const top3SectorValue = sectorExposures
    .slice(0, 3)
    .reduce((sum, exposure) => sum + exposure.valueTwd, 0);

  let resolvedCompanyHhi: number | null = null;
  let effectiveCompanyCount: number | null = null;
  if (resolvedCompanyValueTwd > 0) {
    resolvedCompanyHhi = companyExposures.reduce((sum, exposure) => {
      const share = exposure.totalValueTwd / resolvedCompanyValueTwd;
      return sum + share * share * 10_000;
    }, 0);
    effectiveCompanyCount = resolvedCompanyHhi > 0 ? 10_000 / resolvedCompanyHhi : null;
  }

  return {
    portfolioValueTwd,
    investedValueTwd,
    cashValueTwd,
    cashPct: pct(cashValueTwd, portfolioValueTwd),
    resolvedCompanyValueTwd,
    resolvedCompanyPct: pct(resolvedCompanyValueTwd, portfolioValueTwd),
    riskCoveragePct: pct(resolvedCompanyValueTwd, investedValueTwd),
    unresolvedEtfValueTwd: lookThrough.unresolvedEtfValueTwd,
    unresolvedEtfPct: pct(lookThrough.unresolvedEtfValueTwd, portfolioValueTwd),
    companyExposures,
    sectorExposures,
    marketExposures,
    largestCompany: companyExposures[0] ?? null,
    largestSector: sectorExposures[0] ?? null,
    top5CompanyPct: pct(top5CompanyValue, portfolioValueTwd),
    top3SectorPct: pct(top3SectorValue, portfolioValueTwd),
    resolvedCompanyHhi,
    effectiveCompanyCount
  };
}


export const portfolioRiskNoticeThresholds = {
  largestCompanyPct: 20,
  top5CompanyPct: 70,
  largestSectorPct: 40,
  unresolvedEtfPct: 10,
  riskCoveragePct: 90,
  duplicateCompanyPct: 10
} as const;

export function buildPortfolioRiskNotices(risk: PortfolioRiskResult): PortfolioRiskNotice[] {
  const notices: PortfolioRiskNotice[] = [];
  const thresholds = portfolioRiskNoticeThresholds;

  if (risk.largestCompany && risk.largestCompany.portfolioPct >= thresholds.largestCompanyPct) {
    notices.push({
      id: "largest-company",
      severity: "attention",
      title: "單一公司曝險偏高",
      detail: `${risk.largestCompany.name}（${risk.largestCompany.symbol}）穿透後占總資產 ${risk.largestCompany.portfolioPct.toFixed(1)}%。`,
      valuePct: risk.largestCompany.portfolioPct
    });
  }

  if (risk.top5CompanyPct >= thresholds.top5CompanyPct) {
    notices.push({
      id: "top5-companies",
      severity: "attention",
      title: "前五大公司集中",
      detail: `前五大公司合計占總資產 ${risk.top5CompanyPct.toFixed(1)}%。`,
      valuePct: risk.top5CompanyPct
    });
  }

  if (risk.largestSector && risk.largestSector.portfolioPct >= thresholds.largestSectorPct) {
    notices.push({
      id: "largest-sector",
      severity: "attention",
      title: "單一產業曝險偏高",
      detail: `${risk.largestSector.label}占總資產 ${risk.largestSector.portfolioPct.toFixed(1)}%。`,
      valuePct: risk.largestSector.portfolioPct
    });
  }

  const duplicateExposures = risk.companyExposures
    .filter((row) =>
      row.directValueTwd > 0 &&
      row.implicitValueTwd > 0 &&
      row.portfolioPct >= thresholds.duplicateCompanyPct
    )
    .slice(0, 3);

  for (const row of duplicateExposures) {
    notices.push({
      id: `duplicate:${row.market}:${row.symbol}`,
      severity: "attention",
      title: "直接持股＋ETF 重複曝險",
      detail: `${row.name}（${row.symbol}）總曝險 ${row.portfolioPct.toFixed(1)}%，同時來自直接持股與 ETF 成份。`,
      valuePct: row.portfolioPct
    });
  }

  if (risk.unresolvedEtfPct >= thresholds.unresolvedEtfPct || risk.riskCoveragePct < thresholds.riskCoveragePct) {
    notices.push({
      id: "coverage",
      severity: "info",
      title: "部分 ETF 尚未完整穿透",
      detail: `證券曝險覆蓋 ${risk.riskCoveragePct.toFixed(1)}%，未解析 ETF 占總資產 ${risk.unresolvedEtfPct.toFixed(1)}%；未知部分不會被猜進公司或產業曝險。`,
      valuePct: risk.riskCoveragePct
    });
  }

  return notices;
}
