import { cleanQuoteNumber, isTpexWarrantCode } from "./quote-data.mjs";

export const PRICE_HISTORY_VERSION = 1;
export const PRICE_HISTORY_UNIVERSE_VERSION = 2;
export const DEFAULT_HISTORY_CALENDAR_DAYS = 400;

export function needsPriceHistoryRefresh(previousIndex, targetEndDate, hasExistingHistory = true) {
  if (!hasExistingHistory) return true;
  if (!previousIndex || typeof previousIndex !== "object") return true;
  if (typeof targetEndDate !== "string" || !targetEndDate) return true;
  if (previousIndex.universeVersion !== PRICE_HISTORY_UNIVERSE_VERSION) return true;
  if (previousIndex.endDate !== targetEndDate || previousIndex.targetEndDate !== targetEndDate) return true;
  const failed = Array.isArray(previousIndex.failed) ? previousIndex.failed : [];
  return failed.length > 0;
}

function plainCell(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .trim();
}

function fieldIndex(fields, candidates) {
  return fields.findIndex((field) => candidates.includes(plainCell(field)));
}

export function parseTpexDailyQuotesPayload(payload, date) {
  if (!payload || typeof payload !== "object") return [];
  const tables = Array.isArray(payload.tables) ? payload.tables : [];
  const table = tables.find((item) => {
    const fields = Array.isArray(item?.fields) ? item.fields.map(plainCell) : [];
    return (
      (fields.includes("代號") || fields.includes("證券代號")) &&
      (fields.includes("收盤") || fields.includes("收盤價")) &&
      Array.isArray(item?.data)
    );
  });
  if (!table) return [];

  const fields = table.fields.map(plainCell);
  const codeIndex = fieldIndex(fields, ["代號", "證券代號"]);
  const nameIndex = fieldIndex(fields, ["名稱", "證券名稱"]);
  const closeIndex = fieldIndex(fields, ["收盤", "收盤價"]);
  if ([codeIndex, nameIndex, closeIndex].some((index) => index < 0)) return [];

  return table.data.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const code = plainCell(row[codeIndex]).toUpperCase();
    const name = plainCell(row[nameIndex]);
    const close = cleanQuoteNumber(plainCell(row[closeIndex]));
    if (!code || !name || close === null || close <= 0 || isTpexWarrantCode(code)) return [];
    return [{ code, name, market: "TPEx", date, close }];
  });
}

export function bucketPrefix(code) {
  const normalized = String(code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (normalized.slice(0, 2) || "__").padEnd(2, "_");
}

export function bucketFileName(market, codeOrPrefix) {
  const prefix = String(codeOrPrefix).length === 2
    ? String(codeOrPrefix).toUpperCase()
    : bucketPrefix(codeOrPrefix);
  return `${market.toLowerCase()}-${prefix}.json`;
}

function normalizePoint(point) {
  if (!Array.isArray(point) || point.length < 2) return null;
  const date = String(point[0] ?? "");
  const close = Number(point[1]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) return null;
  return [date, close];
}

export function mergeSeriesPoints(existing = [], incoming = [], cutoffDate = "") {
  const byDate = new Map();
  for (const raw of [...existing, ...incoming]) {
    const point = normalizePoint(raw);
    if (!point) continue;
    if (cutoffDate && point[0] < cutoffDate) continue;
    byDate.set(point[0], point[1]);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function mergeHistoryBucket(existing, market, prefix, rows, cutoffDate, generatedAt) {
  const securities = {};
  const previous = existing?.securities && typeof existing.securities === "object"
    ? existing.securities
    : {};

  for (const [code, item] of Object.entries(previous)) {
    if (market === "TPEx" && isTpexWarrantCode(code)) continue;
    const points = mergeSeriesPoints(item?.points ?? [], [], cutoffDate);
    if (!points.length) continue;
    securities[code] = {
      name: String(item?.name ?? code),
      points
    };
  }

  const grouped = new Map();
  for (const row of rows) {
    if (row.market !== market || bucketPrefix(row.code) !== prefix) continue;
    if (market === "TPEx" && isTpexWarrantCode(row.code)) continue;
    const current = grouped.get(row.code) ?? { name: row.name, points: [] };
    current.name = row.name || current.name;
    current.points.push([row.date, row.close]);
    grouped.set(row.code, current);
  }

  for (const [code, item] of grouped) {
    const previousItem = securities[code];
    const points = mergeSeriesPoints(previousItem?.points ?? [], item.points, cutoffDate);
    if (!points.length) continue;
    securities[code] = { name: item.name || previousItem?.name || code, points };
  }

  const allPoints = Object.values(securities).flatMap((item) => item.points);
  const dates = allPoints.map((point) => point[0]).sort();

  return {
    version: PRICE_HISTORY_VERSION,
    generatedAt,
    market,
    prefix,
    startDate: dates[0] ?? null,
    endDate: dates.at(-1) ?? null,
    securities
  };
}

export function historyBucketStats(bucket) {
  const items = Object.values(bucket?.securities ?? {});
  return {
    symbols: items.length,
    points: items.reduce((sum, item) => sum + (Array.isArray(item.points) ? item.points.length : 0), 0)
  };
}


export function toRocDate(date) {
  const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO date: ${date}`);
  const year = Number(match[1]) - 1911;
  if (year <= 0) throw new Error(`Date predates ROC calendar support: ${date}`);
  return `${year}/${match[2]}/${match[3]}`;
}

export function calendarDateAdd(date, days) {
  const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid ISO date: ${date}`);
  const next = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function weekdayDates(startDate, endDate) {
  const dates = [];
  for (let cursor = startDate; cursor <= endDate; cursor = calendarDateAdd(cursor, 1)) {
    const [year, month, day] = cursor.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(cursor);
  }
  return dates;
}


export async function mapWithConcurrency(items, limit, worker) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`Concurrency limit must be a positive integer; got ${limit}`);
  }
  const values = Array.from(items);
  let cursor = 0;
  const results = new Array(values.length);

  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await worker(values[index], index);
    }
  }

  const workerCount = Math.min(limit, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}
