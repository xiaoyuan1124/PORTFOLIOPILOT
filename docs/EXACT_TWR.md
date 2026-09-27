# Exact TWR Event Boundaries

PortfolioPilot V0.12 adds the data needed for a true time-weighted return over a covered interval.

## Why the old TWR remains a Proxy

Daily net-worth snapshots do not identify the portfolio value immediately before every deposit or withdrawal. Modified Dietz can estimate the effect of those cash flows, but it is still an approximation.

PortfolioPilot therefore keeps the existing label:

`TWR Proxy · Modified Dietz`

It is never renamed to exact TWR.

## Exact boundary input

For every external cash flow:

- type must be deposit or withdrawal;
- record the cash-flow date;
- optionally record an HH:MM time;
- record `preFlowValueTwd`: the total portfolio net value immediately **before** the external cash flow.

The boundary value is in TWD. For a USD cash flow, the flow itself is converted with that activity's stored USD/TWD rate.

Buy, sell, dividend and fee entries are internal portfolio events and do not create TWR cash-flow boundaries.

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

PortfolioPilot JSON backup format is V3 for new exports. V3 can store external-flow time and pre-flow valuation.

Imports remain backward compatible with V1 and V2. Older backups simply have no Exact TWR boundaries until the owner adds them.
