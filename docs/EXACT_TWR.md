# Exact TWR Event Boundaries

PortfolioPilot stores event-boundary data for a true time-weighted return over a covered interval.

## Why the old TWR remains a Proxy

Daily net-worth snapshots do not identify the portfolio value immediately before every deposit or withdrawal. Modified Dietz can estimate the effect of those cash flows, but it is still an approximation.

PortfolioPilot therefore keeps the existing label:

`TWR Proxy · Modified Dietz`

It is never renamed to exact TWR.

## Exact boundary input

For every external cash flow:

- type must be deposit or withdrawal;
- record the cash-flow date;
- record `preFlowValueTwd`: the total portfolio net value immediately **before** the external cash flow;
- use an HH:MM time whenever multiple external flows share the same date.

For a same-day event entered when it actually occurs, V0.58+ can capture the pre-flow value from the current PortfolioPilot holdings state immediately before the cash mutation and mark the provenance as `system_current_state`. For a past date, the boundary must be manually confirmed from historical records; the app never substitutes today's net worth for an unknown historical value.

The boundary value is in TWD. For a USD flow, the flow is converted with that activity's saved USD/TWD rate. Same-day automatic capture uses the current saved portfolio FX so the pre-flow valuation, flow conversion and post-flow valuation share one FX basis.

Buy, sell, dividend, fee and internal cash-transfer entries are internal portfolio events and do not create TWR cash-flow boundaries.

V0.60 also separates **historical ledger backfill** from current-cash mutation. A past deposit / withdrawal can be added to the ledger for XIRR / TWR history without changing today's cash holding. Past dividends / fees are likewise ledger-only and never replay into the current balance.

## Sub-period calculation

For a deposit:

`post-flow starting value = pre-flow value + deposit in TWD`

For a withdrawal:

`post-flow starting value = pre-flow value - withdrawal in TWD`

The return from one event to the next is:

`sub-period return = next pre-flow value / previous post-flow value - 1`

The final sub-period ends at the current portfolio value.

All valid sub-period returns are geometrically linked:

`Exact TWR = product(1 + sub-period return) - 1`

No Modified Dietz estimate is inserted into a missing exact boundary.

## Coverage start

If a positive net-worth snapshot exists before the first bounded external cash flow, PortfolioPilot includes the period from that snapshot to the first pre-flow valuation.

If no earlier positive snapshot exists, Exact TWR begins immediately after the first bounded external cash flow. The UI explicitly says that this is an exact return for the covered interval, not the full account history.

## Same-day flows

If more than one deposit/withdrawal occurs on the same date, every such flow must have a distinct HH:MM time. Without a deterministic order, Exact TWR is marked data-insufficient.

## Fail-closed cases

Exact TWR returns data-insufficient when:

- any external flow in the covered history lacks `preFlowValueTwd`;
- same-day external flows cannot be ordered;
- a withdrawal would make the post-flow portfolio value negative;
- a zero post-flow value is followed by a non-zero next valuation;
- a sub-period produces an invalid return.

The existing XIRR and Modified Dietz Proxy remain available independently.

## Backup compatibility

The current PortfolioPilot JSON backup format is V11. It preserves external-flow time, pre-flow valuation, boundary provenance and the newer cash / inventory linkage metadata.

Imports remain backward compatible with V1–V10. Older external-flow records may lack Exact TWR boundaries or boundary provenance; missing data stays missing until the owner adds a confirmed boundary.
