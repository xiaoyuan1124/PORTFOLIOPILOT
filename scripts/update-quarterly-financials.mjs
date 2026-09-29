import { mkdir, writeFile } from "node:fs/promises";
import {
  deriveSingleQuarterRows,
  parseMopsQuarterlyBytes,
  quarterKey,
  quarterNumber,
  retryTransientMopsRequest
} from "./lib/quarterly-financials.mjs";

const MOPS_URLS = [
  "https://mops.twse.com.tw/mops/web/ajax_t163sb04",
  "https://mopsov.twse.com.tw/mops/web/ajax_t163sb04"
];
const MARKETS = [
  { market: "TWSE", typek: "sii" },
  { market: "TPEx", typek: "otc" }
];
const MIN_COMPANY_ROWS = 50;
const REQUEST_DELAY_MS = 450;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function previousPeriod(period) {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match) throw new Error(`Invalid quarter key: ${period}`);
  const quarter = Number(match[2]);
  return quarter === 1 ? null : `${match[1]}-Q${quarter - 1}`;
}

function recentCompletedQuarters(count = 6, now = new Date()) {
  let year = now.getUTCFullYear();
  let quarter = Math.floor(now.getUTCMonth() / 3) + 1;

  quarter -= 1;
  if (quarter === 0) {
    quarter = 4;
    year -= 1;
  }

  const periods = [];
  for (let index = 0; index < count; index += 1) {
    periods.push({ year, quarter });
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return periods.reverse();
}

function formBody(typek, year, quarter) {
  return new URLSearchParams({
    encodeURIComponent: "1",
    step: "1",
    firstin: "1",
    off: "1",
    isQuery: "Y",
    TYPEK: typek,
    year: String(year - 1911),
    season: String(quarter).padStart(2, "0")
  }).toString();
}

async function fetchQuarter(source, year, quarter) {
  const period = quarterKey(year, quarter);

  return retryTransientMopsRequest(
    async (attempt) => {
      const url = MOPS_URLS[(attempt - 1) % MOPS_URLS.length];
      const response = await fetch(url, {
        method: "POST",
        redirect: "follow",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "Mozilla/5.0 PortfolioPilot/0.20",
          referer: `${new URL(url).origin}/`,
          accept: "text/html,application/xhtml+xml"
        },
        body: formBody(source.typek, year, quarter),
        signal: AbortSignal.timeout(45_000)
      });

      if (!response.ok) {
        const error = new Error(`MOPS ${source.market} ${period} request failed: ${response.status}`);
        error.status = response.status;
        throw error;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      const parsed = parseMopsQuarterlyBytes(bytes);
      const companyRows = parsed.generalRows.length + parsed.notApplicable.length;

      if (parsed.statementTables === 0 || companyRows === 0) {
        const error = new Error(`MOPS ${source.market} ${period} returned an empty/non-statement payload from ${url}`);
        error.code = "MOPS_EMPTY_PAYLOAD";
        throw error;
      }
      if (companyRows < MIN_COMPANY_ROWS) {
        throw new Error(`Refusing incomplete MOPS ${source.market} ${period}: ${companyRows} company rows`);
      }

      return { period, sourceUrl: url, ...parsed };
    },
    {
      attempts: 6,
      baseDelayMs: 1800,
      onRetry: ({ nextAttempt, delayMs, error }) => {
        console.warn(
          `Transient MOPS ${source.market} ${period} failure; retrying attempt ${nextAttempt}/6 in ${delayMs}ms: ${error?.message ?? error}`
        );
      }
    }
  );
}

function uniqueNotApplicable(rawByMarket, periods) {
  const byCode = new Map();
  for (const source of MARKETS) {
    for (const period of periods) {
      const raw = rawByMarket.get(source.market)?.get(period);
      for (const row of raw?.notApplicable ?? []) {
        const key = `${source.market}:${row.code}`;
        const current = byCode.get(key) ?? {
          code: row.code,
          name: row.name,
          market: source.market,
          periods: [],
          reason: "MOPS 將此公司列在沒有營業毛利欄位的特殊產業損益表，因此一般產業毛利率 Gate 不適用。"
        };
        if (!current.periods.includes(period)) current.periods.push(period);
        byCode.set(key, current);
      }
    }
  }
  return [...byCode.values()]
    .map((row) => ({ ...row, periods: row.periods.sort((a, b) => quarterNumber(a) - quarterNumber(b)) }))
    .sort((a, b) => a.code.localeCompare(b.code, "en"));
}

async function main() {
  const generatedAt = new Date().toISOString();
  const candidatePeriods = recentCompletedQuarters(6);
  const rawByMarket = new Map(MARKETS.map(({ market }) => [market, new Map()]));

  for (const { year, quarter } of candidatePeriods) {
    for (const source of MARKETS) {
      const result = await fetchQuarter(source, year, quarter);
      if (result) rawByMarket.get(source.market).set(result.period, result);
      await sleep(REQUEST_DELAY_MS);
    }
  }

  const commonPeriods = [...rawByMarket.get("TWSE").keys()]
    .filter((period) => rawByMarket.get("TPEx").has(period))
    .sort((a, b) => quarterNumber(a) - quarterNumber(b));

  const derivablePeriods = commonPeriods.filter((period) => {
    const previous = previousPeriod(period);
    return previous === null || MARKETS.every(({ market }) => rawByMarket.get(market).has(previous));
  });

  const periods = derivablePeriods.slice(-3);
  if (periods.length !== 3) {
    throw new Error(`Refusing to publish quarterly gross-margin cache with only ${periods.length} derivable periods`);
  }

  const rows = [];
  for (const period of periods) {
    const previous = previousPeriod(period);
    for (const source of MARKETS) {
      const current = rawByMarket.get(source.market).get(period);
      if (!current) throw new Error(`Missing ${source.market} ${period} after completeness check`);
      const previousRows = previous ? rawByMarket.get(source.market).get(previous)?.generalRows : null;
      const derived = deriveSingleQuarterRows({
        currentRows: current.generalRows,
        previousRows,
        period,
        market: source.market
      });
      if (derived.length < MIN_COMPANY_ROWS) {
        throw new Error(`Refusing incomplete derived ${source.market} ${period}: ${derived.length} general-industry rows`);
      }
      rows.push(...derived);
    }
  }

  const sourcePeriods = new Set(periods);
  for (const period of periods) {
    const previous = previousPeriod(period);
    if (previous) sourcePeriods.add(previous);
  }

  const sources = [];
  for (const period of [...sourcePeriods].sort((a, b) => quarterNumber(a) - quarterNumber(b))) {
    for (const source of MARKETS) {
      const raw = rawByMarket.get(source.market).get(period);
      if (!raw) continue;
      sources.push({
        name: "MOPS 公開資訊觀測站－綜合損益表",
        market: source.market,
        period,
        url: raw.sourceUrl ?? MOPS_URLS[0],
        method: "POST",
        fetchedAt: generatedAt,
        generalRows: raw.generalRows.length,
        notApplicableRows: raw.notApplicable.length
      });
    }
  }

  const payload = {
    generatedAt,
    periods,
    sources,
    rows: rows
      .filter((row) => periods.includes(row.period))
      .sort((a, b) => quarterNumber(a.period) - quarterNumber(b.period) || a.code.localeCompare(b.code, "en")),
    notApplicable: uniqueNotApplicable(rawByMarket, periods)
  };

  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/tw-quarterly-margins.json", `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${payload.rows.length} quarterly general-industry rows for ${periods.join(", ")}`);
  console.log(`Marked ${payload.notApplicable.length} special-industry companies not applicable`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
