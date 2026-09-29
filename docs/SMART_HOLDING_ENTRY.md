# Smart Holding Entry

PortfolioPilot V0.18 reduces manual input for Taiwan holdings without inventing personal transaction data.

## Supported automatic fields

For a new Taiwan holding, the user may type either the security code or the security name.

PortfolioPilot searches the repository-cached official Taiwan datasets and, after an exact match or explicit candidate selection, fills:

- security code
- security display name
- market = Taiwan
- asset type when it can be derived safely from current data rules
- currency = TWD
- latest official closing price
- price source (TWSE or TPEx)
- price date
- industry when official company revenue metadata is available
- ETF category fallback for 00-series quote-only products

Partial text shows candidates instead of silently choosing a security.

## Data sources

- TWSE / TPEx official closing-price cache: `public/data/tw-quotes.json`
- TWSE / TPEx official monthly-revenue cache: `public/data/tw-revenue.json`

No paid API, cloud account, brokerage credential or AI service is required.

## Personal fields that are not fabricated

Two values cannot be learned from a public exchange dataset:

- quantity held
- actual average acquisition cost

Quantity remains user-entered.

Average cost also remains a personal input. PortfolioPilot deliberately does not replace it with the current market price because doing so would turn a convenience feature into false unrealized P/L data.

The account field continues to default to the app's existing default account and can be changed by the user.

## Matching behavior

- exact code: auto-apply when exactly one catalog entry matches
- exact name: auto-apply when exactly one catalog entry matches
- partial code or name: show up to six ranked candidates
- no match / cache unavailable: keep manual entry available
- US holdings: remain manual in V0.18 because the app does not yet maintain an equivalent free official US security-master cache

## Trust boundary

The feature only auto-fills fields supported by the cached official datasets or deterministic product classification rules. It does not infer purchase history, account ownership, transaction dates, brokerage data, or investment recommendations.
