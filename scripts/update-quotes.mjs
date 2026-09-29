import { readFile, writeFile } from "node:fs/promises";
import {
  combineQuoteMarkets,
  latestQuoteDate,
  parseTpexQuoteRows,
  parseTwseQuoteRows
} from "./lib/quote-data.mjs";

const OUTPUT = "public/data/tw-quotes.json";
const SOURCES = [
  {
    name: "TWSE",
    url: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
  },
  {
    name: "TPEx",
    url: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
  }
];

async function fetchJson(source) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "PortfolioPilot/0.18 (+https://github.com/xiaoyuan1124/PORTFOLIOPILOT)",
      accept: "application/json"
    },
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    throw new Error(`${source.name} request failed: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`${source.name} returned a non-array payload`);
  }
  return data;
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
  const [twseRows, tpexRows] = await Promise.all(SOURCES.map(fetchJson));

  const twseQuotes = parseTwseQuoteRows(twseRows);
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
    `TWSE latest ${latestQuoteDate(twseQuotes)}; TPEx latest ${latestQuoteDate(tpexQuotes)}; published latest ${latestQuoteDate(quotes)}`
  );

  if (previous === next) {
    console.log("No closing-price changes; leaving cache untouched.");
    return;
  }

  const fetchedAt = new Date().toISOString();
  const payload = {
    generatedAt: fetchedAt,
    sources: SOURCES.map((source) => ({ ...source, fetchedAt })),
    quotes
  };

  await writeFile(OUTPUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Updated ${OUTPUT} with ${quotes.length} official closing quotes.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
