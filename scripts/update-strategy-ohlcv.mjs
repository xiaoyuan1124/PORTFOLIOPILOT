import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { FIRST_PARTY_STRATEGY_SYMBOLS, mergeStrategyOhlcv, parseTwseStockDay } from "./lib/strategy-ohlcv.mjs";

const DESTINATION = "public/data/tw-strategy-ohlcv.json";
const TIMEOUT = 18_000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tzNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
const today = tzNow.toISOString().slice(0, 10);
const firstOfMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, 1));
const months = Array.from({ length: 14 }, (_, idx) => {
  const d = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() - (13 - idx), 1));
  return d.toISOString().slice(0, 7);
});
async function readPrevious() {
  try {
    const data = JSON.parse(await readFile(DESTINATION, "utf8"));
    return data?.version === 1 && data?.securities && typeof data.securities === "object" ? data : null;
  } catch {
    return null;
  }
}
async function monthFor(symbol, month) {
  const date = month.replaceAll("-", "") + "01";
  const endpoint = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=" + date +
    "&stockNo=" + encodeURIComponent(symbol) + "&response=json";
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(endpoint, {
        headers: { accept: "application/json", "user-agent": "PortfolioPilot/0.92 (personal research; GitHub Pages)" },
        signal: AbortSignal.timeout(TIMEOUT)
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = await response.json();
      if (payload?.stat !== "OK") throw new Error("TWSE stat: " + String(payload?.stat ?? "invalid"));
      const rows = parseTwseStockDay(payload, month);
      if (!rows.length) throw new Error("no valid OHLCV rows");
      return rows;
    } catch (error) {
      last = error;
      if (attempt < 4) await delay(attempt * 1500);
    }
  }
  throw last;
}
const previous = await readPrevious();
const securities = {};
const failures = [];
for (const symbol of FIRST_PARTY_STRATEGY_SYMBOLS) {
  const existing = previous?.securities?.[symbol]?.points ?? [];
  const enoughHistory = existing.length >= 140 && existing[0]?.[0] <= months[0] + "-28";
  const monthsToFetch = enoughHistory ? months.slice(-2) : months;
  let fetched = [];
  for (const month of monthsToFetch) {
    try {
      const rows = await monthFor(symbol, month);
      fetched.push(...rows);
    } catch (error) {
      failures.push({ symbol, month, reason: String(error instanceof Error ? error.message : error).slice(0, 180) });
    }
    await delay(900); // Conservative TWSE pacing and retries after HTTP 307; no high-frequency scraping.
  }
  const merged = mergeStrategyOhlcv(existing, fetched, today);
  if (merged.length) securities[symbol] = { market: "TWSE", points: merged };
  console.log(symbol + ": " + merged.length + " genuine OHLCV rows; fetched " + fetched.length);
}
if (!Object.keys(securities).length) throw new Error("No verifiable official OHLCV; preserve previous cache.");
const source = {
  name: "Taiwan Stock Exchange · monthly STOCK_DAY",
  urlTemplate: "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=YYYYMM01&stockNo=SYMBOL&response=json",
  adjusted: false,
  volumeUnit: "shares"
};
const nextComparable = { version: 1, source, securities, failed: failures };
const previousComparable = previous && {
  version: previous.version, source: previous.source,
  securities: previous.securities, failed: previous.failed ?? []
};
if (JSON.stringify(nextComparable) === JSON.stringify(previousComparable)) {
  console.log("OHLCV unchanged; skipping commit.");
} else {
  const next = { ...nextComparable, generatedAt: new Date().toISOString() };
  await mkdir(dirname(DESTINATION), { recursive: true });
  await writeFile(DESTINATION, JSON.stringify(next) + "\n");
  console.log("Wrote official Strategy Lab OHLCV. Failures=" + failures.length);
}
