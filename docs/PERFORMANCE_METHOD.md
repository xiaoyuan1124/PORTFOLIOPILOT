# Performance Methodology

PortfolioPilot is a zero-cost, local-first personal portfolio tracker. The performance layer prioritizes transparent accounting boundaries over false precision.

## Activity classification

The ledger currently supports:

- deposit
- withdrawal
- buy
- sell
- dividend
- fee
- transfer
- fx_conversion
- corporate_action

Only **deposit** and **withdrawal** are external portfolio cash flows.

Buy, sell, dividends, fees, same-currency internal transfers, TWD/USD internal FX conversion and non-cash corporate actions are internal portfolio events. They may change holdings, cash, costs or net worth, but they are not new investor capital entering or leaving the portfolio.

## XIRR

XIRR is a money-weighted annualized return.

PortfolioPilot treats:

- deposit = negative investor cash flow
- withdrawal = positive investor cash flow
- current portfolio value on the valuation date = positive terminal cash flow

The solver uses dated cash flows, a 365-day year convention, a broad rate bracket, and bisection after finding a sign change.

If there is no valid positive/negative cash-flow pair, or no root can be bracketed, PortfolioPilot shows **資料不足** instead of inventing a result.

## Exact TWR

Exact TWR is available only when every deposit / withdrawal inside the covered period has a valid pre-flow portfolio valuation boundary.

For a same-day external cash flow recorded at the time it happens, PortfolioPilot can capture the whole local portfolio value immediately before the cash mutation. Historical backfill must use a manually confirmed historical pre-flow valuation; current value is never substituted for a past boundary.

If multiple external flows occur on the same date, each must have a distinct event time so the boundaries can be ordered. Missing or ambiguous boundaries make Exact TWR **資料不足**.

Internal buys, sells, dividends, fees, transfers and FX conversions do not create TWR boundaries.

## Modified Dietz TWR Proxy

Daily snapshots remain useful when historical event-boundary valuations are incomplete.

PortfolioPilot therefore keeps a chained Modified Dietz **TWR Proxy** using daily net-worth snapshots and external cash flows. It is explicitly labelled as an approximation and never presented as Exact TWR.

## Cost and income transparency

The performance page separates accounting components instead of hiding them inside one vague total:

- dividend income
- standalone fee activities
- managed-trade fees
- managed-trade taxes / other transaction taxes
- internal FX conversion valuation delta at the valuation USD/TWD saved with the event

`股息－獨立費用` means exactly dividends minus standalone `fee` activities. It does **not** claim to include trade fees or taxes.

Managed-trade fees and taxes are already reflected in cash movement, average cost and realized P/L. FX conversion execution differences are already reflected by the two actual cash balances. These breakdown metrics are descriptive transparency only; PortfolioPilot does not subtract them from XIRR or TWR a second time.

The FX conversion valuation delta is:

- destination cash valued at the event's saved valuation USD/TWD
- minus source cash valued at the same saved valuation USD/TWD

A negative value can reflect execution spread, fees or a worse execution rate relative to the saved valuation rate. PortfolioPilot does not guess which component caused it.

## Why average-cost gain is not portfolio return

Average-cost unrealized gain is useful for current positions, but it is not a portfolio-level return measure when deposits, withdrawals, dividends, sales, transaction costs, FX conversion and changing position sizes exist.

PortfolioPilot therefore keeps these concepts separate:

1. current unrealized gain
2. external cash flow
3. income and cost breakdown
4. XIRR
5. Exact TWR when event boundaries are complete
6. Modified Dietz TWR Proxy when only daily history is available

## Trust boundary

PortfolioPilot does not reconstruct missing historical holdings, cash balances, FX rates, transaction fees or TWR boundaries from guesses. Missing data remains incomplete, and current-state mutations are forward-only unless a dedicated ledger-only historical path exists.
