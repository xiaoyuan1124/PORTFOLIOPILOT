# Official Benchmark Comparison

PortfolioPilot V0.13 adds an official total-return benchmark beside portfolio performance.

## Automated benchmark

The first automated benchmark is:

- Provider: Taiwan Stock Exchange (TWSE)
- Series: 發行量加權股價報酬指數
- PortfolioPilot id: `TWSE:TAIEX-TR`
- Return type: total return
- Currency: TWD
- Official historical endpoint: `https://www.twse.com.tw/indicesReport/MFI94U?response=json&date=YYYYMM01`
- TWSE information page: `https://www.twse.com.tw/zh/indices/taiex/mfi94u.html`

Unlike the ordinary TAIEX price index, this total-return series reflects cash-dividend reinvestment in the index methodology, making it a more appropriate performance reference when the portfolio return also includes economic gains over time.

## Refresh policy

`scripts/update-benchmarks.mjs` fetches the latest rolling 24 calendar months from the official TWSE monthly history endpoint.

The current month is allowed to contain zero rows before its first trading observation exists. A missing historical month is not silently accepted.

The updater refuses to publish a suspiciously small rolling series.

The generated cache is:

`public/data/tw-benchmarks.json`

Every data point retains its official trading date and index value. Cache metadata includes source, generation time and latest data date.

## Comparison window

PortfolioPilot chooses the portfolio return source in this order:

1. Exact TWR, when its covered interval is valid.
2. Modified Dietz TWR Proxy, when Exact TWR is unavailable and at least two daily net-worth snapshots define a proxy interval.

For the selected portfolio interval, the benchmark uses:

- the first official benchmark trading date on or after the portfolio start date;
- the last official benchmark trading date on or before the portfolio end date.

The UI always shows the actual benchmark dates.

If the benchmark does not contain at least two official observations inside the target interval, the comparison is data-insufficient.

## No fake alpha

PortfolioPilot V0.13 does **not** automatically subtract benchmark return from portfolio return and call the result alpha or excess return.

Even when calendar dates match, an Exact TWR boundary may represent an intraday point while the index value is an end-of-day observation. That is not the same valuation timestamp.

The UI therefore shows the two returns side by side, describes whether calendar dates are exact or trading-day-contained, and explicitly avoids an unsupported alpha claim.

## Benchmark suitability

TAIEX Total Return is a Taiwan-equity benchmark. It may be a poor strategic benchmark for a portfolio dominated by U.S. equities, cash, or other asset classes.

PortfolioPilot treats benchmark comparison as descriptive context, not as a recommendation about which benchmark the owner should use.

## Nasdaq-100 Total Return

Nasdaq identifies XNDX as the Nasdaq-100 Total Return Index and makes historical values viewable/downloadable through Global Index Watch.

Nasdaq also documents its programmatic GIW Web Services as credentialed services. PortfolioPilot therefore does not call an undocumented/private Nasdaq endpoint to automate XNDX.

A future local import path can accept a user-downloaded official XNDX history while preserving source/date provenance, without requiring a paid API or scraping a private service.
