# Taiwan Market Data — Zero-Cost Cache

PortfolioPilot V0.5 uses a repository-owned static cache for Taiwan closing prices.

## Why a cache instead of browser-to-exchange requests

The website is a static PWA on GitHub Pages. Fetching the exchanges directly from every browser would make the UI depend on runtime CORS behavior and upstream availability.

Instead, GitHub Actions fetches the official sources once, normalizes the fields, and writes one static file:

`public/data/tw-quotes.json`

The browser only reads that local file.

## Official sources

Listed market:

`https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`

Fields currently used:

- `Code`
- `Name`
- `ClosingPrice`
- `Date`

OTC market:

`https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes`

Fields currently used:

- `SecuritiesCompanyCode`
- `CompanyName`
- `Close`
- `Date`

The updater intentionally stores only the minimum fields PortfolioPilot needs.

## Refresh workflow

`.github/workflows/market-data.yml`

runs:

- weekdays at 18:30 Asia/Taipei equivalent (10:30 UTC);
- manually through `workflow_dispatch`.

If the normalized cache changes, the workflow commits the new JSON to `main`. That normal repository push then triggers the existing Pages deployment.

## Safety checks

The updater:

- requires successful HTTP responses;
- requires array-shaped payloads;
- normalizes commas and missing numeric values;
- normalizes Gregorian and ROC-style dates;
- refuses to publish if the combined quote set is suspiciously small;
- never changes user holdings directly.

The website updates only Taiwan non-cash holdings whose symbol exists in the cache.

## Price provenance

After a successful update, each holding stores:

- `priceSource`: `TWSE` or `TPEx`;
- `priceAsOf`: market date.

Manual prices remain supported and are not mislabeled as official prices.

## Scope

This V0.5 cache is for **closing prices only**.

It does not yet provide:

- intraday quotes;
- US prices;
- corporate actions;
- monthly revenue;
- institutional flows;
- ETF constituent look-through.

Those should be added as separate adapters so the current holdings/accounting logic remains independent from any one data source.
