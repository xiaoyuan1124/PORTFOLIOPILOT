import { mkdir, readFile, writeFile } from "node:fs/promises";
import { mergeMaterialEventRows, parseMaterialEventRows } from "./lib/material-events.mjs";

const RETENTION_DAYS = 45;

const SOURCES = [
  {
    name: "TWSE MOPS daily material information",
    market: "TWSE",
    url: "https://openapi.twse.com.tw/v1/opendata/t187ap04_L"
  },
  {
    name: "TPEx MOPS daily material information",
    market: "TPEx",
    url: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O"
  }
];

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

async function fetchRows(source) {
  return withRetry(source.name, async () => {
    const response = await fetch(source.url, {
      headers: {
        "user-agent": "PortfolioPilot/0.48 (+https://github.com/xiaoyuan1124/PORTFOLIOPILOT)",
        accept: "application/json"
      },
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      throw new Error(`${source.name} request failed: ${response.status} (${source.url})`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error(`${source.name} returned non-array payload`);
    }
    return parseMaterialEventRows(payload, source.market);
  });
}

function taipeiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const referenceDate = taipeiDateKey();

  const batches = await Promise.all(SOURCES.map(fetchRows));
  const incoming = batches.flat();

  let existingRows = [];
  try {
    const existing = JSON.parse(await readFile("public/data/tw-material-events.json", "utf8"));
    existingRows = Array.isArray(existing?.rows) ? existing.rows : [];
  } catch {
    existingRows = [];
  }

  const rows = mergeMaterialEventRows(existingRows, incoming, {
    retentionDays: RETENTION_DAYS,
    referenceDate
  });

  const payload = {
    generatedAt: fetchedAt,
    retentionDays: RETENTION_DAYS,
    sources: SOURCES.map((source, index) => ({
      name: source.name,
      market: source.market,
      url: source.url,
      fetchedAt,
      rowCount: batches[index]?.length ?? 0
    })),
    rows
  };

  await mkdir("public/data", { recursive: true });
  await writeFile(
    "public/data/tw-material-events.json",
    JSON.stringify(payload, null, 2) + "\n",
    "utf8"
  );

  console.log(`Wrote ${rows.length} recent official material events; ${incoming.length} rows fetched today`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
