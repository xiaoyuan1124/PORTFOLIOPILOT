function cleanNumber(value) {
  const raw = String(value ?? "").replaceAll(",", "").trim();
  if (!raw || raw === "--" || raw === "---") return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

export function rocDateToIso(value) {
  const match = /^(\d{3})\/(\d{2})\/(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
}

export function parseTwseTaiexTotalReturn(payload) {
  if (!payload || typeof payload !== "object" || String(payload.stat ?? "").toUpperCase() !== "OK") {
    return [];
  }
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 2) return [];
    const date = rocDateToIso(row[0]);
    const value = cleanNumber(row[1]);
    if (!date || value === null || value <= 0) return [];
    return [{ date, value }];
  });
}


export function parseTwseTaiexPrice(payload) {
  if (!payload || typeof payload !== "object" || String(payload.stat ?? "").toUpperCase() !== "OK") {
    return [];
  }
  const fields = Array.isArray(payload.fields) ? payload.fields.map((field) => String(field ?? "").trim()) : [];
  const dateIndex = fields.indexOf("日期");
  const valueIndex = fields.indexOf("發行量加權股價指數");
  if (dateIndex < 0 || valueIndex < 0) return [];

  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const date = rocDateToIso(row[dateIndex]);
    const value = cleanNumber(row[valueIndex]);
    if (!date || value === null || value <= 0) return [];
    return [{ date, value }];
  });
}

export function rollingMonthStarts(now = new Date(), months = 24) {
  if (!Number.isInteger(months) || months < 1) throw new Error("months must be a positive integer");
  const result = [];
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - offset, 1));
    result.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`);
  }
  return result;
}

export function twseMonthUrl(monthStart) {
  return `https://www.twse.com.tw/indicesReport/MFI94U?response=json&date=${monthStart.replaceAll("-", "")}`;
}

export function twsePriceMonthUrl(monthStart) {
  return `https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?date=${monthStart.replaceAll("-", "")}&response=json`;
}

/**
 * TWSE sometimes returns an HTTP 200 HTML protection/error page even when a
 * response=json URL was requested. Treat that as a transient *source outage*,
 * not as a parsed benchmark. Never silently accept non-JSON price data.
 */
export function parseTwseBenchmarkJsonText(body, label = "TWSE benchmark") {
  const raw = String(body ?? "");
  if (/^\s*</.test(raw)) {
    const error = new Error(`${label} returned HTML instead of official JSON`);
    error.status = 503;
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} returned malformed JSON; refusing benchmark update`);
  }
}

export function isTransientTwseRequestError(error) {
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

export async function retryTransientTwseRequest(
  operation,
  {
    attempts = 4,
    baseDelayMs = 1000,
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
      if (attempt >= attempts || !isTransientTwseRequestError(error)) throw error;
      const delayMs = baseDelayMs * (2 ** (attempt - 1));
      onRetry({ attempt, nextAttempt: attempt + 1, delayMs, error });
      await sleepImpl(delayMs);
    }
  }

  throw lastError;
}
