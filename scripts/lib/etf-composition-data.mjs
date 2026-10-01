function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
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

export function applySectorMap(composition, sectorMap) {
  return {
    ...composition,
    constituents: composition.constituents.map((item) => ({
      ...item,
      sector: sectorMap.get(item.symbol) || item.sector || "未分類"
    }))
  };
}
