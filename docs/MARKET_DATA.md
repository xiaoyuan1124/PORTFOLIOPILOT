# Taiwan Market Data — Zero-Cost Cache

PortfolioPilot keeps Taiwan market data in repository-owned static JSON caches so the PWA can stay free, static, and independent from a paid backend.

## Current official adapters

### Closing prices

Listed market:

`https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`

OTC market:

`https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes`

Normalized cache:

`public/data/tw-quotes.json`

The PWA can apply the latest cached close to Taiwan non-cash holdings and stores `priceSource` plus `priceAsOf` on each updated holding.

`.github/workflows/quotes.yml` starts checking the official closing-price sources shortly after the Taiwan market closes: 13:40, 13:50, 14:00, 14:15, 14:30 and 15:00 Asia/Taipei on weekdays, with 17:00, 19:00 and 21:00 fallback attempts for delayed upstream publication. A run that finds no newer official close skips the dependency install/build/deploy steps.

During the 09:00–13:30 weekday market window, the UI explicitly labels cached values as `盤中時段 · 最近收盤 YYYY-MM-DD`; it does not present the previous close as an intraday quote.

### Monthly revenue

Listed market:

`https://openapi.twse.com.tw/v1/opendata/t187ap05_L`

OTC market:

`https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O`

Normalized cache:

`public/data/tw-revenue.json`

PortfolioPilot keeps these fields when available:

- company code / name
- industry
- data period
- current-month revenue
- prior-year same-month revenue
- MoM %
- YoY %
- cumulative revenue
- cumulative YoY %

The UI keeps the official numeric revenue value as-is and does not silently invent a display unit.

## Why a cache instead of browser-to-exchange requests

The site is a static PWA on GitHub Pages. Fetching the exchanges directly from every browser would make the experience depend on runtime CORS behavior and upstream availability.

GitHub Actions fetches the official sources once, normalizes the fields, validates minimum row counts, commits the changed JSON, builds the PWA with those caches, and deploys the refreshed Pages artifact in the same workflow.

## Refresh workflow

`.github/workflows/market-data.yml`

runs:

- weekdays at 18:30 Asia/Taipei equivalent (10:30 UTC);
- manually through `workflow_dispatch`;
- once after market-data updater/workflow code changes land on `main`.

## Safety checks

The updater:

- requires successful HTTP responses;
- requires array-shaped payloads;
- normalizes commas and missing numeric values;
- normalizes Gregorian and ROC-style dates / year-month values;
- refuses to publish suspiciously small quote or revenue sets;
- stores only the minimum fields used by PortfolioPilot;
- never changes browser-local user holdings by itself.

## Scope / limitations

V0.6 provides current cached closing prices and the latest monthly-revenue table.

It does not yet provide:

- intraday quotes;
- US prices;
- three-month historical revenue series;
- quarterly gross margin;
- institutional 10-day flows;
- ETF constituent look-through;
- fully live Scanner results.

The Scanner therefore remains explicitly labelled as a prototype until every rule can be evaluated from official/non-demo data.


## Institutional 10-day cache

PortfolioPilot V0.8 also writes:

`public/data/tw-institutional-10d.json`

It aggregates the latest 10 completed trading sessions from TWSE T86 and TPEx dailyTrade. The cache stores foreign net buying (excluding the foreign-dealer book for consistency) and investment-trust net buying in shares.

See `docs/INSTITUTIONAL_GATE.md` for definitions and fail-closed rules.


## Quarterly gross-margin cache

PortfolioPilot V0.9 also writes:

`public/data/tw-quarterly-margins.json`

The cache is built from the official MOPS historical quarterly comprehensive-income statement endpoint for TWSE-listed and TPEx-listed companies. General-industry rows retain operating revenue, operating cost and gross profit. Q2-Q4 single-quarter values are derived by subtracting the prior same-year cumulative statement before gross margin is calculated.

Companies that MOPS places in statement families without the `營業毛利（毛損）` field are explicitly recorded as not applicable instead of receiving a synthetic gross margin.

See `docs/QUARTERLY_GROSS_MARGIN_GATE.md` for the derivation, source lineage and fail-closed rules.


## Official benchmark cache

PortfolioPilot V0.13 also writes:

`public/data/tw-benchmarks.json`

The first automated benchmark is the official TWSE TAIEX Total Return Index (發行量加權股價報酬指數), fetched from the monthly MFI94U history endpoint. The cache stores the official trading date and total-return index value for the rolling history window.

The benchmark updater is fail-closed for missing historical months and suspiciously small datasets. The current month alone may be temporarily empty before its first available trading observation.

See `docs/BENCHMARK.md` for date-alignment and comparison rules.
