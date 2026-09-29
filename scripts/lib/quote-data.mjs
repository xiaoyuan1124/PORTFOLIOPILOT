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

export function parseTwseQuoteRows(rows) {
  return rows.flatMap((row) => {
    const close = cleanQuoteNumber(row.ClosingPrice);
    const code = String(row.Code ?? "").trim();
    const name = String(row.Name ?? "").trim();
    const date = normalizeQuoteDate(row.Date);

    if (!code || !name || !date || close === null || close < 0) return [];
    return [{ code, name, market: "TWSE", close, date }];
  });
}

export function parseTpexQuoteRows(rows) {
  return rows.flatMap((row) => {
    const close = cleanQuoteNumber(row.Close);
    const code = String(row.SecuritiesCompanyCode ?? "").trim();
    const name = String(row.CompanyName ?? "").trim();
    const date = normalizeQuoteDate(row.Date);

    if (!code || !name || !date || close === null || close < 0) return [];
    return [{ code, name, market: "TPEx", close, date }];
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
