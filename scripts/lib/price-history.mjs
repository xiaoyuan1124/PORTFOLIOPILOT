import { cleanQuoteNumber } from "./quote-data.mjs";

export const PRICE_HISTORY_VERSION = 1;
export const DEFAULT_HISTORY_CALENDAR_DAYS = 400;

function plainCell(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .trim();
}

function fieldIndex(fields, candidates) {
  return fields.findIndex((field) => candidates.includes(plainCell(field)));
}

function sourceDateFromValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const gregorianDigits = raw.replace(/\D/g, "");
  if (/^\d{8}$/.test(gregorianDigits)) {
    return `${gregorianDigits.slice(0, 4)}-${gregorianDigits.slice(4, 6)}-${gregorianDigits.slice(6, 8)}`;
  }

  const roc = raw.match(/(\d{2,3})[年\/\-](\d{1,2})[月\/\-](\d{1,2})日?/);
  if (roc) {
    return `${Number(roc[1]) + 1911}-${String(Number(roc[2])).padStart(2, "0")}-${String(Number(roc[3])).padStart(2, "0")}`;
  }

  const rocDigits = gregorianDigits.match(/^(\d{3})(\d{2})(\d{2})$/);
  if (rocDigits) {
    return `${Number(rocDigits[1]) + 1911}-${rocDigits[2]}-${rocDigits[3]}`;
  }

  return null;
}

export function historicalPayloadDate(payload) {
  const direct = sourceDateFromValue(payload?.date);
  if (direct) return direct;

  const tables = Array.isArray(payload?.tables) ? payload.tables : [];
  for (const table of tables) {
    const tableDate = sourceDateFromValue(table?.date);
    if (tableDate) return tableDate;
    const titleDate = sourceDateFromValue(table?.title);
    if (titleDate) return titleDate;
  }
  return null;
}

export function assertHistoricalPayloadDate(payload, requestedDate, market) {
  const actual = historicalPayloadDate(payload);
  if (!actual) {
    throw new Error(`${market} historical source date evidence missing for ${requestedDate}`);
  }
  if (actual !== requestedDate) {
    throw new Error(`${market} historical source date mismatch: requested ${requestedDate}, received ${actual}`);
  }
  return actual;
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
    if (!code || !name || close === null || close <= 0) return [];
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
