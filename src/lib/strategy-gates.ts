import type { InstitutionalCache, InstitutionalRow } from "./institutional-data";
import {
  evaluateQuarterlyGrossMarginGate,
  type GateStatus,
  type QuarterlyMarginCache,
  type QuarterlyMarginRow
} from "./quarterly-financials";
import type { RevenueHistoryCache, RevenueHistoryRow } from "./revenue-history";

export type SourceRef = {
  name: string;
  url: string;
};

export type RevenueGateDetail = {
  status: GateStatus;
  reason: string;
  dataAsOf: string;
  values: Array<{ period: string; yoyPct: number | null; revenue: number }>;
  sources: SourceRef[];
};

export type InstitutionalGateDetail = {
  status: GateStatus;
  reason: string;
  dataAsOf: string;
  net10d: number | null;
  observedDays: number | null;
  sources: SourceRef[];
};

export type GrossMarginGateDetail = {
  status: GateStatus;
  reason: string;
  dataAsOf: string;
  values: QuarterlyMarginRow[];
  sources: SourceRef[];
};

export type OfficialStrategyResult = {
  code: string;
  name: string;
  market: "TWSE" | "TPEx";
  industry: string;
  overallStatus: GateStatus;
  passedGateCount: number;
  revenueGate: RevenueGateDetail;
  grossMarginGate: GrossMarginGateDetail;
  foreignGate: InstitutionalGateDetail;
  trustGate: InstitutionalGateDetail;
};

export type StrategyGateConfig = {
  revenueYoyMinPct: number;
  foreignNet10dMin: number;
  trustNet10dMin: number;
};

export const defaultStrategyGateConfig: StrategyGateConfig = {
  revenueYoyMinPct: 20,
  foreignNet10dMin: 0,
  trustNet10dMin: 0
};

function key(market: "TWSE" | "TPEx", code: string) {
  return `${market}:${code.toUpperCase()}`;
}

function uniqueSources(sources: SourceRef[]) {
  return [...new Map(sources.map((source) => [`${source.name}:${source.url}`, source])).values()];
}

function revenueSources(cache: RevenueHistoryCache, market: "TWSE" | "TPEx", periods: string[]) {
  return uniqueSources(
    cache.sources
      .filter((source) => source.market === market && periods.includes(source.period))
      .map((source) => ({
        name: `MOPS 月營收歷史${source.companyType === 1 ? "（外國企業）" : ""}`,
        url: source.url
      }))
  );
}

function evaluateRevenueGate(
  cache: RevenueHistoryCache,
  rows: RevenueHistoryRow[],
  market: "TWSE" | "TPEx",
  minYoyPct: number
): RevenueGateDetail {
  const periods = [...cache.periods].sort().slice(-3);
  const byPeriod = new Map(rows.map((row) => [row.period, row]));
  const selected = periods.map((period) => byPeriod.get(period)).filter((row): row is RevenueHistoryRow => Boolean(row));
  const values = selected.map((row) => ({ period: row.period, yoyPct: row.yoyPct, revenue: row.revenue }));
  const sources = revenueSources(cache, market, periods);

  if (periods.length !== 3 || selected.length !== 3 || selected.some((row) => row.yoyPct === null)) {
    return {
      status: "insufficient",
      reason: "最近三個官方月營收 YoY 資料不完整。",
      dataAsOf: periods.join(" / ") || "—",
      values,
      sources
    };
  }

  const pass = selected.every((row) => (row.yoyPct ?? -Infinity) > minYoyPct);
  return {
    status: pass ? "pass" : "fail",
    reason: pass
      ? `最近 3 個月營收 YoY 均大於 ${minYoyPct.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%。`
      : `至少一個月營收 YoY 未大於 ${minYoyPct.toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%。`,
    dataAsOf: periods.join(" / "),
    values,
    sources
  };
}

function exactInstitutionalSourceUrl(urlTemplate: string, latestDate: string | undefined) {
  if (!latestDate) return urlTemplate;
  if (urlTemplate.includes("YYYYMMDD")) {
    return urlTemplate.replace("YYYYMMDD", latestDate.replaceAll("-", ""));
  }
  if (urlTemplate.includes("ROC/MM/DD")) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(latestDate);
    if (!match) return urlTemplate;
    const roc = `${Number(match[1]) - 1911}/${match[2]}/${match[3]}`;
    return urlTemplate.replace("ROC/MM/DD", encodeURIComponent(roc));
  }
  return urlTemplate;
}

function institutionalSources(cache: InstitutionalCache) {
  const latestDate = [...cache.tradingDates].sort().at(-1);
  return cache.sources.map((source) => ({
    name: source.name,
    url: exactInstitutionalSourceUrl(source.urlTemplate, latestDate)
  }));
}

function institutionalAsOf(cache: InstitutionalCache) {
  if (!cache.tradingDates.length) return "—";
  const sorted = [...cache.tradingDates].sort();
  return `${sorted[0]} ～ ${sorted.at(-1)}`;
}

