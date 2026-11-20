import { readFile } from "node:fs/promises";
import { summarizeTaiwanMarketHealth } from "./lib/market-health.mjs";
async function read(path) {try{return JSON.parse(await readFile("public/data/"+path,"utf8"));}catch(error){console.error("Missing or invalid "+path+": "+String(error));return null;}}
const quotes=await read("tw-quotes.json");
const benchmark=await read("tw-benchmarks.json");
const history=await read("tw-price-history/index.json");
const report=summarizeTaiwanMarketHealth({quotes,benchmark,history});
const lines=["## PortfolioPilot 公開資料完整度檢查","","| 資料 | 已驗證日期 | 狀態 |","|---|---|---|",...report.rows.map(row=>`| ${row.kind} | ${row.asOf??"—"} | ${row.status} |`),"",...report.warnings.map(v=>"- ⚠️ "+v),...report.errors.map(v=>"- ❌ "+v),"",report.us,"","一般平日也可能是官方休市；本檢查不把未查證的假期標記為交易日。"];
const summary=lines.join("\n");
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY){await import("node:fs/promises").then(({appendFile})=>appendFile(process.env.GITHUB_STEP_SUMMARY,summary+"\n","utf8"));}
if(report.errors.length)process.exitCode=1;
