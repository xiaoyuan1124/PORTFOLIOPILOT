import { z } from "zod";

const historyRowSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  market: z.enum(["TWSE", "TPEx"]),
  industry: z.string(),
  period: z.string().min(1),
  revenue: z.number().finite(),
  previousMonthRevenue: z.number().finite().nullable(),
  lastYearRevenue: z.number().finite().nullable(),
  momPct: z.number().finite().nullable(),
  yoyPct: z.number().finite().nullable(),
  cumulativeRevenue: z.number().finite().nullable(),
  lastYearCumulativeRevenue: z.number().finite().nullable(),
  cumulativeYoyPct: z.number().finite().nullable(),
  note: z.string()
});

const historyCacheSchema = z.object({
  generatedAt: z.string(),
  periods: z.array(z.string()),
  sources: z.array(z.object({
    period: z.string(),
    market: z.enum(["TWSE", "TPEx"]),
    companyType: z.number().int(),
    url: z.string()
  })),
  rows: z.array(historyRowSchema)
});

export type RevenueHistoryRow = z.infer<typeof historyRowSchema>;
export type RevenueHistoryCache = z.infer<typeof historyCacheSchema>;

export type RevenueGateResult = {
  code: string;
  name: string;
  market: "TWSE" | "TPEx";
  industry: string;
  periods: Array<{ period: string; yoyPct: number | null; revenue: number }>;
  pass: boolean;
  minYoy: number | null;
};

export async function loadBundledRevenueHistory(): Promise<RevenueHistoryCache> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const response = await fetch(`${base}/data/tw-revenue-history.json?ts=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("尚未取得官方三個月營收歷史快取。");
  }

  return historyCacheSchema.parse(await response.json());
}

export function evaluateThreeMonthRevenueGate(cache: RevenueHistoryCache): RevenueGateResult[] {
  const expectedPeriods = [...cache.periods].sort().reverse().slice(0, 3);
  if (expectedPeriods.length < 3) return [];

  const byCode = new Map<string, RevenueHistoryRow[]>();
  for (const row of cache.rows) {
    const list = byCode.get(row.code) ?? [];
    list.push(row);
    byCode.set(row.code, list);
  }

  const results: RevenueGateResult[] = [];

  for (const rows of byCode.values()) {
    const byPeriod = new Map(rows.map((row) => [row.period, row]));
    const selected = expectedPeriods.map((period) => byPeriod.get(period)).filter(Boolean) as RevenueHistoryRow[];
    if (selected.length !== 3) continue;

    const yoyValues = selected.map((row) => row.yoyPct);
    const pass = yoyValues.every((value) => value !== null && value > 20);
    const numeric = yoyValues.filter((value): value is number => value !== null);

    results.push({
      code: selected[0]!.code,
      name: selected[0]!.name,
      market: selected[0]!.market,
      industry: selected[0]!.industry,
      periods: selected.map((row) => ({
        period: row.period,
        yoyPct: row.yoyPct,
        revenue: row.revenue
      })),
      pass,
      minYoy: numeric.length === 3 ? Math.min(...numeric) : null
    });
  }

  return results.sort((a, b) => {
    if (a.pass !== b.pass) return a.pass ? -1 : 1;
    return (b.minYoy ?? -Infinity) - (a.minYoy ?? -Infinity);
  });
}
