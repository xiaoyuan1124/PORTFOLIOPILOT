# Portfolio Risk

PortfolioPilot V0.11 adds a local-first portfolio risk view built on the V0.10 ETF look-through engine.

## Inputs

Risk calculations use only:

- current local holdings;
- the user-entered USD/TWD rate;
- locally stored ETF compositions that passed the existing provenance and total-weight validation.

No paid API, AI, broker connection, or inferred ETF constituent is used.

## Company exposure

For each resolved company:

`company exposure = direct holding value + sum(ETF-implied values)`

Company percentages use the **full portfolio value including cash** as the denominator.

This means cash reduces the displayed concentration percentage instead of disappearing from the denominator.

## Sector and market exposure

Sector and market/region exposure are aggregated only from resolved company exposure.

Current market groups are:

- TW → Taiwan
- US → United States

Unresolved ETF value is kept in its own bucket and is **not** assigned to a guessed company, sector, or market.

## Coverage

`invested value = portfolio value - cash`

`risk coverage = resolved company exposure / invested value`

A lower coverage percentage means ETF composition data is incomplete or missing. The UI shows unresolved ETF value separately so concentration metrics are not presented as fully comprehensive when coverage is incomplete.

## Concentration metrics

PortfolioPilot reports:

- largest company as % of full portfolio;
- Top 5 resolved companies as % of full portfolio;
- largest sector as % of full portfolio;
- Top 3 resolved sectors as % of full portfolio;
- resolved-company HHI;
- effective company count.

Resolved-company HHI is:

`HHI = sum((company exposure / resolved company exposure)^2) × 10,000`

The effective company count is:

`10,000 / HHI`

HHI is calculated only across resolved company exposure. Cash and unresolved ETF value are excluded from HHI rather than being mislabeled as companies.

## Interpretation boundary

PortfolioPilot does not assign a buy/sell recommendation, risk grade, or automatic warning threshold from these values.

The view is descriptive: it shows where the portfolio is concentrated and how complete the underlying look-through data is. The owner decides what concentration is acceptable.
