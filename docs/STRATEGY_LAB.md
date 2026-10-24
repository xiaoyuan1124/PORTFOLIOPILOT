# Strategy Lab V0.92 (experimental)

- A separate **Strategy Lab tab** in the existing app. No new app, repo, backend, or paid API.
- Six editable TWSE watch zones. The historic thresholds are research markers, **not valuations or trading orders**.
- State is part of the existing PortfolioPilot AppState, durable iOS storage and JSON backup; legacy backups without the optional field remain parseable.
- Original Official Scanner, portfolio risk view, and alerts are retained, not replaced.
- Technical calculation: 14-period Wilder RSI; 20-period SMA and EMA; 12/26/9 MACD; Taiwan smoothed KD-K (9-period RSV with initial K=50); today's volume / **preceding** 20 trading-day average volume.
- For the six initially listed TWSE securities, a no-cost GitHub Actions workflow may fetch monthly TWSE STOCK_DAY OHLCV. It runs on a delayed schedule. Until verified rows are committed, the cache intentionally remains empty and the system does not fabricate trading signals.
- Daily close-only cache can support RSI/MACD/SMA/EMA but cannot support KD or volume filters. Missing OHLCV produces **insufficient data** and no Strategy B trigger.
- Data and sources are dated. TWSE OHLCV is unadjusted for dividends and splits. Avoid treating an old signal as current. No intraday streaming, broker login, automatic orders, real-time push or proven strategy win rate.
- **V0.93 / upcoming:** cost-aware historical backtesting with strict next-bar execution, out-of-sample testing, corporate-action adjustment and buy-and-hold comparison. None of these are claimed complete here.
- **V0.94–V0.95 / upcoming:** portfolio-relative position sizing, ETF exposure and cash guardrails; app-open and after-close notification paths with clear limits. iOS TestFlight signing remains a separate release gate.
- For manual OHLCV refresh: run `node --test scripts/lib/strategy-ohlcv.test.mjs` and `node scripts/update-strategy-ohlcv.mjs`, only after reviewing the public TWSE source and accepting its usage policies.
