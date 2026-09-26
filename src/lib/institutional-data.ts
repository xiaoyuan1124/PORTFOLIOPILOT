import { z } from "zod";

const institutionalRowSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  market: z.enum(["TWSE", "TPEx"]),
  foreign10d: z.number().finite(),
  trust10d: z.number().finite(),
  observedDays: z.number().int().nonnegative()
});

const institutionalCacheSchema = z.object({
  generatedAt: z.string(),
  tradingDates: z.array(z.string()),
  sources: z.array(z.object({
    name: z.string(),
    urlTemplate: z.string()
  })),
  rows: z.array(institutionalRowSchema)
});

export type InstitutionalRow = z.infer<typeof institutionalRowSchema>;
export type InstitutionalCache = z.infer<typeof institutionalCacheSchema>;

export async function loadBundledInstitutional10d(): Promise<InstitutionalCache> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const response = await fetch(`${base}/data/tw-institutional-10d.json?ts=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("尚未取得官方 10 日法人快取。");
  }

  return institutionalCacheSchema.parse(await response.json());
}

export function institutionalByCode(cache: InstitutionalCache) {
  return new Map(cache.rows.map((row) => [row.code.toUpperCase(), row]));
}
