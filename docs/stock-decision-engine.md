# Stock Decision Engine — research v1
Entry: 研究 → 標的 → 標的總覽 → 買進評估.
Read-only, no orders, no personal data uploaded. Uses existing TWSE/TPEx raw daily closing cache, MOPS three-month revenue and quarterly gross margins, same-day sector PE, ten-day institutional flows and TWSE price benchmark. Optional actual six-symbol OHLCV is never synthesized. Missing or stale data blocks full assessment. The weighted score is an experimental rank of currently implemented proxies, not a probability of gain. Gross margin alone does not establish financial quality. Peer PE is not fair value. Prices are not adjusted. No full strategy has been validated historically; use existing PilotQuant for separate price-only research.
Risk calculator uses hypothetical stop and target entered by user, cost/fee/slippage assumptions, and cash/risk budgets. It does not guarantee execution.
Remaining work: licensed all-market OHLCV and corporate actions, complete point-in-time financial statements, historical valuation/flow data, liquidity, TWSE/TPEx separate benchmarks and market breadth, margin financing, independently verified walk-forward backtest including delisted securities, commercial data and regulatory review. Do not market as advisory or validated trading signals.

## v1.2 data migration
Existing daily market-wide fetches now retain explicit validated OHLCV tuples in optional candle arrays alongside legacy close points. Bounded 45 calendar-day migration on universe version change, incremental accumulation thereafter. No per-symbol calls or guessed volumes. Existing close-only clients remain compatible. Full historical depth and live endpoint coverage must be verified after data refresh. KD requires 21 contiguous true bars. No claim of completed long-history backfill.

## v1.3 navigation and risk
Scanner candidates link to the existing security detail assessment. Watchlist additions reuse the same local state transaction and deduplication. Show separate company and timing proxy scores only when component data is present. Extreme unadjusted moves are flagged; they are not identified as corporate actions automatically. Quote freshness also gates sizing.

## Validation
Mobile layout smoke now explicitly selects 2330, waits for the decision result, toggles horizon, opens technical and sizing disclosures, and checks narrow-screen geometry. Data index reports actual candle counts separately from close counts; migration success is not inferred from a close-only row count.

## v1.4 no incremental service cost
The existing MOPS income statement fetch now preserves explicit optional operating income, total net income and cumulative basic EPS columns. Quarterly additive amounts are derived only with both cumulative observations; EPS is never differenced. Negative operating/net income blocks a positive research condition. Optional fields remain absent in old caches. A local price-only event study uses fixed rules, next-session close, nonoverlapping fixed holding periods, proportional costs and aligned index dates. It does not replay current fundamental data or claim a full point-in-time backtest. No new packages, external services, credentials, scheduled workflows or runners were added. Account billing limits remain the owner's control. Full cash flow, balance sheet, corporate actions, point-in-time multi-factor testing remain outstanding.
