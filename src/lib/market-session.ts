import type { TwQuoteCache } from "./market-data";

export type TaiwanMarketPhase =
  | "preopen"
  | "market_hours"
  | "post_close_refresh"
  | "closed"
  | "weekend";

export type TaiwanMarketStatus = {
  phase: TaiwanMarketPhase;
  label: string;
  helper: string;
  taipeiDate: string;
  minuteOfDay: number;
  twseDate: string | null;
  tpexDate: string | null;
  latestOfficialDate: string | null;
  sameDayCloseAvailable: boolean;
};

function taipeiParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute"))
  };
}

function latestFor(cache: TwQuoteCache | null, market: "TWSE" | "TPEx") {
  if (!cache) return null;
  return cache.quotes
    .filter((quote) => quote.market === market)
    .map((quote) => quote.date)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
}

function latestDate(a: string | null, b: string | null) {
  return [a, b].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

export function taiwanMarketStatus(cache: TwQuoteCache | null, now = new Date()): TaiwanMarketStatus {
  const taipei = taipeiParts(now);
  const minuteOfDay = taipei.hour * 60 + taipei.minute;
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(taipei.weekday);
  const twseDate = latestFor(cache, "TWSE");
  const tpexDate = latestFor(cache, "TPEx");
  const latestOfficialDate = latestDate(twseDate, tpexDate);
  const sameDayCloseAvailable = twseDate === taipei.date || tpexDate === taipei.date;

  if (!weekday) {
    return {
      phase: "weekend",
      label: "週末／非平日",
      helper: latestOfficialDate
        ? `目前顯示最近官方收盤 ${latestOfficialDate}`
        : "等待官方收盤資料",
      taipeiDate: taipei.date,
      minuteOfDay,
      twseDate,
      tpexDate,
      latestOfficialDate,
      sameDayCloseAvailable
    };
  }

  if (minuteOfDay < 9 * 60) {
    return {
      phase: "preopen",
      label: "開盤前",
      helper: latestOfficialDate
        ? `目前顯示最近官方收盤 ${latestOfficialDate}`
        : "等待官方收盤資料",
      taipeiDate: taipei.date,
      minuteOfDay,
      twseDate,
      tpexDate,
      latestOfficialDate,
      sameDayCloseAvailable
    };
  }

  if (minuteOfDay <= 13 * 60 + 30) {
    return {
      phase: "market_hours",
      label: "盤中時段",
      helper: latestOfficialDate
        ? `PortfolioPilot 仍使用最近官方收盤 ${latestOfficialDate}，不把昨日收盤冒充即時價`
        : "盤中不使用來源未授權的即時行情",
      taipeiDate: taipei.date,
      minuteOfDay,
      twseDate,
      tpexDate,
      latestOfficialDate,
      sameDayCloseAvailable
    };
  }

  if (!sameDayCloseAvailable && minuteOfDay < 15 * 60 + 30) {
    return {
      phase: "post_close_refresh",
      label: "收盤資料更新中",
      helper: latestOfficialDate
        ? `交易已結束，正在等待今日官方收盤；目前仍是 ${latestOfficialDate}`
        : "交易已結束，正在等待今日官方收盤資料",
      taipeiDate: taipei.date,
      minuteOfDay,
      twseDate,
      tpexDate,
      latestOfficialDate,
      sameDayCloseAvailable
    };
  }

  return {
    phase: "closed",
    label: sameDayCloseAvailable ? "今日收盤已更新" : "最近收盤",
    helper: latestOfficialDate
      ? `最新官方收盤資料日 ${latestOfficialDate}`
      : "等待官方收盤資料",
    taipeiDate: taipei.date,
    minuteOfDay,
    twseDate,
    tpexDate,
    latestOfficialDate,
    sameDayCloseAvailable
  };
}
