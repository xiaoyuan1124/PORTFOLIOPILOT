import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseTwseMiIndexPayload } from "./lib/quote-data.mjs";
import {
  DEFAULT_HISTORY_CALENDAR_DAYS,
  bucketFileName,
  bucketPrefix,
  calendarDateAdd,
  historyBucketStats,
  mapWithConcurrency,
  mergeHistoryBucket,
  parseTpexDailyQuotesPayload,
  toRocDate,
  weekdayDates
} from "./lib/price-history.mjs";

const OUTPUT_DIR = "public/data/tw-price-history";
const INDEX_PATH = join(OUTPUT_DIR, "index.json");
const HISTORY_DAYS = Number(process.env.PRICE_HISTORY_CALENDAR_DAYS || DEFAULT_HISTORY_CALENDAR_DAYS);
const TWSE_MIN_ROWS = 500;
const TPEX_MIN_ROWS = 300;
const FETCH_TIMEOUT_MS = 12_000;
const FETCH_ATTEMPTS = 3;
const DATE_CONCURRENCY = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(label, task, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delayMs = 1000 * attempt;
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
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`${label} request failed: ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload !== "object") throw new Error(`${label} returned invalid JSON`);
    return payload;
  }, FETCH_ATTEMPTS);
}

function twseUrl(date) {
  return `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${date.replaceAll("-", "")}&type=ALLBUT0999&response=json`;
}

function tpexUrl(date) {
  return `https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430_result.php?l=zh-tw&d=${encodeURIComponent(toRocDate(date))}&se=EW&o=json`;
}

async function fetchMarketDay(date, market) {
  if (market === "TWSE") {
    const payload = await fetchObject(twseUrl(date), `TWSE MI_INDEX ${date}`);
    return parseTwseMiIndexPayload(payload, date).map((row) => ({
      code: row.code,
      name: row.name,
      market: "TWSE",
      date,
      close: row.close
    }));
  }
  const payload = await fetchObject(tpexUrl(date), `TPEx dailyQuotes ${date}`);
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

  console.log(`Taiwan price history: ${hasExistingHistory ? "incremental" : "initial"} run, ${dates.length} weekday dates, ${cutoffDate} → ${targetEndDate}, concurrency ${DATE_CONCURRENCY}, timeout ${FETCH_TIMEOUT_MS}ms × ${FETCH_ATTEMPTS}`);

  let processedDates = 0;

  async function processDate(date) {
    const [twseResult, tpexResult] = await Promise.allSettled([
      fetchMarketDay(date, "TWSE"),
      fetchMarketDay(date, "TPEx")
    ]);

    const twseRows = twseResult.status === "fulfilled" ? twseResult.value : null;
    const tpexRows = tpexResult.status === "fulfilled" ? tpexResult.value : null;

    const twseCount = twseRows?.length ?? -1;
    const tpexCount = tpexRows?.length ?? -1;
    const bothClosed = twseResult.status === "fulfilled" && tpexResult.status === "fulfilled" && twseCount === 0 && tpexCount === 0;

    if (bothClosed) {
      failed.delete(failureKey("TWSE", date));
      failed.delete(failureKey("TPEx", date));
    } else {
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

    processedDates += 1;
    if (processedDates % 25 === 0 || processedDates === dates.length) {
      console.log(
        `progress ${processedDates}/${dates.length}: accepted TWSE ${acceptedDates.TWSE.size}, TPEx ${acceptedDates.TPEx.size}, unresolved ${failed.size}`
      );
    }

    await sleep(150);
  }

  await mapWithConcurrency(dates, DATE_CONCURRENCY, processDate);

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
        name: "TPEx historical daily close",
        urlTemplate: "https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430_result.php?l=zh-tw&d=ROC/MM/DD&se=EW&o=json"
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
