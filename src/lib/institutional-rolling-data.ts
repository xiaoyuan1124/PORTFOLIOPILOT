import {z} from "zod";
import {fetchMarketDataset} from "./market-data-url";

const flowRowSchema=z.object({
 market:z.enum(["TWSE","TPEx"]),code:z.string().min(1),
 foreign5d:z.number().finite().nullable(),trust5d:z.number().finite().nullable(),
 foreign10d:z.number().finite().nullable(),trust10d:z.number().finite().nullable(),
 foreign20d:z.number().finite().nullable(),trust20d:z.number().finite().nullable(),
 foreign60d:z.number().finite().nullable(),trust60d:z.number().finite().nullable(),
 observed5d:z.number().int().nonnegative(),observed10d:z.number().int().nonnegative(),
 observed20d:z.number().int().nonnegative(),observed60d:z.number().int().nonnegative()
});
const windowSchema=z.object({
 status:z.enum(["verified","insufficient"]),
 startDate:z.string().nullable(),endDate:z.string().nullable(),
 observedSessions:z.number().int().nonnegative(),reason:z.string()
});
const schema=z.object({
 version:z.literal(1),generatedAt:z.string(),asOf:z.string(),
 sourceNames:z.array(z.string()),benchmarkDate:z.string().nullable(),
 windows:z.object({
  "5":windowSchema,"10":windowSchema,"20":windowSchema,"60":windowSchema
 }),rows:z.array(flowRowSchema)
});
export type InstitutionalRollingCache=z.infer<typeof schema>;
export type InstitutionalRollingRow=z.infer<typeof flowRowSchema>;
export type InstitutionalPeriod=5|10|20|60;
export async function loadInstitutionalRolling():Promise<InstitutionalRollingCache> {
 const response=await fetchMarketDataset("tw-institutional-rolling.json");
 if(!response.ok)throw new Error("官方法人歷史快取尚未發布。");
 return schema.parse(await response.json());
}
export function institutionalRollingFor(
 cache:InstitutionalRollingCache,market:"TWSE"|"TPEx",symbol:string
):InstitutionalRollingRow|null {
 return cache.rows.find(row=>row.market===market&&row.code.toUpperCase()===symbol.trim().toUpperCase())??null;
}
