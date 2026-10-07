import { readFile, writeFile } from "node:fs/promises";
import {
  combineQuoteMarkets,
  latestQuoteDate,
  parseTpexQuoteRows,
  parseTwseMiIndexPayload,
  parseTwseQuoteRows
} from "./lib/quote-data.mjs";

const OUTPUT = "public/data/tw-quotes.json";
const FETCH_ATTEMPTS = 6;
const FETCH_TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [1_500, 3_000, 6_000, 10_000, 15_000];
const TWSE_OPENAPI = {
  name: "TWSE STOCK_DAY_ALL fallback",
  url: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
};
const TPEX_SOURCE = {
  name: "TPEx",
  url: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
};

class HttpStatusError extends Error {
  constructor(label, status) {
    super(`${label} request failed: HTTP ${status}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

function taipeiToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDays(date, delta) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + delta));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function isRetryable(error) {
  if (!(error instanceof HttpStatusError)) return true;
  return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}

function errorSummary(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function fetchPayload(url, label) {
  let lastError;

  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "PortfolioPilot/0.18 (+https://github.com/xiaoyuan1124/PORTFOLIOPILOT)",
          accept: "application/json"
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });

      if (!response.ok) {
        throw new HttpStatusError(label, response.status);
      }

      const body = await response.text();
      try {
        return JSON.parse(body);
      } catch (error) {
        throw new Error(`${label} returned invalid or incomplete JSON`, { cause: error });
      }
    } catch (error) {
      lastError = error;

      if (!isRetryable(error) || attempt === FETCH_ATTEMPTS) {
        break;
      }

      const delayMs = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1) ?? 15_000;
      console.warn(
        `${label} attempt ${attempt}/${FETCH_ATTEMPTS} failed (${errorSummary(error)}); retrying in ${delayMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(
    `${label} request failed after ${FETCH_ATTEMPTS} attempts: ${errorSummary(lastError)}`,
    { cause: lastError instanceof Error ? lastError : undefined }
  );
}

async function fetchArray(source) {
  const data = await fetchPayload(source.url, source.name);
  if (!Array.isArray(data)) {
    throw new Error(`${source.name} returned a non-array payload`);
  }
  return data;
}

async function fetchLatestTwseDaily() {
  let cursor = taipeiToday();

  for (let checked = 0; checked < 8; checked += 1) {
    const compact = cursor.replaceAll("-", "");
    const url = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${compact}&type=ALLBUT0999&response=json`;
    const payload = await fetchPayload(url, `TWSE MI_INDEX ${cursor}`);
    const rows = parseTwseMiIndexPayload(payload, cursor);

    if (rows.length >= 500) {
      return { rows, source: { name: "TWSE MI_INDEX", url }, date: cursor };
    }

    cursor = addDays(cursor, -1);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const fallbackRows = parseTwseQuoteRows(await fetchArray(TWSE_OPENAPI));
  if (fallbackRows.length < 500) {
    throw new Error(`Refusing suspiciously small TWSE fallback quote set: ${fallbackRows.length}`);
  }
  return {
    rows: fallbackRows,
    source: TWSE_OPENAPI,
    date: latestQuoteDate(fallbackRows)
  };
}

async function loadExisting() {
  try {
    return JSON.parse(await readFile(OUTPUT, "utf8"));
  } catch {
    return { generatedAt: "", sources: [], quotes: [] };
  }
}

async function main() {
  const existing = await loadExisting();
  const [twse, tpexRows] = await Promise.all([
    fetchLatestTwseDaily(),
    fetchArray(TPEX_SOURCE)
  ]);

  const twseQuotes = twse.rows;
  const tpexQuotes = parseTpexQuoteRows(tpexRows);

  if (twseQuotes.length < 500) {
    throw new Error(`Refusing suspiciously small TWSE quote set: ${twseQuotes.length}`);
  }
  if (tpexQuotes.length < 400) {
    throw new Error(`Refusing suspiciously small TPEx quote set: ${tpexQuotes.length}`);
  }

  const quotes = combineQuoteMarkets(existing.quotes ?? [], twseQuotes, tpexQuotes);
  const previous = JSON.stringify(existing.quotes ?? []);
  const next = JSON.stringify(quotes);

  console.log(
    `TWSE source ${twse.source.name}; TWSE latest ${latestQuoteDate(twseQuotes)}; TPEx latest ${latestQuoteDate(tpexQuotes)}; published latest ${latestQuoteDate(quotes)}`
  );

  if (previous === next) {
    console.log("No closing-price changes; leaving cache untouched.");
    return;
  }

  const fetchedAt = new Date().toISOString();
  const payload = {
    generatedAt: fetchedAt,
    sources: [
      { ...twse.source, fetchedAt },
      { ...TPEX_SOURCE, fetchedAt }
    ],
    quotes
  };

  await writeFile(OUTPUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Updated ${OUTPUT} with ${quotes.length} official closing quotes.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
