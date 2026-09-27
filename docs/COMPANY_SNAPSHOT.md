# Company Snapshot

PortfolioPilot V0.15 adds a single-company research surface built only from official caches that already passed their own trust boundaries.

## What it combines

- TWSE / TPEx official closing price
- TWSE / TPEx official P/E, P/B and dividend yield
- TWSE / TPEx official latest monthly revenue
- MOPS official three-month revenue history
- MOPS official derived single-quarter gross margins for applicable statement families
- TWSE / TPEx official 10-trading-day foreign and investment-trust flows
- the existing four-gate Official Scanner result

## Join rule

Data is joined by `market + stock code`, not by stock code alone. This prevents a same-code record from one market from being attached to a different market record.

The latest monthly-revenue company universe is the primary company list. Missing valuation, quote, institutional or quarterly data stays missing and is not imputed.

## Display rules

Each section retains its own source and data period. PortfolioPilot does not pretend that monthly revenue, quarterly financial statements, daily valuation ratios and ten-day institutional flows are synchronized to one accounting date.

Monthly revenue amounts are shown as the official raw value without guessing or silently changing the unit. Missing official valuation fields remain `—`. Financial and insurance statement families that do not support the general-industry gross-margin formula remain `not applicable`.

The four-gate Scanner is descriptive. The Company Snapshot does not turn its status into a buy/sell signal or an overall investment score.
