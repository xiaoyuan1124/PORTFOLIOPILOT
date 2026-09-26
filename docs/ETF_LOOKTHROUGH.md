# ETF Look-through

PortfolioPilot V0.10 adds a local-first ETF look-through layer that combines direct stock positions with ETF-implied company exposure.

## Trust model

This version intentionally does **not** guess ETF holdings and does not treat search-engine snippets, old fact sheets, index weights, or top-holdings lists as complete current compositions.

A composition is used only after it has been imported with:

- ETF market and symbol
- ETF name
- data date (`YYYY-MM-DD`)
- source name
- source URL
- component market, symbol and name
- component weight
- sector/category

Imported composition data is stored locally and included in the versioned JSON backup.

The UI labels imported data as an **imported source**. PortfolioPilot does not automatically call it official merely because the URL happens to be an issuer or exchange website.

## Weight handling

PortfolioPilot uses source weights exactly as imported.

- Weight totals may be below 100%.
- Missing weight stays unresolved.
- Weight totals above 100% are rejected.
- Known weights are not normalized to 100%.
- Missing constituents are never extrapolated.

Example: if a source file covers 90% of an ETF, only 90% of that ETF's current market value is distributed to the known constituents. The remaining 10% is displayed as unresolved ETF exposure.

## Exposure calculation

For each directly held stock:

`direct exposure = current holding market value in TWD`

For each ETF constituent:

`implicit exposure = ETF current market value in TWD × component weight`

When the same company is both directly held and present inside one or more ETFs:

`combined company exposure = direct exposure + sum(ETF implicit exposure)`

Portfolio percentage uses the full current portfolio value as the denominator, including cash. This prevents the company-exposure percentages from being overstated by silently excluding cash.

## Current scope

V0.10 performs one-level look-through only. If an ETF contains another ETF, the nested ETF is treated as a constituent and is not recursively decomposed.

Automatic issuer-specific fetchers are intentionally separate future adapters because ETF composition / PCF disclosure formats differ between issuers and markets. The calculation core therefore stays independent of any one provider.

## CSV format

Header:

`etfMarket,etfSymbol,etfName,asOf,sourceName,sourceUrl,componentMarket,componentSymbol,componentName,weightPct,sector`

Use **投資組合 → ETF 穿透 → 空白範本** to download a header-only template. The blank template contains no demo weights, so sample data cannot be mistaken for real holdings.
