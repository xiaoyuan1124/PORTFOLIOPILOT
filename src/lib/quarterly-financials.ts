import { z } from "zod";

const quarterlyRowSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  market: z.enum(["TWSE", "TPEx"]),
  period: z.string().regex(/^\d{4}-Q[1-4]$/),
  revenue: z.number().finite(),
  operatingCost: z.number().finite(),
  grossProfit: z.number().finite(),
  grossMarginPct: z.number().finite(),
  basis: z.string().min(1)
});

const quarterlySourceSchema = z.object({
  name: z.string().min(1),
  market: z.enum(["TWSE", "TPEx"]),
  period: z.string().regex(/^\d{4}-Q[1-4]$/),
  url: z.string().min(1),
  method: z.literal("POST"),
  fetchedAt: z.string().min(1),
  generalRows: z.number().int().nonnegative(),
  notApplicableRows: z.number().int().nonnegative()
});

const notApplicableSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  market: z.enum(["TWSE", "TPEx"]),
  periods: z.array(z.string().regex(/^\d{4}-Q[1-4]$/)),
  reason: z.string().min(1)
});

const quarterlyCacheSchema = z.object({
  generatedAt: z.string().min(1),
  periods: z.array(z.string().regex(/^\d{4}-Q[1-4]$/)),
  sources: z.array(quarterlySourceSchema),
  rows: z.array(quarterlyRowSchema),
  notApplicable: z.array(notApplicableSchema)
});

export type QuarterlyMarginRow = z.infer<typeof quarterlyRowSchema>;
export type QuarterlyMarginSource = z.infer<typeof quarterlySourceSchema>;
export type QuarterlyMarginCache = z.infer<typeof quarterlyCacheSchema>;
export type GateStatus = "pass" | "fail" | "insufficient" | "not_applicable";

export type QuarterlyMarginGateResult = {
  status: GateStatus;
  periods: string[];
  rows: QuarterlyMarginRow[];
  reason: string;
  sources: QuarterlyMarginSource[];
};

export async function loadBundledQuarterlyMargins(): Promise<QuarterlyMarginCache> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const response = await fetch(`${base}/data/tw-quarterly-margins.json?ts=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("尚未取得官方季度毛利率快取。");
  }

  return quarterlyCacheSchema.parse(await response.json());
}

export function evaluateQuarterlyGrossMarginGate(
  cache: QuarterlyMarginCache,
  code: string,
  market: "TWSE" | "TPEx"
): QuarterlyMarginGateResult {
  const periods = [...cache.periods].sort().slice(-3);
  const notApplicable = cache.notApplicable.find(
    (row) => row.code.toUpperCase() === code.toUpperCase() && row.market === market
  );

  if (notApplicable) {
    return {
      status: "not_applicable",
      periods,
      rows: [],
      reason: notApplicable.reason,
      sources: cache.sources.filter(
        (source) => source.market === market && notApplicable.periods.includes(source.period)
      )
    };
  }

  const companyRows = cache.rows.filter(
    (row) => row.code.toUpperCase() === code.toUpperCase() && row.market === market
  );
  const byPeriod = new Map(companyRows.map((row) => [row.period, row]));
  const selected = periods.map((period) => byPeriod.get(period)).filter((row): row is QuarterlyMarginRow => Boolean(row));
  const sources = cache.sources.filter(
    (source) => source.market === market && periods.includes(source.period)
  );

  if (periods.length !== 3 || selected.length !== 3) {
    return {
      status: "insufficient",
      periods,
      rows: selected,
      reason: "最近三個官方季度的單季毛利率資料不完整。",
      sources
    };
  }

  const margins = selected.map((row) => row.grossMarginPct);
  const pass = margins[0] < margins[1] && margins[1] < margins[2];
  return {
    status: pass ? "pass" : "fail",
    periods,
    rows: selected,
    reason: pass
      ? "最近三季單季毛利率符合 Q-2 < Q-1 < Q。"
      : "最近三季單季毛利率未形成嚴格連續改善。",
    sources
  };
}
