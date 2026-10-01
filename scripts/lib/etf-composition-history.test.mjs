import { describe, expect, it } from "vitest";
import {
  ETF_COMPOSITION_HISTORY_LIMIT_PER_FUND,
  mergeEtfCompositionHistory
} from "./etf-composition-history.mjs";

function composition(symbol, asOf, weight = 10, name = symbol) {
  return {
    id: `composition:TW:${symbol}`,
    etfMarket: "TW",
    etfSymbol: symbol,
    etfName: name,
    asOf,
    sourceName: "issuer",
    sourceUrl: "https://example.com",
    sourceType: "official_issuer",
    constituents: [
      { market: "TW", symbol: "2330", name: "台積電", weightPct: weight, sector: "半導體" }
    ]
  };
}

describe("ETF composition history", () => {
  it("keeps distinct as-of snapshots for the same ETF", () => {
    const history = mergeEtfCompositionHistory(
      [composition("00935", "2026-09-29", 20)],
      [composition("00935", "2026-09-30", 21)]
    );

    expect(history.map((item) => item.asOf)).toEqual(["2026-09-30", "2026-09-29"]);
  });

  it("replaces a same-date snapshot with the newest official payload", () => {
    const history = mergeEtfCompositionHistory(
      [composition("00935", "2026-09-30", 20)],
      [composition("00935", "2026-09-30", 21)]
    );

    expect(history).toHaveLength(1);
    expect(history[0]?.constituents[0]?.weightPct).toBe(21);
  });

  it("caps history independently for each ETF", () => {
    const first = Array.from({ length: ETF_COMPOSITION_HISTORY_LIMIT_PER_FUND + 5 }, (_, index) => {
      const day = String((index % 28) + 1).padStart(2, "0");
      const month = String(Math.floor(index / 28) + 1).padStart(2, "0");
      return composition("00935", `2026-${month}-${day}`, 20 + index / 100);
    });
    const second = [
      composition("009816", "2026-09-29", 10),
      composition("009816", "2026-09-30", 11)
    ];

    const history = mergeEtfCompositionHistory([...first, ...second], []);
    const firstRows = history.filter((item) => item.etfSymbol === "00935");
    const secondRows = history.filter((item) => item.etfSymbol === "009816");

    expect(firstRows).toHaveLength(ETF_COMPOSITION_HISTORY_LIMIT_PER_FUND);
    expect(secondRows).toHaveLength(2);
    expect(firstRows[0]?.asOf > firstRows.at(-1)?.asOf).toBe(true);
  });

  it("ignores malformed legacy rows instead of poisoning the public cache", () => {
    const history = mergeEtfCompositionHistory(
      [{ etfMarket: "TW", etfSymbol: "00935", asOf: "bad-date", constituents: [] }],
      [composition("00935", "2026-09-30", 21)]
    );
    expect(history).toHaveLength(1);
    expect(history[0]?.asOf).toBe("2026-09-30");
  });
});