function evaluateInstitutionalGate(
  cache: InstitutionalCache,
  row: InstitutionalRow | null,
  field: "foreign10d" | "trust10d",
  label: string,
  minNet10d: number
): InstitutionalGateDetail {
  const net10d = row?.[field] ?? null;
  if (cache.tradingDates.length !== 10 || row === null) {
    return {
      status: "insufficient",
      reason: `官方 ${label} 10 個交易日資料不完整。`,
      dataAsOf: institutionalAsOf(cache),
      net10d,
      observedDays: row?.observedDays ?? null,
      sources: institutionalSources(cache)
    };
  }

  const pass = net10d !== null && net10d > minNet10d;
  return {
    status: pass ? "pass" : "fail",
    reason: pass
      ? `${label}近 10 個交易日淨買超大於 ${minNet10d.toLocaleString("zh-TW")} 股。`
      : `${label}近 10 個交易日淨買超未大於 ${minNet10d.toLocaleString("zh-TW")} 股。`,
    dataAsOf: institutionalAsOf(cache),
    net10d,
    observedDays: row.observedDays,
    sources: institutionalSources(cache)
  };
}

function statusRank(status: GateStatus) {
  if (status === "pass") return 0;
  if (status === "fail") return 1;
  if (status === "insufficient") return 2;
  return 3;
}

export function evaluateOfficialStrategy(
  revenueCache: RevenueHistoryCache,
  institutionalCache: InstitutionalCache,
  quarterlyCache: QuarterlyMarginCache,
  config: StrategyGateConfig = defaultStrategyGateConfig
): OfficialStrategyResult[] {
  const thresholds: StrategyGateConfig = {
    revenueYoyMinPct: Number.isFinite(config.revenueYoyMinPct) ? config.revenueYoyMinPct : defaultStrategyGateConfig.revenueYoyMinPct,
    foreignNet10dMin: Number.isFinite(config.foreignNet10dMin) ? config.foreignNet10dMin : defaultStrategyGateConfig.foreignNet10dMin,
    trustNet10dMin: Number.isFinite(config.trustNet10dMin) ? config.trustNet10dMin : defaultStrategyGateConfig.trustNet10dMin
  };
  const metadata = new Map<string, { code: string; name: string; market: "TWSE" | "TPEx"; industry: string }>();
  const revenueByKey = new Map<string, RevenueHistoryRow[]>();

  for (const row of revenueCache.rows) {
    const rowKey = key(row.market, row.code);
    const list = revenueByKey.get(rowKey) ?? [];
    list.push(row);
    revenueByKey.set(rowKey, list);
    const current = metadata.get(rowKey);
    if (!current) {
      metadata.set(rowKey, { code: row.code, name: row.name, market: row.market, industry: row.industry });
    } else if (!current.industry && row.industry) {
      metadata.set(rowKey, { ...current, industry: row.industry });
    }
  }

  const institutionalByKey = new Map<string, InstitutionalRow>();
  for (const row of institutionalCache.rows) {
    const rowKey = key(row.market, row.code);
    institutionalByKey.set(rowKey, row);
    if (!metadata.has(rowKey)) metadata.set(rowKey, { code: row.code, name: row.name, market: row.market, industry: "" });
  }

  for (const row of quarterlyCache.rows) {
    const rowKey = key(row.market, row.code);
    if (!metadata.has(rowKey)) metadata.set(rowKey, { code: row.code, name: row.name, market: row.market, industry: "" });
  }
  for (const row of quarterlyCache.notApplicable) {
    const rowKey = key(row.market, row.code);
    if (!metadata.has(rowKey)) metadata.set(rowKey, { code: row.code, name: row.name, market: row.market, industry: "" });
  }

  const results = [...metadata.entries()].map(([rowKey, company]) => {
    const revenueGate = evaluateRevenueGate(revenueCache, revenueByKey.get(rowKey) ?? [], company.market, thresholds.revenueYoyMinPct);
    const institutional = institutionalByKey.get(rowKey) ?? null;
    const foreignGate = evaluateInstitutionalGate(institutionalCache, institutional, "foreign10d", "外資", thresholds.foreignNet10dMin);
    const trustGate = evaluateInstitutionalGate(institutionalCache, institutional, "trust10d", "投信", thresholds.trustNet10dMin);
    const gross = evaluateQuarterlyGrossMarginGate(quarterlyCache, company.code, company.market);
    const grossMarginGate: GrossMarginGateDetail = {
      status: gross.status,
      reason: gross.reason,
      dataAsOf: gross.periods.join(" / ") || "—",
      values: gross.rows,
      sources: uniqueSources(gross.sources.map((source) => ({ name: source.name, url: source.url })))
    };

    const gates = [revenueGate.status, grossMarginGate.status, foreignGate.status, trustGate.status];
    const passedGateCount = gates.filter((status) => status === "pass").length;
    let overallStatus: GateStatus;
    if (grossMarginGate.status === "not_applicable") overallStatus = "not_applicable";
    else if (gates.includes("fail")) overallStatus = "fail";
    else if (gates.includes("insufficient")) overallStatus = "insufficient";
    else overallStatus = "pass";

    return {
      ...company,
      overallStatus,
      passedGateCount,
      revenueGate,
      grossMarginGate,
      foreignGate,
      trustGate
    };
  });

  return results.sort((a, b) => {
    const statusDifference = statusRank(a.overallStatus) - statusRank(b.overallStatus);
    if (statusDifference !== 0) return statusDifference;
    if (a.passedGateCount !== b.passedGateCount) return b.passedGateCount - a.passedGateCount;
    return a.code.localeCompare(b.code, "en");
  });
}
