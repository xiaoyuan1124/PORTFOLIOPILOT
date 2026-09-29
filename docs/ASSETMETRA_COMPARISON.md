# AssetMetra Comparison — PortfolioPilot

Date: 2026-09-29

This document records product ideas observed from AssetMetra's public website and demo metadata, and how PortfolioPilot adapts them without copying proprietary implementation.

## Positive patterns adopted

- **Net-worth first dashboard:** PortfolioPilot home now prioritizes total net worth and real local snapshots.
- **Time-horizon switching:** 1M / 3M / YTD / 1Y / ALL snapshot ranges were added.
- **Cash / funding visibility:** cash value and cash percentage are now first-class dashboard metrics.
- **Multiple accounts:** holdings and cash-flow records can carry an account name; views and CSV workflows preserve it.
- **Holdings-focused research:** Company Snapshot joins official close, valuation, revenue, quarterly margin, institutional flow and Scanner state.
- **One-place decision cockpit:** account allocation, sector allocation, top positions, freshness and research shortcuts are visible from home.
- **Low bookkeeping burden:** users may maintain current holdings without reconstructing every trade; exact-performance flows remain optional and explicit.
- **Fast navigation:** global search can jump to navigation destinations or directly to a Taiwan company snapshot.
- **Demo transparency:** a new install is empty. Demo data is opt-in and persistently labeled as DEMO.
- **No brokerage credentials:** PortfolioPilot remains local-first and never asks for brokerage passwords.

## Patterns intentionally not copied

- **Mandatory cloud / Google sign-in:** useful for cross-device sync, but adds account, backend and privacy dependencies. PortfolioPilot keeps user-owned local data and explicit JSON backup.
- **Attention-heavy market surfaces by default:** material news and sector momentum can be useful, but should not displace the user's own portfolio. They may be added only from validated official/free sources and with clear dates.
- **Dashboard density without progressive disclosure:** mobile screens should expose a short daily-check path first, while deeper risk/performance/research remains one tap away.
- **Implying net-worth change equals investment return:** deposits and withdrawals can move net worth. PortfolioPilot labels snapshot movement separately from XIRR / Exact TWR.

## Trust boundaries

1. Personal holdings, costs, accounts and FX are user-owned local data.
2. Taiwan research inputs must preserve official source and data date.
3. Missing research values remain missing; no guessed values.
4. Scanner outputs describe rule states, not buy/sell recommendations.
5. Demo content is opt-in and visually labeled.
