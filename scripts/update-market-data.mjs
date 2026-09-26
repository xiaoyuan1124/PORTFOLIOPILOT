import { mkdir, writeFile } from "node:fs/promises";

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

async function fetchJson(source) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "PortfolioPilot/0.5 (+https://github.com/xiaoyuan1124/PORTFOLIOPILOT)",
      accept: "application/json"
    },
    signal: AbortSignal.timeout(30_000)
  });

  if (!response.ok) {
    throw new Error(`${source.name} request failed: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`${source.name} returned non-array payload`);
  }

  return data;
}

function parseTwse(rows) {
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

function parseTpex(rows) {
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

async function main() {
  const fetchedAt = new Date().toISOString();
  const [twseRows, tpexRows] = await Promise.all(SOURCES.map(fetchJson));
  const quotes = [...parseTwse(twseRows), ...parseTpex(tpexRows)]
    .sort((a, b) => a.code.localeCompare(b.code, "en"));

  if (quotes.length < 500) {
    throw new Error(`Refusing to publish suspiciously small quote set: ${quotes.length}`);
  }

  const payload = {
    generatedAt: fetchedAt,
    sources: SOURCES.map((source) => ({
      ...source,
      fetchedAt
    })),
    quotes
  };

  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/tw-quotes.json", JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${quotes.length} TWSE/TPEx quotes`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
