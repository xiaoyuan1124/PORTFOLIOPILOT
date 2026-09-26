# Performance Methodology

PortfolioPilot is currently a zero-cost, local-first personal portfolio tracker. The performance layer prioritizes transparent assumptions over false precision.

## Activity types

The local ledger supports:

- deposit
- withdrawal
- buy
- sell
- dividend
- fee

Only **deposit** and **withdrawal** are treated as external portfolio cash flows.

Buy, sell, dividend, and fee entries are recorded for history and analysis, but they do not alter the external-flow series used by XIRR.

## XIRR

XIRR is a money-weighted annualized return.

PortfolioPilot treats:

- deposit = negative investor cash flow
- withdrawal = positive investor cash flow
- current portfolio value on the valuation date = positive terminal cash flow

The solver uses dated cash flows, a 365-day year convention, a broad rate bracket, and bisection after finding a sign change.

If there is no valid positive/negative cash-flow pair, or no root can be bracketed, PortfolioPilot shows **資料不足** rather than inventing a result.

## TWR Proxy

Exact time-weighted return requires portfolio valuation immediately before/after external cash flows.

The current free/local build only stores daily net-worth snapshots, so it cannot honestly claim exact TWR when an external cash flow happens between two snapshots.

PortfolioPilot therefore shows a **TWR Proxy** based on chained Modified Dietz returns.

For an external cash flow without time-of-day data, the calculation uses a mid-day timing assumption within the relevant snapshot interval.

This is intentionally labelled as an approximation.

## Why not infer performance from average cost

Average-cost unrealized gain is useful for current holdings, but it is not a portfolio-level return measure when deposits, withdrawals, dividends, sales, and changing position sizes exist.

That is why the product separates:

1. unrealized gain;
2. external cash flow;
3. XIRR;
4. TWR proxy.

## Future path to exact TWR

Exact TWR can be added later without a paid service by recording event-boundary valuations locally:

1. portfolio value immediately before an external flow;
2. the external flow itself;
3. portfolio value immediately after the flow;
4. chain each sub-period return.

Until that exists, the UI must continue to label the current result as a proxy.
