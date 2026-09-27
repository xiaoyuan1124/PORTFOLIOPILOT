const GENERAL_FIELDS = {
  code: ["公司代號"],
  name: ["公司名稱"],
  revenue: ["營業收入"],
  operatingCost: ["營業成本"],
  grossProfit: ["營業毛利（毛損）", "營業毛利(毛損)"]
};

function decodeHtmlEntities(value) {
  return value.replace(/&(#\d+|#x[\da-f]+|nbsp|amp|lt|gt|quot|apos);/gi, (entity, token) => {
    const lower = token.toLowerCase();
    if (lower === "nbsp") return " ";
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const radix = lower.startsWith("#x") ? 16 : 10;
    const digits = lower.slice(radix === 16 ? 2 : 1);
    const codePoint = Number.parseInt(digits, radix);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
  });
}

function cellText(value) {
  return decodeHtmlEntities(
    String(value ?? "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function normalizeHeader(value) {
  return cellText(value).replaceAll(" ", "").replaceAll("(", "（").replaceAll(")", "）");
}

export function parseFinancialNumber(value) {
  const raw = String(value ?? "").replaceAll(",", "").trim();
  if (!raw || raw === "--" || raw === "---" || raw === "X") return null;
  const normalized = /^\(.+\)$/.test(raw) ? `-${raw.slice(1, -1)}` : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function findIndex(header, candidates) {
  const normalized = header.map(normalizeHeader);
  for (const candidate of candidates) {
    const index = normalized.indexOf(normalizeHeader(candidate));
    if (index >= 0) return index;
  }
  return -1;
}

function tableRows(tableHtml) {
  return [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) =>
    [...String(rowMatch[1] ?? "").matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)]
      .map((cellMatch) => cellText(cellMatch[1]))
  ).filter((cells) => cells.length > 0);
}

function companyRows(rows, headerIndex) {
  return rows.slice(headerIndex + 1).filter((cells) => /^\d{4}$/.test(String(cells[0] ?? "").trim()));
}

export function parseMopsQuarterlyHtml(html) {
  const generalRows = [];
  const notApplicable = [];
  let statementTables = 0;

  for (const tableMatch of String(html ?? "").matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = tableRows(tableMatch[1] ?? "");
    const headerIndex = rows.findIndex((cells) => normalizeHeader(cells[0]) === normalizeHeader("公司代號"));
    if (headerIndex < 0) continue;

    const header = rows[headerIndex];
    const dataRows = companyRows(rows, headerIndex);
    if (!header || dataRows.length === 0) continue;
    statementTables += 1;

    const codeIndex = findIndex(header, GENERAL_FIELDS.code);
    const nameIndex = findIndex(header, GENERAL_FIELDS.name);
    const revenueIndex = findIndex(header, GENERAL_FIELDS.revenue);
    const costIndex = findIndex(header, GENERAL_FIELDS.operatingCost);
    const grossIndex = findIndex(header, GENERAL_FIELDS.grossProfit);
    const isGeneralIndustry = grossIndex >= 0;

    if (!isGeneralIndustry) {
      if (codeIndex < 0 || nameIndex < 0) continue;
      for (const cells of dataRows) {
        const code = String(cells[codeIndex] ?? "").trim();
        const name = String(cells[nameIndex] ?? "").trim();
        if (code && name) notApplicable.push({ code, name });
      }
      continue;
    }

    if ([codeIndex, nameIndex, revenueIndex, costIndex, grossIndex].some((index) => index < 0)) {
      throw new Error("MOPS quarterly financials: general-industry header is missing a required field");
    }

    for (const cells of dataRows) {
      const code = String(cells[codeIndex] ?? "").trim();
      const name = String(cells[nameIndex] ?? "").trim();
      const revenue = parseFinancialNumber(cells[revenueIndex]);
      const operatingCost = parseFinancialNumber(cells[costIndex]);
      const grossProfit = parseFinancialNumber(cells[grossIndex]);
      if (!code || !name) continue;
      generalRows.push({ code, name, revenue, operatingCost, grossProfit });
    }
  }

  return { generalRows, notApplicable, statementTables };
}

export function decodeMopsQuarterlyBytes(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("MOPS quarterly financials: invalid UTF-8 HTML");
  }
}

export function parseMopsQuarterlyBytes(bytes) {
  return parseMopsQuarterlyHtml(decodeMopsQuarterlyBytes(bytes));
}

