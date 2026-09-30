import type { PortfolioActivity } from "./types";

export function dividendAmountTwd(activity: PortfolioActivity) {
  return activity.amount * (activity.currency === "USD" ? activity.fxRate : 1);
}

export function recentMonthKeys(today: string, count = 12) {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const anchor = year * 12 + (month - 1);
  const keys: string[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const index = anchor - offset;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
  }

  return keys;
}

export function buildDividendSummary(
  activities: PortfolioActivity[],
  today: string
) {
  const dividendActivities = activities.filter((activity) => activity.type === "dividend");
  const futureCount = dividendActivities.filter((activity) => activity.date > today).length;
  const rows = dividendActivities
    .filter((activity) => activity.date <= today)
    .map((activity) => ({
      activity,
      amountTwd: dividendAmountTwd(activity),
      month: activity.date.slice(0, 7),
      year: activity.date.slice(0, 4),
      symbol: activity.symbol.trim().toUpperCase() || "未指定"
    }))
    .filter((row) => Number.isFinite(row.amountTwd));

  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);
  const months = recentMonthKeys(today, 12);
  const trailingMonthSet = new Set(months);

  const monthly = months.map((month) => {
    const matched = rows.filter((row) => row.month === month);
    return {
      month,
      amountTwd: matched.reduce((sum, row) => sum + row.amountTwd, 0),
      count: matched.length
    };
  });

  const bySymbolMap = new Map<string, { symbol: string; amountTwd: number; count: number }>();
  const byYearMap = new Map<string, { year: string; amountTwd: number; count: number }>();

  for (const row of rows) {
    const symbol = bySymbolMap.get(row.symbol) ?? { symbol: row.symbol, amountTwd: 0, count: 0 };
    symbol.amountTwd += row.amountTwd;
    symbol.count += 1;
    bySymbolMap.set(row.symbol, symbol);

    const year = byYearMap.get(row.year) ?? { year: row.year, amountTwd: 0, count: 0 };
    year.amountTwd += row.amountTwd;
    year.count += 1;
    byYearMap.set(row.year, year);
  }

  return {
    recordCount: rows.length,
    futureCount,
    missingSymbolCount: rows.filter((row) => row.symbol === "未指定").length,
    lifetimeTwd: rows.reduce((sum, row) => sum + row.amountTwd, 0),
    currentYearTwd: rows.filter((row) => row.year === currentYear).reduce((sum, row) => sum + row.amountTwd, 0),
    currentMonthTwd: rows.filter((row) => row.month === currentMonth).reduce((sum, row) => sum + row.amountTwd, 0),
    trailing12Twd: rows.filter((row) => trailingMonthSet.has(row.month)).reduce((sum, row) => sum + row.amountTwd, 0),
    monthly,
    bySymbol: [...bySymbolMap.values()].sort((a, b) => b.amountTwd - a.amountTwd || a.symbol.localeCompare(b.symbol)),
    byYear: [...byYearMap.values()].sort((a, b) => b.year.localeCompare(a.year))
  };
}
