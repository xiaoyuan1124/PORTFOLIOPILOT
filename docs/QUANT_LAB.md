# PilotQuant Lab v0.1.0 — Quant Research Module

This module lives at `public/quant-lab/index.html`, is intentionally isolated from existing PortfolioPilot routes, and does **not** require a paid API, broker, Supabase, server or login.

## User entry point
- Locally: open `public/quant-lab/index.html` in a modern browser.
- After this branch merges into `main` and the existing static GitHub Pages workflow completes, the module can be visited at `/quant-lab/` under the project's configured Pages base URL.
- This branch is not deployed by creating the PR. No live URL is claimed until verified.

## Delivered
1. Mobile-first dashboard: total return, max drawdown, Sharpe, closed-trade win rate, profit factor, drawdown chart, synthetic benchmark.
2. Strategy lab: moving-average crossover, RSI mean reversion, Donchian channel breakout.
3. Daily-bar execution simulation: signals generated at close of day t, filled at next day's open; buying/slipping up and selling/slipping down; long-only integer shares.
4. Risk controls: configurable capital, allocation, stop loss, take profit, fees, minimum fees, Taiwan sell-side tax, slippage.
5. CSV data center: validate and import `date,symbol,open,high,low,close,volume` for any number of symbols; close-only accepted but flagged unsuitable for stop/take analysis.
6. Trade audit trail and downloadable CSV + structured JSON result report.
7. Fixed-seed synthetic demonstration data, always labelled simulation; imported data stays in the active browser session.

## Verification
A standalone 11-case engine test suite passed in the isolated development package before submission. Run repository smoke checks with:
```sh
node scripts/check-quant-lab.mjs
```
Interactive browser screenshot verification was not completed in the execution environment because its browser network/file policy blocked local navigation; inspect on a physical phone before merging.

## Backtesting caveats
- Buy-and-hold curve is a no-fee normalized reference, **not** a fee-matched alternative.
- Max drawdown from daily end-of-bar equity omits intraday equity spikes.
- The same candle can touch both exit barriers, and the simulation resolves stop first. Fill price and same-bar order are uncertain without intraday records.
- Strategy calculations assume adjusted history and sufficient bars. No corporate-action reconstruction, historical constituents, borrowing, short sales, FX or margin.
- This is not verified live performance, a recommendation, or an automated trading service.
- The module is completely separate from the existing native iOS app and will not automatically appear in its navigation.

## Subsequent milestones
1. Verified TWSE/TPEx official-history import with provenance and dividend/split adjustments.
2. Walk-forward and out-of-sample testing, parameter stability and sensitivity heat maps.
3. Multi-asset portfolio allocation with FX conversion, settlement dates and broker minimum fees.
4. Offline persistent datasets and opt-in device notifications; **only afterward** consider broker API integration with kill-switch and paper-trading first.
