import { z } from "zod";

const benchmarkPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().finite().positive()
});

const benchmarkSeriesSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1),
  name: z.string().min(1),
  market: z.literal("TW"),
  currency: z.literal("TWD"),
  returnType: z.literal("total_return"),
  provider: z.literal("TWSE"),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceUrlTemplate: z.string().min(1),
  fetchedAt: z.string().min(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  points: z.array(benchmarkPointSchema)
});

const benchmarkCacheSchema = z.object({
  generatedAt: z.string().min(1),
  benchmarks: z.array(benchmarkSeriesSchema),
  requests: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    url: z.string().url()
  }))
});

export type BenchmarkPoint = z.infer<typeof benchmarkPointSchema>;
export type BenchmarkSeries = z.infer<typeof benchmarkSeriesSchema>;
export type BenchmarkCache = z.infer<typeof benchmarkCacheSchema>;

export type BenchmarkWindow = {
  status: "available" | "insufficient";
  targetStart: string;
  targetEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  startValue: number | null;
  endValue: number | null;
  returnPct: number | null;
  calendarDatesExact: boolean;
  reason: string;
};

export async function loadBundledBenchmarks(): Promise<BenchmarkCache> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const response = await fetch(`${base}/data/tw-benchmarks.json?ts=${Date.now()}`, {
    cache: "no-store"
  });
  if (!response.ok) throw new Error("尚未取得官方 Benchmark 快取。");
  return benchmarkCacheSchema.parse(await response.json());
}

export function benchmarkById(cache: BenchmarkCache, id: string) {
  return cache.benchmarks.find((benchmark) => benchmark.id === id) ?? null;
}

export function benchmarkWindow(
  series: BenchmarkSeries,
  targetStart: string,
  targetEnd: string
): BenchmarkWindow {
  if (targetStart >= targetEnd) {
    return {
      status: "insufficient",
      targetStart,
      targetEnd,
      actualStart: null,
      actualEnd: null,
      startValue: null,
      endValue: null,
      returnPct: null,
      calendarDatesExact: false,
      reason: "Benchmark 起訖日期無法形成有效區間。"
    };
  }

  const points = [...series.points]
    .filter((point) => point.date >= targetStart && point.date <= targetEnd)
    .sort((a, b) => a.date.localeCompare(b.date));

  const start = points[0] ?? null;
  const end = points.at(-1) ?? null;
  if (!start || !end || start.date >= end.date) {
    return {
      status: "insufficient",
      targetStart,
      targetEnd,
      actualStart: start?.date ?? null,
      actualEnd: end?.date ?? null,
      startValue: start?.value ?? null,
      endValue: end?.value ?? null,
      returnPct: null,
      calendarDatesExact: false,
      reason: "目標期間內沒有至少兩個官方 Benchmark 交易日。"
    };
  }

  const value = (end.value / start.value - 1) * 100;
  return {
    status: "available",
    targetStart,
    targetEnd,
    actualStart: start.date,
    actualEnd: end.date,
    startValue: start.value,
    endValue: end.value,
    returnPct: value,
    calendarDatesExact: start.date === targetStart && end.date === targetEnd,
    reason: start.date === targetStart && end.date === targetEnd
      ? "Benchmark 的交易日期與目標起訖日相同；仍未假設盤中時間與投資組合估值時間相同。"
      : "Benchmark 使用目標期間內第一個與最後一個可用官方交易日；實際區間已明確顯示。"
  };
}
