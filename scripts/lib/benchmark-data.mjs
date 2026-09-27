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
