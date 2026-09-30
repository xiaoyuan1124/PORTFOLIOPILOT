import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseTpexValuations, parseTwseValuations } from "./lib/valuation-data.mjs";
import { combineQuoteMarkets, parseTpexQuoteRows, parseTwseQuoteRows } from "./lib/quote-data.mjs";

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

const VALUATION_SOURCES = [
  {
    name: "TWSE",
    url: "https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL"
  },
  {
    name: "TPEx",
    url: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis"
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

async function withRetry(label, task, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delayMs = attempt * 1_500;
      console.warn(`${label} attempt ${attempt}/${attempts} failed; retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed after retries`);
}

async function fetchJson(source) {
  return withRetry(source.name, async () => {
    const response = await fetch(source.url, {
      headers: {
        "user-agent": "PortfolioPilot/0.19 (+https://github.com/xiaoyuan1124/PORTFOLIOPILOT)",
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
  return withRetry("MOPS history", async () => {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 PortfolioPilot/0.19",
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
  });
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

function isoDateParts(date) {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function addCalendarDays(date, delta) {
  const { year, month, day } = isoDateParts(date);
  const next = new Date(Date.UTC(year, month - 1, day + delta));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function twseDateParam(date) {
  return date.replaceAll("-", "");
}

function tpexDateParam(date) {
  const { year, month, day } = isoDateParts(date);
  return `${year - 1911}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

async function fetchObject(url, label) {
  return withRetry(label, async () => {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 PortfolioPilot/0.19",
        accept: "application/json,text/javascript,*/*"
      },
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      throw new Error(`${label} request failed: ${response.status} (${url})`);
    }

    const payload = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error(`${label} returned invalid payload (${url})`);
    }
    return payload;
  });
}

function cleanInteger(value) {
  const number = cleanNumber(value);
  return number === null ? null : Math.trunc(number);
}

function fieldIndex(fields, candidates) {
  for (const candidate of candidates) {
    const index = fields.findIndex((field) => String(field).trim() === candidate);
    if (index >= 0) return index;
  }
  return -1;
}

function parseTwseInstitutional(payload, date) {
  if (String(payload.stat ?? "").toUpperCase() !== "OK") return [];
  const fields = Array.isArray(payload.fields) ? payload.fields.map((field) => String(field).trim()) : [];
  const rows = Array.isArray(payload.data) ? payload.data : [];
  if (!fields.length || !rows.length) return [];

  const codeIndex = fieldIndex(fields, ["證券代號", "股票代號"]);
  const nameIndex = fieldIndex(fields, ["證券名稱", "股票名稱"]);
  const foreignIndex = fieldIndex(fields, [
    "外陸資買賣超股數(不含外資自營商)",
    "外資及陸資買賣超股數(不含外資自營商)"
  ]);
  const trustIndex = fieldIndex(fields, ["投信買賣超股數"]);

  if ([codeIndex, nameIndex, foreignIndex, trustIndex].some((index) => index < 0)) {
    throw new Error(`TWSE T86 fields changed on ${date}`);
  }

  return rows.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const code = String(row[codeIndex] ?? "").trim();
    const name = String(row[nameIndex] ?? "").trim();
    const foreignNet = cleanInteger(row[foreignIndex]);
    const trustNet = cleanInteger(row[trustIndex]);
    if (!code || !name || foreignNet === null || trustNet === null) return [];
    return [{ date, code, name, market: "TWSE", foreignNet, trustNet }];
  });
}

function findTpexInstitutionalTable(payload) {
  const tables = Array.isArray(payload.tables) ? payload.tables : [];
  return tables.find((table) =>
    Array.isArray(table?.data) &&
    String(table?.title ?? "").includes("三大法人")
  ) ?? tables.find((table) => Array.isArray(table?.data) && table.data.length > 0) ?? null;
}

function parseTpexInstitutional(payload, date) {
  const table = findTpexInstitutionalTable(payload);
  if (!table || !Array.isArray(table.data)) return [];

  return table.data.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 8) return [];

    const code = String(row[0] ?? "").trim();
    const name = String(row[1] ?? "").trim();

    // Current layout: [2-4] foreign/China ex foreign-dealer, [11-13] investment trust.
    // Older layout: [2-4] foreign/China, [5-7] investment trust.
    const trustIndex = row.length >= 14 ? 13 : 7;
    const foreignNet = cleanInteger(row[4]);
    const trustNet = cleanInteger(row[trustIndex]);

    if (!code || !name || foreignNet === null || trustNet === null) return [];
    return [{ date, code, name, market: "TPEx", foreignNet, trustNet }];
  });
}

function aggregateInstitutionalDays(days) {
  const map = new Map();

  for (const day of days) {
    for (const row of [...day.twse, ...day.tpex]) {
      const key = `${row.market}:${row.code}`;
      const current = map.get(key) ?? {
        code: row.code,
        name: row.name,
        market: row.market,
        foreign10d: 0,
        trust10d: 0,
        observedDays: 0
      };
      current.foreign10d += row.foreignNet;
      current.trust10d += row.trustNet;
      current.observedDays += 1;
      map.set(key, current);
    }
  }

  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code, "en"));
}

async function fetchInstitutional10d(latestQuoteDate) {
  const accepted = [];
  let cursor = latestQuoteDate;

  for (let checked = 0; checked < 32 && accepted.length < 10; checked += 1) {
    const twseUrl = `https://www.twse.com.tw/rwd/zh/fund/T86?date=${twseDateParam(cursor)}&selectType=ALLBUT0999&response=json`;
    const twsePayload = await fetchObject(twseUrl, "TWSE T86");
    const twse = parseTwseInstitutional(twsePayload, cursor);

    if (twse.length >= 100) {
      const tpexUrl = `https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&sect=AL&date=${encodeURIComponent(tpexDateParam(cursor))}&response=json`;
      const tpexPayload = await fetchObject(tpexUrl, "TPEx institutional");
      const tpex = parseTpexInstitutional(tpexPayload, cursor);

      if (tpex.length < 100) {
        throw new Error(`Refusing incomplete TPEx institutional data on ${cursor}: ${tpex.length} rows`);
      }

      accepted.push({ date: cursor, twse, tpex });
    }

    cursor = addCalendarDays(cursor, -1);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  if (accepted.length !== 10) {
    throw new Error(`Could only resolve ${accepted.length} institutional trading days`);
  }

  return {
    tradingDates: accepted.map((day) => day.date),
    rows: aggregateInstitutionalDays(accepted),
    sources: [
      {
        name: "TWSE T86",
        urlTemplate: "https://www.twse.com.tw/rwd/zh/fund/T86?date=YYYYMMDD&selectType=ALLBUT0999&response=json"
      },
      {
        name: "TPEx dailyTrade",
        urlTemplate: "https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&sect=AL&date=ROC/MM/DD&response=json"
      }
    ]
  };
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const [
    twseQuoteRows,
    tpexQuoteRows,
    twseRevenueRows,
    tpexRevenueRows,
    twseValuationRows,
    tpexValuationRows
  ] = await Promise.all([
    fetchJson(QUOTE_SOURCES[0]),
    fetchJson(QUOTE_SOURCES[1]),
    fetchJson(REVENUE_SOURCES[0]),
    fetchJson(REVENUE_SOURCES[1]),
    fetchJson(VALUATION_SOURCES[0]),
    fetchJson(VALUATION_SOURCES[1])
  ]);

  let existingQuotes = [];
  try {
    const existingQuoteCache = JSON.parse(await readFile("public/data/tw-quotes.json", "utf8"));
    existingQuotes = Array.isArray(existingQuoteCache?.quotes) ? existingQuoteCache.quotes : [];
  } catch {
    existingQuotes = [];
  }

  const quotes = combineQuoteMarkets(
    existingQuotes,
    parseTwseQuoteRows(twseQuoteRows),
    parseTpexQuoteRows(tpexQuoteRows)
  );

  if (quotes.length < 500) {
    throw new Error(`Refusing to publish suspiciously small quote set: ${quotes.length}`);
  }

  const revenue = [...parseRevenue(twseRevenueRows, "TWSE"), ...parseRevenue(tpexRevenueRows, "TPEx")]
    .sort((a, b) => a.code.localeCompare(b.code, "en"));

  if (revenue.length < 500) {
    throw new Error(`Refusing to publish suspiciously small revenue set: ${revenue.length}`);
  }

  const twseValuations = parseTwseValuations(twseValuationRows);
  const tpexValuations = parseTpexValuations(tpexValuationRows);
  if (twseValuations.length < 500) {
    throw new Error(`Refusing incomplete TWSE valuation data: ${twseValuations.length} rows`);
  }
  if (tpexValuations.length < 400) {
    throw new Error(`Refusing incomplete TPEx valuation data: ${tpexValuations.length} rows`);
  }
  const valuations = [...twseValuations, ...tpexValuations]
    .sort((a, b) => a.code.localeCompare(b.code, "en"));

  const history = await fetchRevenueHistory(revenue);
  const latestQuoteDate = quotes.map((row) => row.date).filter(Boolean).sort().at(-1);
  if (!latestQuoteDate) throw new Error("Cannot determine latest quote date for institutional lookback.");
  const institutional = await fetchInstitutional10d(latestQuoteDate);

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

  const valuationPayload = {
    generatedAt: fetchedAt,
    sources: [
      {
        ...VALUATION_SOURCES[0],
        fetchedAt,
        asOf: twseValuations.map((row) => row.date).sort().at(-1),
        rowCount: twseValuations.length
      },
      {
        ...VALUATION_SOURCES[1],
        fetchedAt,
        asOf: tpexValuations.map((row) => row.date).sort().at(-1),
        rowCount: tpexValuations.length
      }
    ],
    rows: valuations
  };

  const revenueHistoryPayload = {
    generatedAt: fetchedAt,
    periods: history.periods,
    sources: history.sources,
    rows: history.rows
  };

  const institutionalPayload = {
    generatedAt: fetchedAt,
    tradingDates: institutional.tradingDates,
    sources: institutional.sources,
    rows: institutional.rows
  };

  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/tw-quotes.json", JSON.stringify(quotePayload, null, 2) + "\n", "utf8");
  await writeFile("public/data/tw-revenue.json", JSON.stringify(revenuePayload, null, 2) + "\n", "utf8");
  await writeFile("public/data/tw-valuations.json", JSON.stringify(valuationPayload, null, 2) + "\n", "utf8");
  await writeFile("public/data/tw-revenue-history.json", JSON.stringify(revenueHistoryPayload, null, 2) + "\n", "utf8");
  await writeFile("public/data/tw-institutional-10d.json", JSON.stringify(institutionalPayload, null, 2) + "\n", "utf8");

  console.log(`Wrote ${quotes.length} TWSE/TPEx quotes`);
  console.log(`Wrote ${revenue.length} TWSE/TPEx latest monthly revenue rows`);
  console.log(`Wrote ${valuations.length} TWSE/TPEx official valuation rows`);
  console.log(`Wrote ${history.rows.length} MOPS historical revenue rows for ${history.periods.join(", ")}`);
  console.log(`Wrote ${institutional.rows.length} institutional 10D aggregates for ${institutional.tradingDates.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