export function quarterKey(year, quarter) {
  if (!Number.isInteger(year) || year < 2000 || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    throw new Error(`Invalid quarter: ${year}-Q${quarter}`);
  }
  return `${year}-Q${quarter}`;
}

export function quarterNumber(period) {
  const match = /^(\d{4})-Q([1-4])$/.exec(String(period ?? ""));
  if (!match) throw new Error(`Invalid quarter key: ${period}`);
  return Number(match[1]) * 10 + Number(match[2]);
}

export function deriveSingleQuarterRows({ currentRows, previousRows, period, market }) {
  const match = /^(\d{4})-Q([1-4])$/.exec(String(period ?? ""));
  if (!match) throw new Error(`Invalid quarter key: ${period}`);
  const quarter = Number(match[2]);
  if (quarter > 1 && !Array.isArray(previousRows)) {
    throw new Error(`${period} requires previous-quarter cumulative values`);
  }

  const previousByCode = new Map((previousRows ?? []).map((row) => [row.code, row]));
  const rows = [];

  for (const current of currentRows ?? []) {
    const previous = quarter === 1 ? null : previousByCode.get(current.code);
    if (quarter > 1 && !previous) continue;

    const currentValues = [current.revenue, current.operatingCost, current.grossProfit];
    const previousValues = previous ? [previous.revenue, previous.operatingCost, previous.grossProfit] : null;
    if (currentValues.some((value) => value === null) || previousValues?.some((value) => value === null)) continue;

    const [revenue, operatingCost, grossProfit] = previousValues
      ? currentValues.map((value, index) => value - previousValues[index])
      : currentValues;

    if (!Number.isFinite(revenue) || revenue <= 0 || !Number.isFinite(operatingCost) || !Number.isFinite(grossProfit)) continue;

    rows.push({
      code: current.code,
      name: current.name,
      market,
      period,
      revenue,
      operatingCost,
      grossProfit,
      grossMarginPct: Math.round((grossProfit / revenue) * 10000) / 100,
      basis: quarter === 1
        ? "Q1 cumulative statement equals the single quarter"
        : `${period} cumulative statement minus ${match[1]}-Q${quarter - 1} cumulative statement`
    });
  }

  return rows;
}

export function latestThreePeriods(rows) {
  return [...new Set((rows ?? []).map((row) => row.period))]
    .sort((a, b) => quarterNumber(b) - quarterNumber(a))
    .slice(0, 3)
    .sort((a, b) => quarterNumber(a) - quarterNumber(b));
}

export function evaluateGrossMarginTrend(rows, expectedPeriods) {
  const byPeriod = new Map((rows ?? []).map((row) => [row.period, row]));
  const selected = (expectedPeriods ?? []).map((period) => byPeriod.get(period) ?? null);
  if (expectedPeriods.length !== 3 || selected.some((row) => row === null)) {
    return { status: "insufficient", rows: selected.filter(Boolean), reason: "最近三個官方季度資料不完整。" };
  }

  const complete = selected;
  const margins = complete.map((row) => row.grossMarginPct);
  const pass = margins[0] < margins[1] && margins[1] < margins[2];
  return {
    status: pass ? "pass" : "fail",
    rows: complete,
    reason: pass
      ? "最近三季單季毛利率嚴格連續改善。"
      : "最近三季單季毛利率未形成 Q-2 < Q-1 < Q。"
  };
}


export function isTransientMopsRequestError(error) {
  const status = Number(error?.status);
  if (status === 429 || status >= 500) return true;

  const codes = new Set([
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "ETIMEDOUT",
    "ECONNRESET",
    "EAI_AGAIN"
  ]);
  if (codes.has(error?.code) || codes.has(error?.cause?.code)) return true;

  const name = String(error?.name ?? "");
  if (name === "AbortError" || name === "TimeoutError") return true;

  const message = String(error?.message ?? "");
  return error instanceof TypeError && /fetch failed|network|timeout/i.test(message);
}

export async function retryTransientMopsRequest(
  operation,
  {
    attempts = 4,
    baseDelayMs = 1200,
    sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onRetry = () => {}
  } = {}
) {
  if (typeof operation !== "function") throw new Error("retry operation must be a function");
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error("attempts must be a positive integer");

  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientMopsRequestError(error)) throw error;
      const delayMs = baseDelayMs * (2 ** (attempt - 1));
      onRetry({ attempt, nextAttempt: attempt + 1, delayMs, error });
      await sleepImpl(delayMs);
    }
  }
  throw lastError;
}
