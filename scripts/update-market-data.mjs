import { mkdir, writeFile } from "node:fs/promises";

const QUOTE_SOURCES = [
  {
    name: "TWSE",
    url: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
  },
  {
    name: "TPEx",
    url: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes"
  }
];

const REVENUE_SOURCES = [
  {
    name: "TWSE",
    url: "https://openapi.twse.com.tw/v1/opendata/t187ap05_L"
  },
  {
    name: "TPEx",
    url: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O"
  }
];

function cleanNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replaceAll(",", "").trim();
  if (!normalized || normalized === "--" || normalized === "---" || normalized === "X") return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const ymd = raw.match(/^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  const roc = raw.match(/^(\d{3})[-\/]?(\d{2})[-\/]?(\d{2})$/);
  if (roc) {
    const year = Number(roc[1]) + 1911;
    return `${year}-${roc[2]}-${roc[3]}`;
  }

  return raw;
}

function normalizePeriod(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const compact = raw.replaceAll("/", "").replaceAll("-", "");
  if (/^\d{6}$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}`;
  }
  if (/^\d{5}$/.test(compact)) {
    const year = Number(compact.slice(0, 3)) + 1911;
    return `${year}-${compact.slice(3, 5)}`;
  }

  return raw;
}

function firstValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
      return row[key];
    }
  }
  return undefined;
}

async function fetchJson(source) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "PortfolioPilot/0.6 (+https://github.com/xiaoyuan1124/PORTFOLIOPILOT)",
      accept: "application/json"
    },
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    throw new Error(`${source.name} request failed: ${response.status} (${source.url})`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`${source.name} returned non-array payload (${source.url})`);
  }

  return data;
}

function parseTwseQuotes(rows) {
  return rows.flatMap((row) => {
    const close = cleanNumber(row.ClosingPrice);
    const code = String(row.Code ?? "").trim();
    const name = String(row.Name ?? "").trim();
    const date = normalizeDate(row.Date);

    if (!code || !name || close === null || close < 0) return [];

    return [{
      code,
      name,
      market: "TWSE",
      close,
      date
    }];
  });
}

function parseTpexQuotes(rows) {
  return rows.flatMap((row) => {
    const close = cleanNumber(row.Close);
    const code = String(row.SecuritiesCompanyCode ?? "").trim();
    const name = String(row.CompanyName ?? "").trim();
    const date = normalizeDate(row.Date);

    if (!code || !name || close === null || close < 0) return [];

    return [{
      code,
      name,
      market: "TPEx",
      close,
      date
    }];
  });
}

function parseRevenue(rows, market) {
  return rows.flatMap((row) => {
    const code = String(firstValue(row, ["公司代號", "SecuritiesCompanyCode", "Code"]) ?? "").trim();
    const name = String(firstValue(row, ["公司名稱", "CompanyName", "Name"]) ?? "").trim();
    const industry = String(firstValue(row, ["產業別", "Industry"]) ?? "").trim();
    const period = normalizePeriod(firstValue(row, ["資料年月", "年月", "YearMonth"]));
    const revenue = cleanNumber(firstValue(row, ["營業收入-當月營收", "當月營收", "CurrentMonthRevenue"]));
    const lastYearRevenue = cleanNumber(firstValue(row, ["營業收入-去年當月營收", "去年當月營收", "LastYearMonthRevenue"]));
    const momPct = cleanNumber(firstValue(row, ["營業收入-上月比較增減(%)", "上月比較增減(%)", "MoM"]));
    const yoyPct = cleanNumber(firstValue(row, ["營業收入-去年同月增減(%)", "去年同月增減(%)", "YoY"]));
    const cumulativeRevenue = cleanNumber(firstValue(row, ["累計營業收入-當月累計營收", "當月累計營收", "CumulativeRevenue"]));
    const cumulativeYoyPct = cleanNumber(firstValue(row, ["累計營業收入-前期比較增減(%)", "前期比較增減(%)", "CumulativeYoY"]));

    if (!code || !name || !period || revenue === null) return [];

    return [{
      code,
      name,
      market,
      industry,
      period,
      revenue,
      lastYearRevenue,
      momPct,
      yoyPct,
      cumulativeRevenue,
      cumulativeYoyPct
    }];
  });
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const [twseQuoteRows, tpexQuoteRows, twseRevenueRows, tpexRevenueRows] = await Promise.all([
    fetchJson(QUOTE_SOURCES[0]),
    fetchJson(QUOTE_SOURCES[1]),
    fetchJson(REVENUE_SOURCES[0]),
    fetchJson(REVENUE_SOURCES[1])
  ]);

  const quotes = [...parseTwseQuotes(twseQuoteRows), ...parseTpexQuotes(tpexQuoteRows)]
    .sort((a, b) => a.code.localeCompare(b.code, "en"));

  if (quotes.length < 500) {
    throw new Error(`Refusing to publish suspiciously small quote set: ${quotes.length}`);
  }

  const revenue = [...parseRevenue(twseRevenueRows, "TWSE"), ...parseRevenue(tpexRevenueRows, "TPEx")]
    .sort((a, b) => a.code.localeCompare(b.code, "en"));

  if (revenue.length < 500) {
    throw new Error(`Refusing to publish suspiciously small revenue set: ${revenue.length}`);
  }

  const quotePayload = {
    generatedAt: fetchedAt,
    sources: QUOTE_SOURCES.map((source) => ({ ...source, fetchedAt })),
    quotes
  };

  const revenuePayload = {
    generatedAt: fetchedAt,
    sources: REVENUE_SOURCES.map((source) => ({ ...source, fetchedAt })),
    rows: revenue
  };

  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/tw-quotes.json", JSON.stringify(quotePayload, null, 2) + "\n", "utf8");
  await writeFile("public/data/tw-revenue.json", JSON.stringify(revenuePayload, null, 2) + "\n", "utf8");

  console.log(`Wrote ${quotes.length} TWSE/TPEx quotes`);
  console.log(`Wrote ${revenue.length} TWSE/TPEx monthly revenue rows`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
