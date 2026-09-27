function cleanNumber(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).replaceAll(",", "").trim();
  if (!raw || raw === "--" || raw === "---" || raw.toUpperCase() === "N/A") return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

export function normalizeValuationDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const western = /^(\d{4})[-\/]?(\d{2})[-\/]?(\d{2})$/.exec(raw);
  if (western) return `${western[1]}-${western[2]}-${western[3]}`;

  const roc = /^(\d{3})[-\/]?(\d{2})[-\/]?(\d{2})$/.exec(raw);
  if (!roc) return "";
  return `${Number(roc[1]) + 1911}-${roc[2]}-${roc[3]}`;
}

function firstValue(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
  }
  return undefined;
}

function buildRow(row, market, fields) {
  const code = String(firstValue(row, fields.code) ?? "").trim();
  const name = String(firstValue(row, fields.name) ?? "").trim();
  const date = normalizeValuationDate(firstValue(row, fields.date));
  const pe = cleanNumber(firstValue(row, fields.pe));
  const pb = cleanNumber(firstValue(row, fields.pb));
  const dividendYield = cleanNumber(firstValue(row, fields.dividendYield));

  if (!code || !name || !date) return null;
  if ([pe, pb, dividendYield].every((value) => value === null)) return null;

  return { code, name, market, date, pe, pb, dividendYield };
}

export function parseTwseValuations(rows) {
  return (rows ?? []).flatMap((row) => {
    const parsed = buildRow(row, "TWSE", {
      code: ["Code"],
      name: ["Name"],
      date: ["Date"],
      pe: ["PEratio"],
      pb: ["PBratio"],
      dividendYield: ["DividendYield"]
    });
    return parsed ? [parsed] : [];
  });
}

export function parseTpexValuations(rows) {
  return (rows ?? []).flatMap((row) => {
    const parsed = buildRow(row, "TPEx", {
      code: ["SecuritiesCompanyCode", "Code"],
      name: ["CompanyName", "Name"],
      date: ["Date"],
      pe: ["PriceEarningRatio", "PEratio"],
      pb: ["PriceBookRatio", "PBratio"],
      dividendYield: ["YieldRatio", "DividendYield"]
    });
    return parsed ? [parsed] : [];
  });
}
