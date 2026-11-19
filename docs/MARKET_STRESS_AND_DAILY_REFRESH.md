# Market stress and daily market-data refresh

## Navigation
- Home: compact **市場壓力 · 台股** card below market data status. Tapping opens research.
- Research > 市場 > **市場風險**: score, three factors, dated historical trend, methodology and provenance.
- Five bottom navigation tabs remain unchanged.

## Model scope and correctness
This is **PortfolioPilot's independently calculated market stress proxy**, not the ToAlpha score.
The original analysis reference is https://toalpha.tw/market/fear.

Source: verified TWSE TAIEX **price** index, not a return index or intraday quote. Three equally weighted, historical percentile components:
1. 20-trading-day realized annualized log-return standard deviation (sqrt(252)).
2. Percent below highest closing price in the trailing 252 trading days.
3. Negative 20-trading-day percentage price return.

A factor's percentile compares the observation to valid historical values in the loaded official index series; ties receive midrank. The score is 0–100, rounded. The dataset must have **at least 332 official observations** for any score, and sample length and as-of date are disclosed. The historical plotted scores share the loaded sample's percentile reference and must not be interpreted as a point-in-time backtest. The 0–100 labels are descriptive ranges and not calibrated probabilities.

Not included: 52-week new lows across the full stock universe, limit-down share, proportion above 200-day MA, margin maintenance, futures VIX, US and semiconductor indices. They require separate licensed and historically verified datasets; do not present these proxies as ToAlpha parity.

## Background market refresh, no app launch required
GitHub Actions pipelines fetch and commit public verified source data:
- `quotes.yml`: several attempts after Taiwan close.
- `benchmark-daily.yml`: TWSE index after Taiwan close at 16:30 and again 20:30 (Taipei).
- `price-history.yml`: incremental catchup at 16:47 / 19:47 / 23:47 / 01:47 (Taipei).
- `market-data.yml`: independent revenue, ETF, institutional, quarterly and benchmark updates.

Date coverage is **per dataset**, not automatically identical. Delayed exchange reporting, GitHub scheduler delays, rate limits, failures and weekends can cause differences. No fake dates, prices or scores are created. The market status card shows per-source as-of dates and warns when sources lag behind the newest verified closing quote.

On iOS, the app's static assets alone would never update after TestFlight installation. `fetchMarketDataset` now prefers the public GitHub raw-file endpoint (main branch), then GitHub Pages, falling back to the bundled copy while offline. This transports **public market datasets only**; local user holdings and transaction data are not uploaded.

When the app resumes, market status and research re-read current public datasets. Network-dependent data cannot be displayed on the phone until the phone connects. In all cases official timestamps describe the source, not the time the view was opened.

## Portfolio NAV limitation
A personal NAV snapshot depends on local holdings, transaction history, historical securities prices and FX. While a local-first app is closed, public market data can be collected in GitHub but cannot safely recalculate **private** portfolio NAV on a server that never sees the holdings. iOS background execution is also not guaranteed daily.

The home NAV chart uses real calendar dates, skips unrecorded weekends, and leaves missing trading-day values as `null` rather than silently connecting invented daily values. It does not claim that local snapshots exist on days when the app was never open. Exact retrospective NAV would require historically validated positions, asset quotes and FX for each trading date, or opt-in secure synchronization of private data.

## Cost and release checks
All automation uses GitHub-maintained Actions on standard runners; the public repository, GitHub Pages and their quotas/terms must remain eligible. Check CI, mobile layout smoke, history completeness and a TestFlight device before merging/releasing.
