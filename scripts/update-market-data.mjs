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

const MOPS_HISTORY_BASE = "https://mopsov.twse.com.tw/nas/t21";

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
      "user-agent": "PortfolioPilot/0.7 (+https://github.com/xiaoyuan1124/PORTFOLIOPILOT)",
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

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function textFromCell(html) {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function htmlTableRows(html) {
  const rows = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;

  for (const rowMatch of html.matchAll(rowPattern)) {
    const rowHtml = rowMatch[1] ?? "";
    const cells = [...rowHtml.matchAll(cellPattern)].map((match) => textFromCell(match[1] ?? ""));
    if (cells.length) rows.push(cells);
  }

  return rows;
}

function periodParts(period) {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error(`Invalid revenue period: ${period}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

function addMonths(period, delta) {
  const { year, month } = periodParts(period);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function historyUrl(market, period, companyType) {
  const { year, month } = periodParts(period);
  const rocYear = year - 1911;
  const marketPath = market === "TWSE" ? "sii" : "otc";
  return `${MOPS_HISTORY_BASE}/${marketPath}/t21sc03_${rocYear}_${month}_${companyType}.html`;
}

async function fetchHistoryHtml(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 PortfolioPilot/0.7",
      accept: "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(30_000)
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`MOPS history request failed: ${response.status} (${url})`);

  const buffer = await response.arrayBuffer();
  const html = new TextDecoder("big5").decode(buffer);
  if (html.includes("查無資料")) return null;
  return html;
}

function parseHistoryRows(html, market, period, industryByCode) {
  return htmlTableRows(html).flatMap((cells) => {
    if (cells.length < 10) return [];

    const code = String(cells[0] ?? "").trim();
    const name = String(cells[1] ?? "").trim();
    const revenue = cleanNumber(cells[2]);
    const previousMonthRevenue = cleanNumber(cells[3]);
    const lastYearRevenue = cleanNumber(cells[4]);
    const momPct = cleanNumber(cells[5]);
    const yoyPct = cleanNumber(cells[6]);
    const cumulativeRevenue = cleanNumber(cells[7]);
    const lastYearCumulativeRevenue = cleanNumber(cells[8]);
    const cumulativeYoyPct = cleanNumber(cells[9]);
    const note = String(cells[10] ?? "").trim();

    if (!code || !name || revenue === null) return [];

    return [{
      code,
      name,
      market,
      industry: industryByCode.get(code) ?? "",
      period,
      revenue,
      previousMonthRevenue,
      lastYearRevenue,
      momPct,
      yoyPct,
      cumulativeRevenue,
      lastYearCumulativeRevenue,
      cumulativeYoyPct,
      note
    }];
  });
}

async function fetchRevenueHistory(latestRevenue) {
  const latestPeriod = latestRevenue.map((row) => row.period).sort().at(-1);
  if (!latestPeriod) throw new Error("Cannot determine latest monthly revenue period.");

  const periods = [0, -1, -2].map((offset) => addMonths(latestPeriod, offset));
  const industryByCode = new Map(latestRevenue.map((row) => [row.code, row.industry]));
  const requests = [];

  for (const period of periods) {
    for (const market of ["TWSE", "TPEx"]) {
      for (const companyType of [0, 1]) {
        const url = historyUrl(market, period, companyType);
        requests.push({ period, market, companyType, url });
      }
    }
  }

  const fetched = [];
  for (const request of requests) {
    const html = await fetchHistoryHtml(request.url);
    if (!html) continue;
    fetched.push({
      ...request,
      rows: parseHistoryRows(html, request.market, request.period, industryByCode)
    });
  }

  const deduped = new Map();
  for (const page of fetched) {
    for (const row of page.rows) {
      deduped.set(`${row.market}:${row.code}:${row.period}`, row);
    }
  }

  const rows = [...deduped.values()].sort(
    (a, b) => b.period.localeCompare(a.period) || a.code.localeCompare(b.code, "en")
  );

  const counts = new Map(periods.map((period) => [period, 0]));
  for (const row of rows) counts.set(row.period, (counts.get(row.period) ?? 0) + 1);

  for (const period of periods) {
    const count = counts.get(period) ?? 0;
    if (count < 500) {
      throw new Error(`Refusing to publish incomplete MOPS history for ${period}: ${count} rows`);
    }
  }

  return {
    periods,
    rows,
    sources: requests.map(({ period, market, companyType, url }) => ({
      period,
      market,
      companyType,
      url
    }))
  };
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

  const history = await fetchRevenueHistory(revenue);

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

  const revenueHistoryPayload = {
    generatedAt: fetchedAt,
    periods: history.periods,
    sources: history.sources,
    rows: history.rows
  };

  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/tw-quotes.json", JSON.stringify(quotePayload, null, 2) + "\n", "utf8");
  await writeFile("public/data/tw-revenue.json", JSON.stringify(revenuePayload, null, 2) + "\n", "utf8");
  await writeFile("public/data/tw-revenue-history.json", JSON.stringify(revenueHistoryPayload, null, 2) + "\n", "utf8");

  console.log(`Wrote ${quotes.length} TWSE/TPEx quotes`);
  console.log(`Wrote ${revenue.length} TWSE/TPEx latest monthly revenue rows`);
  console.log(`Wrote ${history.rows.length} MOPS historical revenue rows for ${history.periods.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
