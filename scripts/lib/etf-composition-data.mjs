// Issuer HTML can encode Chinese stock names with hexadecimal numeric
// references (e.g. "&#x806F;&#x767C;&#x79D1;" = "聯發科").
// Decode at ingestion, before persisting current and historical snapshots.
export function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (entity, hex, decimal) => {
      const point = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff &&
        !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : entity;
    });
}

export function textFromHtml(html) {
  return decodeHtmlEntities(
    String(html)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

export function htmlTables(html) {
  return [...String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => ({
    html: match[0],
    start: match.index ?? 0,
    rows: [...match[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) =>
      [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cell) => textFromHtml(cell[1]))
        .filter(Boolean)
    ).filter((cells) => cells.length)
  }));
}

function cleanWeight(value) {
  const normalized = String(value ?? "").replaceAll(",", "").replace("%", "").trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 && number <= 100 ? number : null;
}

function candidateRows(rows) {
  const bySymbol = new Map();
  for (const cells of rows) {
    const symbol = String(cells[0] ?? "").trim().toUpperCase();
    if (!/^\d{4,6}$/.test(symbol)) continue;
    const name = String(cells[1] ?? "").trim();
    if (!name) continue;
    let weightPct = null;
    for (let index = cells.length - 1; index >= 2; index -= 1) {
      const candidate = cleanWeight(cells[index]);
      if (candidate !== null) {
        weightPct = candidate;
        break;
      }
    }
    if (weightPct === null) continue;
    const current = bySymbol.get(symbol);
    if (!current || weightPct > current.weightPct) {
      bySymbol.set(symbol, { symbol, name, weightPct });
    }
  }
  return [...bySymbol.values()];
}

export function chooseStockTable(html) {
  const candidates = htmlTables(html)
    .map((table) => {
      const rows = candidateRows(table.rows);
      const totalWeight = rows.reduce((sum, row) => sum + row.weightPct, 0);
      return { ...table, stockRows: rows, totalWeight };
    })
    .filter((table) => table.stockRows.length >= 5 && table.totalWeight >= 10 && table.totalWeight <= 100.5)
    .sort((a, b) => b.stockRows.length - a.stockRows.length || b.totalWeight - a.totalWeight);
  return candidates[0] ?? null;
}

export function normalizeDate(value) {
  const match = String(value ?? "").match(/(20\d{2})[\/-](\d{2})[\/-](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function parseIssuerComposition({ html, etfSymbol, etfName, sourceName, sourceUrl, datePatterns }) {
  const table = chooseStockTable(html);
  if (!table) throw new Error(`${etfSymbol} 找不到可辨識的官方股票成份表。`);
  const pageText = textFromHtml(html);
  let asOf = "";
  for (const pattern of datePatterns) {
    const match = pageText.match(pattern);
    if (match?.[1]) {
      asOf = normalizeDate(match[1]);
      if (asOf) break;
    }
  }
  if (!asOf) {
    const preceding = textFromHtml(String(html).slice(Math.max(0, table.start - 5000), table.start));
    const dates = [...preceding.matchAll(/20\d{2}[\/-]\d{2}[\/-]\d{2}/g)]
      .map((match) => normalizeDate(match[0]))
      .filter(Boolean);
    asOf = dates.at(-1) ?? "";
  }
  if (!asOf) throw new Error(`${etfSymbol} 找不到可追溯的成份資料日期。`);
  return {
    id: `composition:TW:${etfSymbol}`,
    etfMarket: "TW",
    etfSymbol,
    etfName,
    asOf,
    sourceName,
    sourceUrl,
    sourceType: "official_issuer",
    constituents: table.stockRows.map((row) => ({
      market: "TW",
      symbol: row.symbol,
      name: row.name,
      weightPct: row.weightPct,
      sector: "未分類"
    }))
  };
}

export function parseNomuraFundAssetsPayload({
  payload,
  etfSymbol,
  etfName,
  sourceName,
  sourceUrl
}) {
  if (!payload || payload.StatusCode !== 0) {
    throw new Error(`${etfSymbol} 野村官方持股 API 回傳失敗狀態。`);
  }

  const data = payload.Entries?.Data;
  const stockTable = Array.isArray(data?.Table)
    ? data.Table.find((table) => table?.TableTitle === "股票")
    : null;
  if (!stockTable || !Array.isArray(stockTable.Rows)) {
    throw new Error(`${etfSymbol} 野村官方持股 API 沒有股票資料表。`);
  }

  const asOf = normalizeDate(stockTable.NavDate || data?.FundAsset?.NavDate);
  if (!asOf) {
    throw new Error(`${etfSymbol} 野村官方持股 API 缺少可追溯資料日。`);
  }

  const constituents = stockTable.Rows.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const symbol = String(row[0] ?? "").trim().toUpperCase();
    const name = decodeHtmlEntities(row[1]).trim();
    const weightPct = cleanWeight(row[3]);
    if (!/^\d{4,6}$/.test(symbol) || !name || weightPct === null) return [];
    return [{
      market: "TW",
      symbol,
      name,
      weightPct,
      sector: "未分類"
    }];
  });

  const totalWeight = constituents.reduce((sum, item) => sum + item.weightPct, 0);
  if (constituents.length < 5 || totalWeight < 10 || totalWeight > 100.5) {
    throw new Error(`${etfSymbol} 野村官方持股 API 股票資料不完整或權重異常。`);
  }

  return {
    id: `composition:TW:${etfSymbol}`,
    etfMarket: "TW",
    etfSymbol,
    etfName,
    asOf,
    sourceName,
    sourceUrl,
    sourceType: "official_issuer",
    constituents
  };
}

export function applySectorMap(composition, sectorMap) {
  return {
    ...composition,
    constituents: composition.constituents.map((item) => ({
      ...item,
      sector: sectorMap.get(item.symbol) || item.sector || "未分類"
    }))
  };
}
