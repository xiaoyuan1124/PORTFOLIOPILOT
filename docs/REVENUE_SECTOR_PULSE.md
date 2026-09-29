# Official Revenue Sector Pulse

Date: 2026-09-29

PortfolioPilot derives a sector-level **revenue pulse** from the same official TWSE / TPEx monthly-revenue cache already used by company research.

It is intentionally **not** called a price-strength, momentum, ranking, or buy/sell signal.

## Data source

The view reads `public/data/tw-revenue.json`, which is built from official TWSE / TPEx monthly-revenue sources and already carries source URLs and fetch timestamps.

No paid industry-index dataset, brokerage feed, AI model, or third-party scoring API is introduced.

## Period rule

Only rows from the latest available revenue period are used.

Older periods may remain in tests or future caches, but they never mix into the current cross-sectional sector statistics.

## Industry rule

Rows are grouped by the official industry string present in the revenue cache.

Generic buckets are excluded:

- empty industry
- 未分類
- 其他
- 其它

This avoids presenting a mixed catch-all bucket as a meaningful sector signal.

## Minimum sample

A sector is shown only when at least **5 companies have non-null YoY values** in the latest period.

This is a product trust boundary rather than a statistical claim that five observations are sufficient for every analytical purpose.

## Metrics

For each displayed industry:

- company count
- companies with usable YoY
- median revenue YoY
- share of usable companies with YoY > 0
- share of usable companies with YoY > 20%
- median MoM when available
- TWSE / TPEx row counts

Median is used instead of the average so a single extreme company has less influence on the sector-level summary.

## Ordering

Rows are sorted by median YoY descending, then positive-YoY breadth descending.

This is a numeric display order only. The UI explicitly says it is not an investment ranking.

## Holdings filter

The optional "只看持股相關族群" filter maps the user's held Taiwan stock codes to the latest official revenue rows and keeps the associated industries.

Portfolio data remains local. No holding list is sent to an external service.

## Limitations

Revenue growth is only one company/industry dimension. It does not represent:

- stock-price momentum
- valuation
- profitability
- earnings quality
- future returns
- investment suitability

PortfolioPilot keeps those distinctions explicit instead of collapsing them into one opaque score.
