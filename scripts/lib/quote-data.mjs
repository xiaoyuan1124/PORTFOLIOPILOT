export function cleanQuoteNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replaceAll(",", "").trim();
  if (!normalized || normalized === "--" || normalized === "---" || normalized === "X") return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function normalizeQuoteDate(value) {
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

export function quoteChangeMetrics(close, rawChange) {
  const raw = String(rawChange ?? "").trim();
  if (!raw || raw === "--" || raw === "---" || /^X/i.test(raw)) {
    return { change: null, changePct: null };
  }

  const change = cleanQuoteNumber(raw);
  if (change === null) return { change: null, changePct: null };

  const previousClose = close - change;
  if (!Number.isFinite(previousClose) || previousClose <= 0) {
    return { change, changePct: null };
  }

  return {
    change,
    changePct: (change / previousClose) * 100
  };
}

export function parseTwseQuoteRows(rows) {
  return rows.flatMap((row) => {
    const close = cleanQuoteNumber(row.ClosingPrice);
    const code = String(row.Code ?? "").trim();
    const name = String(row.Name ?? "").trim();
    const date = normalizeQuoteDate(row.Date);

    if (!code || !name || !date || close === null || close < 0) return [];
    const metrics = quoteChangeMetrics(close, row.Change);
    return [{ code, name, market: "TWSE", close, date, ...metrics }];
  });
}

function plainCell(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .trim();
}

function findFieldIndex(fields, names) {
  return fields.findIndex((field) => names.includes(plainCell(field)));
}

export function parseTwseMiIndexPayload(payload, date) {
  if (!payload || typeof payload !== "object") return [];
  if (payload.stat && String(payload.stat).toUpperCase() !== "OK") return [];

  const tables = Array.isArray(payload.tables) ? payload.tables : [];
  let table = tables.find((item) => {
    const fields = Array.isArray(item?.fields) ? item.fields.map(plainCell) : [];
    return fields.includes("證券代號") && fields.includes("收盤價");
  });

  if (!table && Array.isArray(payload.fields9) && Array.isArray(payload.data9)) {
    table = { fields: payload.fields9, data: payload.data9 };
  }

  if (!table || !Array.isArray(table.fields) || !Array.isArray(table.data)) return [];

  const fields = table.fields.map(plainCell);
  const codeIndex = findFieldIndex(fields, ["證券代號", "股票代號"]);
  const nameIndex = findFieldIndex(fields, ["證券名稱", "股票名稱"]);
  const closeIndex = findFieldIndex(fields, ["收盤價"]);
  const directionIndex = findFieldIndex(fields, ["漲跌(+/-)", "漲跌"]);
  const changeIndex = findFieldIndex(fields, ["漲跌價差", "漲跌"]);

  if ([codeIndex, nameIndex, closeIndex].some((index) => index < 0)) return [];

  return table.data.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const code = plainCell(row[codeIndex]);
    const name = plainCell(row[nameIndex]);
    const close = cleanQuoteNumber(plainCell(row[closeIndex]));

    if (!code || !name || close === null || close < 0) return [];

    let rawChange = changeIndex >= 0 ? plainCell(row[changeIndex]) : "";
    if (directionIndex >= 0) {
      const direction = plainCell(row[directionIndex]);
      if (direction === "X") {
        rawChange = "X";
      } else if (direction === "-" && rawChange && !rawChange.startsWith("-")) {
        rawChange = `-${rawChange}`;
      } else if (direction === "+" && rawChange && !rawChange.startsWith("+")) {
        rawChange = `+${rawChange}`;
      }
    }

    const metrics = quoteChangeMetrics(close, rawChange);
    return [{ code, name, market: "TWSE", close, date, ...metrics }];
  });
}

export function parseTpexQuoteRows(rows) {
  return rows.flatMap((row) => {
    const close = cleanQuoteNumber(row.Close);
    const code = String(row.SecuritiesCompanyCode ?? "").trim();
    const name = String(row.CompanyName ?? "").trim();
    const date = normalizeQuoteDate(row.Date);

    if (!code || !name || !date || close === null || close < 0) return [];
    const metrics = quoteChangeMetrics(close, row.Change);
    return [{ code, name, market: "TPEx", close, date, ...metrics }];
  });
}

export function latestQuoteDate(rows) {
  return rows.map((row) => row.date).filter(Boolean).sort().at(-1) ?? "";
}

export function chooseNonRegressingMarket(existingRows, freshRows, market) {
  const existing = existingRows.filter((row) => row.market === market);
  const fresh = freshRows.filter((row) => row.market === market);
  const existingDate = latestQuoteDate(existing);
  const freshDate = latestQuoteDate(fresh);

  if (!fresh.length) throw new Error(`No fresh ${market} quote rows returned.`);
  if (existingDate && freshDate && freshDate < existingDate) return existing;
  return fresh;
}

export function combineQuoteMarkets(existingRows, freshTwse, freshTpex) {
  return [
    ...chooseNonRegressingMarket(existingRows, freshTwse, "TWSE"),
    ...chooseNonRegressingMarket(existingRows, freshTpex, "TPEx")
  ].sort((a, b) => a.code.localeCompare(b.code, "en"));
}
