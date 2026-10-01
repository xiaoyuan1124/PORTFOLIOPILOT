import { readFile, writeFile } from "node:fs/promises";
import { applySectorMap, normalizeDate, parseIssuerComposition, parseNomuraFundAssetsPayload } from "./lib/etf-composition-data.mjs";

const OUTPUT = "public/data/tw-etf-compositions.json";
const REVENUE = "public/data/tw-revenue.json";

const SOURCES = [
  {
    adapter: "nomura_fund_assets",
    etfSymbol: "00935",
    etfName: "野村臺灣新科技50",
    sourceName: "野村投信官方持股比重",
    sourceUrl: "https://www.nomurafunds.com.tw/ETFWEB/product-description?fundNo=00935&tab=Shareholding"
  },
  {
    adapter: "issuer_html",
    etfSymbol: "009816",
    etfName: "凱基台灣TOP50",
    sourceName: "凱基投信",
    sourceUrl: "https://www.kgifund.com.tw/Fund/Detail?fundID=J023",
    datePatterns: [
      /持股比重\s*\((20\d{2}[\/-]\d{2}[\/-]\d{2})\)/,
      /最新淨值\s*\((20\d{2}[\/-]\d{2}[\/-]\d{2})\)/
    ]
  }
];

async function withRetry(label, task, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

async function fetchHtml(source) {
  return withRetry(source.etfSymbol, async () => {
    const response = await fetch(source.sourceUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 PortfolioPilot/0.78 (+https://github.com/xiaoyuan1124/PORTFOLIOPILOT)",
        accept: "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`${source.etfSymbol} 官方頁面 HTTP ${response.status}`);
    const html = await response.text();
    if (html.length < 1000) throw new Error(`${source.etfSymbol} 官方頁面內容異常短。`);
    return html;
  });
}

const NOMURA_API = "https://www.nomurafunds.com.tw/API/ETFAPI/api/";

function taipeiDateKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

async function postNomura(path, body) {
  return withRetry(`Nomura ${path}`, async () => {
    const response = await fetch(NOMURA_API + path, {
      method: "POST",
      headers: {
        "user-agent": "Mozilla/5.0 PortfolioPilot/0.78 (+https://github.com/xiaoyuan1124/PORTFOLIOPILOT)",
        "content-type": "application/json",
        accept: "application/json, text/plain, */*",
        origin: "https://www.nomurafunds.com.tw",
        referer: "https://www.nomurafunds.com.tw/ETFWEB/"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) {
      throw new Error(`野村官方 API ${path} HTTP ${response.status}`);
    }
    return response.json();
  });
}

async function fetchNomuraComposition(source) {
  const datePayload = await postNomura("Fund/GetFundTradeInfoDate", {
    Type: 1,
    Keyword: "",
    FundNo: source.etfSymbol,
    Date: taipeiDateKey()
  });

  if (datePayload?.StatusCode !== 0) {
    throw new Error(`${source.etfSymbol} 無法取得野村官方可用資料日。`);
  }

  const rawDates = [
    datePayload.Entries?.LatestDate,
    ...((datePayload.Entries?.AllDate ?? []).slice().reverse())
  ];
  const candidates = [...new Set(rawDates.map(normalizeDate).filter(Boolean))].slice(0, 7);
  if (!candidates.length) {
    throw new Error(`${source.etfSymbol} 野村官方 API 沒有可用資料日。`);
  }

  const failures = [];
  for (const date of candidates) {
    try {
      const payload = await postNomura("Fund/GetFundAssets", {
        FundID: source.etfSymbol,
        SearchDate: date
      });
      return parseNomuraFundAssetsPayload({
        payload,
        etfSymbol: source.etfSymbol,
        etfName: source.etfName,
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl
      });
    } catch (error) {
      failures.push(`${date}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`${source.etfSymbol} 最近 ${candidates.length} 個官方資料日都沒有可用持股：${failures.join(" | ")}`);
}

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(OUTPUT, "utf8"));
  } catch {
    return { generatedAt: new Date(0).toISOString(), sources: [], compositions: [] };
  }
}

async function sectorMap() {
  try {
    const cache = JSON.parse(await readFile(REVENUE, "utf8"));
    const map = new Map();
    for (const row of cache.rows ?? []) {
      if (row?.code && row?.industry && !map.has(String(row.code).toUpperCase())) {
        map.set(String(row.code).toUpperCase(), String(row.industry));
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

const previous = await loadPrevious();
const previousBySymbol = new Map((previous.compositions ?? []).map((item) => [item.etfSymbol, item]));
const sectors = await sectorMap();
const compositions = [];
const sources = [];

for (const source of SOURCES) {
  const fetchedAt = new Date().toISOString();
  try {
    const rawComposition = source.adapter === "nomura_fund_assets"
      ? await fetchNomuraComposition(source)
      : parseIssuerComposition({ html: await fetchHtml(source), ...source });
    const parsed = applySectorMap(rawComposition, sectors);
    compositions.push(parsed);
    sources.push({
      symbol: source.etfSymbol,
      name: source.etfName,
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
      fetchedAt,
      status: "ok"
    });
    console.log(`${source.etfSymbol}: ${parsed.asOf}, ${parsed.constituents.length} stocks, ${parsed.constituents.reduce((sum, item) => sum + item.weightPct, 0).toFixed(2)}% stock weight`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = previousBySymbol.get(source.etfSymbol);
    if (fallback) compositions.push(fallback);
    sources.push({
      symbol: source.etfSymbol,
      name: source.etfName,
      sourceName: source.sourceName,
      sourceUrl: source.sourceUrl,
      fetchedAt,
      status: fallback ? "stale" : "error",
      error: message
    });
    console.warn(`::warning::${source.etfSymbol} ETF composition refresh failed: ${message}${fallback ? " — preserving prior cache" : ""}`);
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  sources,
  compositions
};

await writeFile(OUTPUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`Wrote ${OUTPUT} with ${compositions.length}/${SOURCES.length} supported ETF compositions.`);
