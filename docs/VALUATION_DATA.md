# Official Valuation Data

PortfolioPilot V0.14 adds a read-only valuation research view using official Taiwan exchange snapshots.

## Sources

- TWSE listed stocks: `https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL`
- TPEx OTC stocks: `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis`

The generated cache is `public/data/tw-valuations.json`.

Each row retains stock code, company name, market, exchange data date, P/E, P/B and dividend yield. Each source record retains the official URL, fetch time, latest market date and parsed row count.

## Trust rules

PortfolioPilot does not calculate missing P/E, P/B or dividend yield from guessed values.

Blank or unavailable official fields remain `null`. A zero dividend yield remains zero and is not converted to missing data.

The updater refuses to publish the cache when either exchange returns a suspiciously small parsed universe. This prevents a changed field name or partial endpoint response from silently becoming production data.

## Scope

This is a current official snapshot, not a historical valuation chart.

The UI is descriptive only. It does not label a stock cheap/expensive, does not generate buy/sell signals, and does not rank securities by an overall score.

Exchange valuation methodologies can differ in timing and underlying financial-report periods. PortfolioPilot therefore shows the source and market date rather than presenting the ratios as perfectly synchronized accounting measures.
