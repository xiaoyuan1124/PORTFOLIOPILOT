function fieldValue(row, candidates) {
  for (const [key, value] of Object.entries(row ?? {})) {
    const normalized = String(key).trim();
    if (candidates.includes(normalized) && value !== undefined && value !== null) {
      return String(value).trim();
    }
  }
  return "";
}

function isRealDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;
}

export function normalizeMaterialEventDate(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";

  let year;
  let month;
  let day;

  if (digits.length === 7) {
    year = Number(digits.slice(0, 3)) + 1911;
    month = Number(digits.slice(3, 5));
    day = Number(digits.slice(5, 7));
  } else if (digits.length === 8) {
    year = Number(digits.slice(0, 4));
    month = Number(digits.slice(4, 6));
    day = Number(digits.slice(6, 8));
  } else {
    return "";
  }

  if (!isRealDate(year, month, day)) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeMaterialEventTime(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.padStart(6, "0").slice(-6);
  const hour = Number(padded.slice(0, 2));
  const minute = Number(padded.slice(2, 4));
  const second = Number(padded.slice(4, 6));
  if (hour > 23 || minute > 59 || second > 59) return "";
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4, 6)}`;
}

export function parseMaterialEventRows(rows, market) {
  if (market !== "TWSE" && market !== "TPEx") {
    throw new Error(`Unsupported material-event market: ${market}`);
  }

  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const code = fieldValue(row, ["公司代號", "SecuritiesCompanyCode", "Code"]);
    const name = fieldValue(row, ["公司名稱", "CompanyName", "Name"]);
    const publishedDate = normalizeMaterialEventDate(fieldValue(row, ["發言日期", "PublishedDate"]));
    const publishedTime = normalizeMaterialEventTime(fieldValue(row, ["發言時間", "PublishedTime"]));
    const subject = fieldValue(row, ["主旨", "Subject"]);
    const rule = fieldValue(row, ["符合條款", "Rule"]);
    const factDateRaw = fieldValue(row, ["事實發生日", "FactDate"]);
    const factDate = normalizeMaterialEventDate(factDateRaw);
    const detail = fieldValue(row, ["說明", "Description"]);

    if (!code || !subject || !publishedDate) return [];

    return [{
      market,
      code,
      name,
      publishedDate,
      publishedTime,
      factDate: factDate || null,
      rule,
      subject,
      detail
    }];
  });
}

export function materialEventKey(row) {
  return [
    row.market,
    String(row.code ?? "").trim().toUpperCase(),
    row.publishedDate,
    row.publishedTime,
    row.subject
  ].join(":");
}

function addDays(date, delta) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid reference date: ${date}`);
  const next = new Date(Date.UTC(year, month - 1, day + delta));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function mergeMaterialEventRows(existing, incoming, options = {}) {
  const retentionDays = options.retentionDays ?? 45;
  const referenceDate = options.referenceDate;
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("retentionDays must be a positive integer");
  }
  if (!referenceDate || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
    throw new Error("referenceDate must be YYYY-MM-DD");
  }

  const cutoff = addDays(referenceDate, -(retentionDays - 1));
  const map = new Map();

  for (const row of [...(existing ?? []), ...(incoming ?? [])]) {
    if (!row?.publishedDate || row.publishedDate < cutoff || row.publishedDate > referenceDate) continue;
    map.set(materialEventKey(row), row);
  }

  return [...map.values()].sort((a, b) =>
    b.publishedDate.localeCompare(a.publishedDate) ||
    b.publishedTime.localeCompare(a.publishedTime) ||
    String(a.code).localeCompare(String(b.code), "en")
  );
}
