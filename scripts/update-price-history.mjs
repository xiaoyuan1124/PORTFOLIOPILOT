import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseTwseMiIndexPayload } from "./lib/quote-data.mjs";
import {
  DEFAULT_HISTORY_CALENDAR_DAYS,
  assertHistoricalPayloadDate,
  bucketFileName,
  bucketPrefix,
  calendarDateAdd,
  historyBucketStats,
  mergeHistoryBucket,
  parseTpexDailyQuotesPayload,
  weekdayDates
} from "./lib/price-history.mjs";

const OUTPUT_DIR = "public/data/tw-price-history";
const INDEX_PATH = join(OUTPUT_DIR, "index.json");
const HISTORY_DAYS = Number(process.env.PRICE_HISTORY_CALENDAR_DAYS || DEFAULT_HISTORY_CALENDAR_DAYS);
const TWSE_MIN_ROWS = 500;
const TPEX_MIN_ROWS = 300;
const REQUEST_TIMEOUT_MS = Number(process.env.PRICE_HISTORY_REQUEST_TIMEOUT_MS || 12_000);
const REQUEST_ATTEMPTS = Number(process.env.PRICE_HISTORY_REQUEST_ATTEMPTS || 2);
const DATE_CONCURRENCY = Number(process.env.PRICE_HISTORY_DATE_CONCURRENCY || 2);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(label, task, attempts = REQUEST_ATTEMPTS) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (error?.nonRetryable === true || attempt === attempts) break;
      const delayMs = 750 * attempt;
      console.warn(`${label} attempt ${attempt}/${attempts} failed; retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed after retries`);
}

async function fetchObject(url, label) {
  return withRetry(label, async () => {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 PortfolioPilot/0.81 (+https://github.com/xiaoyuan1124/PORTFOLIOPILOT)",
        accept: "application/json,text/javascript,*/*"
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) {
      const error = new Error(`${label} request failed: ${response.status}`);
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        error.nonRetryable = true;
      }
      throw error;
    }
    const payload = await response.json();
    if (!payload || typeof payload !== "object") throw new Error(`${label} returned invalid JSON`);
    return payload;
  });
}

function twseUrl(date) {
  return `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${date.replaceAll("-", "")}&type=ALLBUT0999&response=json`;
}

function tpexUrl(date) {
  return `https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date=${encodeURIComponent(date.replaceAll("-", "/"))}&type=AL&response=json`;
}

