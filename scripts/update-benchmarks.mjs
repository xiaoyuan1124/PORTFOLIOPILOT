import { mkdir, writeFile } from "node:fs/promises";
import {
  parseTwseTaiexPrice,
  parseTwseTaiexTotalReturn,
  retryTransientTwseRequest,
  rollingMonthStarts,
  twseMonthUrl,
  twsePriceMonthUrl
} from "./lib/benchmark-data.mjs";

const REQUEST_DELAY_MS = 140;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, label) {
  return retryTransientTwseRequest(
    async () => {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 PortfolioPilot/0.82 (+https://github.com/xiaoyuan1124/PORTFOLIOPILOT)",
          accept: "application/json,text/plain,*/*"
        },
        signal: AbortSignal.timeout(30_000)
      });

      if (!response.ok) {
        const error = new Error(`${label} request failed: ${response.status} (${url})`);
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
}

async function fetchTotalReturnMonth(monthStart, allowEmpty = false) {
  const url = twseMonthUrl(monthStart);
  const payload = await fetchJsonWithRetry(url, "TWSE MFI94U");
  const rows = parseTwseTaiexTotalReturn(payload);
  if (!rows.length && !allowEmpty) throw new Error(`TWSE MFI94U returned no valid rows for ${monthStart}`);
  return { url, rows };
}

async function fetchPriceMonth(monthStart, allowEmpty = false) {
  const url = twsePriceMonthUrl(monthStart);
  const payload = await fetchJsonWithRetry(url, "TWSE FMTQIK");
  const rows = parseTwseTaiexPrice(payload);
  if (!rows.length && !allowEmpty) throw new Error(`TWSE FMTQIK returned no valid rows for ${monthStart}`);
  return { url, rows };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const months = rollingMonthStarts(new Date(), 24);
  const totalReturnPoints = new Map();
  const pricePoints = new Map();
  const monthlySources = [];

  for (const monthStart of months) {
    const allowEmpty = monthStart === months.at(-1);
    const [totalReturnResult, priceResult] = await Promise.all([
      fetchTotalReturnMonth(monthStart, allowEmpty),
      fetchPriceMonth(monthStart, allowEmpty)
    ]);
    for (const row of totalReturnResult.rows) totalReturnPoints.set(row.date, row);
    for (const row of priceResult.rows) pricePoints.set(row.date, row);
    monthlySources.push(
      { month: monthStart.slice(0, 7), url: totalReturnResult.url },
      { month: monthStart.slice(0, 7), url: priceResult.url }
    );
    await sleep(REQUEST_DELAY_MS);
  }

  const sortedTotalReturn = [...totalReturnPoints.values()].sort((a, b) => a.date.localeCompare(b.date));
  const sortedPrice = [...pricePoints.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (sortedTotalReturn.length < 300) {
    throw new Error(`Refusing suspiciously small TAIEX Total Return benchmark set: ${sortedTotalReturn.length} rows`);
  }
  if (sortedPrice.length < 300) {
    throw new Error(`Refusing suspiciously small TAIEX Price benchmark set: ${sortedPrice.length} rows`);
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
      asOf: sortedTotalReturn.at(-1)?.date ?? "",
      points: sortedTotalReturn
    }, {
      id: "TWSE:TAIEX-PRICE",
      symbol: "TAIEX",
      name: "發行量加權股價指數",
      market: "TW",
      currency: "TWD",
      returnType: "price_return",
      provider: "TWSE",
      sourceName: "TWSE FMTQIK",
      sourceUrl: "https://www.twse.com.tw/exchangeReport/FMTQIK?response=html",
      sourceUrlTemplate: "https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=YYYYMM01&response=json",
      fetchedAt: generatedAt,
      asOf: sortedPrice.at(-1)?.date ?? "",
      points: sortedPrice
    }],
    requests: monthlySources
  };

  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/tw-benchmarks.json", `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote TAIEX benchmarks: total-return ${sortedTotalReturn.length} points and price-index ${sortedPrice.length} points through ${sortedPrice.at(-1)?.date}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
