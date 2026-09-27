import { mkdir, writeFile } from "node:fs/promises";
import {
  parseTwseTaiexTotalReturn,
  retryTransientTwseRequest,
  rollingMonthStarts,
  twseMonthUrl
} from "./lib/benchmark-data.mjs";

const REQUEST_DELAY_MS = 140;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMonth(monthStart, allowEmpty = false) {
  const url = twseMonthUrl(monthStart);
  const payload = await retryTransientTwseRequest(
    async () => {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 PortfolioPilot/0.13 (+https://github.com/xiaoyuan1124/PORTFOLIOPILOT)",
          accept: "application/json,text/plain,*/*"
        },
        signal: AbortSignal.timeout(30_000)
      });

      if (!response.ok) {
        const error = new Error(`TWSE MFI94U request failed: ${response.status} (${url})`);
        error.status = response.status;
        throw error;
      }

      return response.json();
    },
    {
      attempts: 4,
      baseDelayMs: 1000,
      onRetry: ({ nextAttempt, delayMs, error }) => {
        console.warn(
          `Transient TWSE benchmark failure; retrying attempt ${nextAttempt}/4 in ${delayMs}ms: ${error?.message ?? error}`
        );
      }
    }
  );

  const rows = parseTwseTaiexTotalReturn(payload);
  if (!rows.length && !allowEmpty) throw new Error(`TWSE MFI94U returned no valid rows for ${monthStart}`);
  return { url, rows };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const months = rollingMonthStarts(new Date(), 24);
  const points = new Map();
  const monthlySources = [];

  for (const monthStart of months) {
    const result = await fetchMonth(monthStart, monthStart === months.at(-1));
    for (const row of result.rows) points.set(row.date, row);
    monthlySources.push({ month: monthStart.slice(0, 7), url: result.url });
    await sleep(REQUEST_DELAY_MS);
  }

  const sorted = [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 300) {
    throw new Error(`Refusing suspiciously small TAIEX Total Return benchmark set: ${sorted.length} rows`);
  }

  const payload = {
    generatedAt,
    benchmarks: [{
      id: "TWSE:TAIEX-TR",
      symbol: "TAIEX-TR",
      name: "發行量加權股價報酬指數",
      market: "TW",
      currency: "TWD",
      returnType: "total_return",
      provider: "TWSE",
      sourceName: "TWSE MFI94U",
      sourceUrl: "https://www.twse.com.tw/zh/indices/taiex/mfi94u.html",
      sourceUrlTemplate: "https://www.twse.com.tw/indicesReport/MFI94U?response=json&date=YYYYMM01",
      fetchedAt: generatedAt,
      asOf: sorted.at(-1)?.date ?? "",
      points: sorted
    }],
    requests: monthlySources
  };

  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/tw-benchmarks.json", `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${sorted.length} official TAIEX Total Return points from ${sorted[0]?.date} through ${sorted.at(-1)?.date}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
