// Historical TWSE OHLCV adapter. Prices are unadjusted; never guess
// missing rows or convert a current daily-close cache into OHLCV.
export const FIRST_PARTY_STRATEGY_SYMBOLS = ["2317", "2382", "2345", "2449", "3711", "3037"];

function finitePositive(cell, allowZero = false) {
  const cleaned = String(cell ?? "").replaceAll(",", "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && (allowZero ? value >= 0 : value > 0) ? value : null;
}
function isoRoc(value) {
  const match = /^\s*(\d{2,3})\/(\d{1,2})\/(\d{1,2})\s*$/.exec(String(value ?? ""));
  if (!match) return null;
  const y = Number(match[1]) + 1911, m = Number(match[2]), d = Number(match[3]);
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) return null;
  return String(y).padStart(4, "0") + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}
export function parseTwseStockDay(payload, requestedMonth) {
  if (payload?.stat !== "OK" || !Array.isArray(payload.fields) || !Array.isArray(payload.data)) return [];
  const labels = payload.fields.map((label) => String(label).trim());
  const fields = ["日期", "開盤價", "最高價", "最低價", "收盤價", "成交股數"];
  const columns = fields.map((field) => labels.indexOf(field));
  if (columns.some((i) => i === -1)) return [];
  const byDate = new Map();
  for (const row of payload.data) {
    if (!Array.isArray(row)) continue;
    const date = isoRoc(row[columns[0]]);
    const open = finitePositive(row[columns[1]]);
    const high = finitePositive(row[columns[2]]);
    const low = finitePositive(row[columns[3]]);
    const close = finitePositive(row[columns[4]]);
    const volume = finitePositive(row[columns[5]], true);
    if (!date || date.slice(0, 7) !== requestedMonth ||
      [open, high, low, close, volume].some((v) => v === null)) continue;
    if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) continue;
    byDate.set(date, [date, open, high, low, close, volume]);
  }
  return [...byDate.values()].sort((a, b) => a[0].localeCompare(b[0]));
}
export function mergeStrategyOhlcv(previous, incoming, maxDate) {
  const byDate = new Map();
  for (const row of [...previous, ...incoming]) {
    if (!Array.isArray(row) || row.length !== 6 || row[0] > maxDate) continue;
    const [date, open, high, low, close, volume] = row;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || [open, high, low, close].some((v) => !Number.isFinite(v) || v <= 0) ||
      !Number.isFinite(volume) || volume < 0 || high < Math.max(open, close) || low > Math.min(open, close)) continue;
    byDate.set(date, row);
  }
  return [...byDate.values()].sort((a, b) => a[0].localeCompare(b[0]));
}