async function fetchMarketDay(date, market) {
  if (market === "TWSE") {
    const payload = await fetchObject(twseUrl(date), `TWSE MI_INDEX ${date}`);
    assertHistoricalPayloadDate(payload, date, "TWSE");
    return parseTwseMiIndexPayload(payload, date).map((row) => ({
      code: row.code,
      name: row.name,
      market: "TWSE",
      date,
      close: row.close
    }));
  }
  const payload = await fetchObject(tpexUrl(date), `TPEx dailyQuotes ${date}`);
  assertHistoricalPayloadDate(payload, date, "TPEx");
  return parseTpexDailyQuotesPayload(payload, date);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function allowedUniverse(quotes) {
  return {
    TWSE: new Set(quotes.filter((row) => row.market === "TWSE").map((row) => String(row.code).toUpperCase())),
    TPEx: new Set(quotes.filter((row) => row.market === "TPEx").map((row) => String(row.code).toUpperCase()))
  };
}

function filterUniverse(rows, allowed) {
  return rows.filter((row) => allowed[row.market]?.has(String(row.code).toUpperCase()));
}

function failureKey(market, date) {
  return `${market}:${date}`;
}

async function main() {
  if (!Number.isInteger(HISTORY_DAYS) || HISTORY_DAYS < 365 || HISTORY_DAYS > 800) {
    throw new Error(`PRICE_HISTORY_CALENDAR_DAYS must be an integer between 365 and 800; got ${HISTORY_DAYS}`);
  }

  const quoteCache = await readJson("public/data/tw-quotes.json", null);
  const quotes = Array.isArray(quoteCache?.quotes) ? quoteCache.quotes : [];
  if (quotes.length < 500) throw new Error("Cannot seed price history without a valid tw-quotes.json cache.");

  const targetEndDate = quotes.map((row) => String(row.date ?? "")).filter(Boolean).sort().at(-1);
  if (!targetEndDate) throw new Error("Cannot determine latest Taiwan quote date.");
  const cutoffDate = calendarDateAdd(targetEndDate, -HISTORY_DAYS);

  await mkdir(OUTPUT_DIR, { recursive: true });
  const previousIndex = await readJson(INDEX_PATH, null);
  const existingFiles = (await readdir(OUTPUT_DIR)).filter((name) => /^(twse|tpex)-[A-Z0-9_]{2}\.json$/i.test(name));
  const hasExistingHistory = existingFiles.length > 0;

  const latestExistingDate = typeof previousIndex?.endDate === "string" ? previousIndex.endDate : null;
  const incrementalStart = latestExistingDate
    ? calendarDateAdd(latestExistingDate, 1)
    : cutoffDate;
  const normalDates = incrementalStart <= targetEndDate
    ? weekdayDates(incrementalStart, targetEndDate)
    : [];
  const retryDates = Array.isArray(previousIndex?.failed)
    ? previousIndex.failed.map((item) => String(item?.date ?? "")).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= cutoffDate && date <= targetEndDate)
    : [];
  const dates = [...new Set([...normalDates, ...retryDates])].sort();

  const allowed = allowedUniverse(quotes);
  const incoming = [];
  const acceptedDates = { TWSE: new Set(), TPEx: new Set() };
  const failed = new Map(
    Array.isArray(previousIndex?.failed)
      ? previousIndex.failed
          .filter((item) => item?.market && item?.date)
          .map((item) => [failureKey(item.market, item.date), item])
      : []
  );

  console.log(`Taiwan price history: ${hasExistingHistory ? "incremental" : "initial"} run, ${dates.length} weekday dates, ${cutoffDate} → ${targetEndDate}`);

  if (!Number.isInteger(REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS < 5_000 || REQUEST_TIMEOUT_MS > 30_000) {
    throw new Error(`PRICE_HISTORY_REQUEST_TIMEOUT_MS must be 5000-30000; got ${REQUEST_TIMEOUT_MS}`);
  }
  if (!Number.isInteger(REQUEST_ATTEMPTS) || REQUEST_ATTEMPTS < 1 || REQUEST_ATTEMPTS > 4) {
    throw new Error(`PRICE_HISTORY_REQUEST_ATTEMPTS must be 1-4; got ${REQUEST_ATTEMPTS}`);
  }
  if (!Number.isInteger(DATE_CONCURRENCY) || DATE_CONCURRENCY < 1 || DATE_CONCURRENCY > 4) {
    throw new Error(`PRICE_HISTORY_DATE_CONCURRENCY must be 1-4; got ${DATE_CONCURRENCY}`);
  }

  async function fetchDate(date) {
    const [twseResult, tpexResult] = await Promise.allSettled([
      fetchMarketDay(date, "TWSE"),
      fetchMarketDay(date, "TPEx")
    ]);
    return { date, twseResult, tpexResult };
  }

  for (let offset = 0; offset < dates.length; offset += DATE_CONCURRENCY) {
    const batch = dates.slice(offset, offset + DATE_CONCURRENCY);
    const batchResults = await Promise.all(batch.map(fetchDate));

    for (const { date, twseResult, tpexResult } of batchResults) {
      const twseRows = twseResult.status === "fulfilled" ? twseResult.value : null;
      const tpexRows = tpexResult.status === "fulfilled" ? tpexResult.value : null;

      const twseCount = twseRows?.length ?? -1;
      const tpexCount = tpexRows?.length ?? -1;
      const bothClosed = twseResult.status === "fulfilled" && tpexResult.status === "fulfilled" && twseCount === 0 && tpexCount === 0;

      if (bothClosed) {
        failed.delete(failureKey("TWSE", date));
        failed.delete(failureKey("TPEx", date));
        continue;
      }

      if (twseResult.status === "fulfilled" && twseCount >= TWSE_MIN_ROWS) {
        incoming.push(...filterUniverse(twseRows, allowed));
        acceptedDates.TWSE.add(date);
        failed.delete(failureKey("TWSE", date));
      } else {
        failed.set(failureKey("TWSE", date), {
          market: "TWSE",
          date,
          message: twseResult.status === "rejected"
            ? String(twseResult.reason?.message ?? twseResult.reason)
            : `incomplete row count: ${twseCount}`
        });
      }

      if (tpexResult.status === "fulfilled" && tpexCount >= TPEX_MIN_ROWS) {
        incoming.push(...filterUniverse(tpexRows, allowed));
        acceptedDates.TPEx.add(date);
        failed.delete(failureKey("TPEx", date));
      } else {
        failed.set(failureKey("TPEx", date), {
          market: "TPEx",
          date,
          message: tpexResult.status === "rejected"
            ? String(tpexResult.reason?.message ?? tpexResult.reason)
            : `incomplete row count: ${tpexCount}`
        });
      }
    }

    if ((offset / DATE_CONCURRENCY) % 10 === 0 || offset + DATE_CONCURRENCY >= dates.length) {
      const lastDate = batch.at(-1) ?? "";
      console.log(`progress ${Math.min(offset + batch.length, dates.length)}/${dates.length} through ${lastDate}: TWSE ${acceptedDates.TWSE.size}, TPEx ${acceptedDates.TPEx.size}, unresolved ${failed.size}`);
    }
    await sleep(400);
  }

  // Always merge the already validated latest official quote cache so the
  // newest day remains available even if one historical endpoint is flaky.
  incoming.push(...quotes.flatMap((row) => {
    const close = Number(row.close);
    const market = row.market === "TWSE" || row.market === "TPEx" ? row.market : null;
    if (!market || !Number.isFinite(close) || close <= 0) return [];
    return [{
      code: String(row.code).toUpperCase(),
      name: String(row.name ?? row.code),
      market,
      date: String(row.date),
      close
    }];
  }));

  if (!hasExistingHistory) {
    if (acceptedDates.TWSE.size < 220) {
      throw new Error(`Refusing initial history seed with only ${acceptedDates.TWSE.size} valid TWSE trading dates.`);
    }
    if (acceptedDates.TPEx.size < 220) {
      throw new Error(`Refusing initial history seed with only ${acceptedDates.TPEx.size} valid TPEx trading dates.`);
    }
  }

  const grouped = new Map();
  for (const row of incoming) {
    const prefix = bucketPrefix(row.code);
    const file = bucketFileName(row.market, prefix);
    const list = grouped.get(file) ?? [];
    list.push(row);
    grouped.set(file, list);
  }

  const generatedAt = new Date().toISOString();
  const allFiles = new Set([...existingFiles, ...grouped.keys()]);
  const stats = {
    TWSE: { symbols: 0, points: 0, buckets: 0 },
    TPEx: { symbols: 0, points: 0, buckets: 0 }
  };
  let globalStart = null;
  let globalEnd = null;

  for (const file of [...allFiles].sort()) {
    const match = file.match(/^(twse|tpex)-([A-Z0-9_]{2})\.json$/i);
    if (!match) continue;
    const market = match[1].toUpperCase() === "TWSE" ? "TWSE" : "TPEx";
    const prefix = match[2].toUpperCase();
    const path = join(OUTPUT_DIR, file);
    const existing = await readJson(path, null);
    const bucket = mergeHistoryBucket(existing, market, prefix, grouped.get(file) ?? [], cutoffDate, generatedAt);
    const bucketStats = historyBucketStats(bucket);
    if (!bucketStats.points) continue;

    await writeFile(path, JSON.stringify(bucket), "utf8");
    stats[market].symbols += bucketStats.symbols;
    stats[market].points += bucketStats.points;
    stats[market].buckets += 1;
    if (bucket.startDate && (!globalStart || bucket.startDate < globalStart)) globalStart = bucket.startDate;
    if (bucket.endDate && (!globalEnd || bucket.endDate > globalEnd)) globalEnd = bucket.endDate;
  }

  const unresolved = [...failed.values()]
    .filter((item) => item.date >= cutoffDate && item.date <= targetEndDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.market.localeCompare(b.market))
    .slice(-100);

  const index = {
    version: 1,
    generatedAt,
    calendarDays: HISTORY_DAYS,
    startDate: globalStart,
    endDate: globalEnd,
    targetEndDate,
    sources: [
      {
        market: "TWSE",
        name: "TWSE MI_INDEX",
        urlTemplate: "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=YYYYMMDD&type=ALLBUT0999&response=json"
      },
      {
        market: "TPEx",
        name: "TPEx dailyQuotes",
        urlTemplate: "https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date=YYYY/MM/DD&type=AL&response=json"
      }
    ],
    markets: stats,
    failed: unresolved
  };

  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2) + "\n", "utf8");
  console.log(`Wrote ${stats.TWSE.buckets + stats.TPEx.buckets} price-history buckets; TWSE ${stats.TWSE.points} points, TPEx ${stats.TPEx.points} points; unresolved ${unresolved.length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
