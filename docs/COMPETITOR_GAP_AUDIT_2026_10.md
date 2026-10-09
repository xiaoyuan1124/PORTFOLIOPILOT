# Competitive feature audit — October 2026

Scope: PortfolioPilot PWA (Taiwan + US investments), **zero additional cost, local-first, no paid API, no cloud portfolio data, no automatic trading**. This is a feature audit, **not** a verified market-share/customer-growth ranking. Official product/pricing pages were consulted on 2026-10-09; prices/features can change.

| Competitor | Verified public positioning / offer | User benefit | PortfolioPilot response |
| --- | --- | --- | --- |
| Rebal (Taiwan iOS) | Free basic tracking and rebalancing; Premium NT$60/month, NT$590/year, NT$1,490 lifetime; planned contribution and withdrawal-based allocation, CSV/OCR and pledge features | Practical monthly add-money guidance for Taiwan investors | **Implement local-only new-money planner now**; no OCR/service-data dependency. [App Store](https://apps.apple.com/tw/app/id6759631692) |
| Sharesight | Free limited to 1 portfolio and 10 holdings; Starter from US$7/month annual, advanced reporting in higher tiers | Trusted tax and performance reporting, benchmarks and exposure | Keep source-verified reports, TWR exact vs proxy disclosure, and multi-account view; prioritize report clarity and export. [Pricing](https://www.sharesight.com/pricing/) |
| Snowball Analytics | Free 1 portfolio/10 holdings; offers dividend calendar, broker import, limited rebalancing; paid advanced rebalancing/notifications | Planning + dividends + routine follow-up | Build local planning and annualized cashflow tools with explicit date availability. [Pricing](https://snowball-analytics.com/pricing) |
| Stock Events | Free max 15 stocks; Pro US$49.99/year for portfolio analytics, extended charts and advanced dividends | Fast watchlist and dividend tracking | Improve quick-entry and mobile drilldown, not social/AI APIs. [Pricing](https://stockevents.app/en/pricing) |
| Capitally | Paid product, 14-day trial, no permanently free tier; customizable CSV imports, undo and audit history, FX attribution | Data corrections without fear; cross-currency explanation | **Next priority: import preview + recoverable local undo**, then FX gain decomposition when transaction-date FX is trustworthy. [Features](https://www.mycapitally.com/features/all-investments-in-one-place), [Plans](https://www.mycapitally.com/pricing) |
| getquin | Free portfolio tracking; Premium includes benchmarking, dividends forecast, advanced TTWROR | Attractive overview and benchmarking | Improve compact mobile KPI and audit labels; avoid unsupported dividend forecasts. [Tracker](https://www.getquin.com/portfolio-tracker/) |
| Portfolio Performance | Free/open source desktop, TWR/IRR, rebalance against target allocation, local file | Deep functionality with no subscription | Differentiate via iPhone-first responsive workflows + Taiwan official sources. [Website](https://www.portfolio-performance.info/en/) |
| CMoney 股市爆料同學會 | Taiwan stock community with self-selected symbols, real-time quotes, institutional indicators and discussions; commercial app with ads/purchases | News/community and market attention | Do **not** imitate forums or promise real-time licensed prices. Emphasize private, evidence-based official-data research. [Google Play](https://play.google.com/store/apps/details?id=com.cmoney.forum) |

## Repository baseline before this slice

Already implemented (confirmed from code):
- TWSE/TPEx/MOPS official-research scanners, price/date provenance, revenue, material events, benchmark comparison.
- Multi-account holdings, ETF official compositions, historical change tracker, cross-ETF company look-through, partial unresolved-weight disclosure.
- XIRR, exact TWR when sufficient boundary data, otherwise labeled Modified Dietz proxy; dividends, transaction ledger, import/export and local JSON backup.
- AllocationTargets sets and displays target weights but explicitly has **no** action-oriented contribution calculator.

## Ranked implementation backlog (incremental, no redesign)

| Priority | Feature | Zero-cost execution / acceptance |
| --- | --- | --- |
| P0 now | Monthly contribution-only planner | Local TWD contribution input → per-target deficit, whole-unit buy estimate, cash reserve and unallocated remainder. No trades, no invented unheld-symbol price, no fee/FX guarantees. |
| P0 next | Broker CSV import preview + local undo checkpoint | Preview duplicates/invalid rows and net cash/holding impact **before** applying; optional one-step rollback with confirmation, test for aborted/duplicate imports. No OCR needed. |
| P1 | Account and month saved report filters | Same data can be explored by account and time range; export rows to CSV without cloud backend. |
| P1 | Currency gain vs security gain | Only when transaction-date FX information is complete; otherwise display “insufficient” instead of fabricated attribution. |
| P1 | Historical target drift and allocation scenarios | Read-only what-if scenarios using local data, explicit snapshot and pricing boundaries. |
| P1 | Accessibility/visual regression | Preserve mobile Chromium smoke across 375/390/430 portrait and short touch landscape, keyboard focus and dark mode; iPhone hardware signoff remains separate. |
| P2 / defer | Broker auto-sync, paid real-time data, OCR cloud recognition, online multi-device state sync | Incompatible with current zero-cost/credential/privacy goals, licensing uncertain, or requires external services. |

## Definition of competitive win

Do not claim to have “beaten” proprietary trackers in user count or market performance without evidence. The attainable goal is **more usable zero-cost decision support for Taiwan-first long-term ETF investors**: credible issuer provenance, explainable incomplete data, private cross-ETF risk aggregation, and a clear monthly-contribution workflow. Never turn a simulation into investment advice or a trading automation.

Current feature work: [PortfolioPilot PR #150](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/pull/150).
