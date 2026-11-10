# PilotQuant Lab v0.2.0

Zero-cost, mobile-first, local-first research module for PortfolioPilot. Published entrypoint is a self-contained `public/quant-lab/index.html`; a split-file developer copy is also included in this ZIP. The quant lab is **not** a brokerage execution service.

## New in v0.2

- Read PortfolioPilot's existing, GitHub-Pages-hosted TWSE / TPEx close-price history: `../data/tw-price-history/index.json` + market/code-prefix bucket. Strictly checks cache versions, generation metadata, symbol and date validity, and flags missing-market dates.
- NO invented `open`, `high` or `low` for official close-only data or close-only CSV imports. When closes are the only available information, backtest uses the following session's **closing price** as a simplified fill proxy; signals come from the previous close, close-channel breakout instead of intraday Donchian, and close-confirmed stop/take (executed the next close). It does not claim actual fill availability or intraday protection.
- Time-ordered 70/30 holdout results for any symbol with >= 120 daily observations. Indicators use historical data up to the signal date; capital/positions reset when the holdout begins. **Not** full expanding or rolling walk-forward, and the test period is no longer untouched if repeatedly used for tuning.
- Multi-symbol comparison for up to 50 imported/loaded symbols based on the same configuration. Ranked by holdout simulated return only; not intended as a live predictive screening model.
- Extended JSON report includes execution mode and verified source metadata; separate OHLCV/open-fills still work as in v0.1.

## Running

- **Standalone**: open `PilotQuant-Standalone.html` from the ZIP to use demo/CSV features. File-based navigation cannot fetch hosted cache files.
- **PortfolioPilot**: the published `public/quant-lab/index.html` expects history files from the same site's `public/data/tw-price-history/` and can access them on GitHub Pages after merge/deploy.
- **Local dev**: `python3 -m http.server 8080 --directory public` then visit `http://localhost:8080/quant-lab/`; when all PortfolioPilot cache files are present the official importer works.

## Tests

```sh
node --test tests/*.test.js
```

19/19 engine tests passed locally. Mobile and desktop screenshots were rendered with Chromium; UI automation verified demo, holdout, scanner, CSV import, and the cache fetch flow with **a mocked official-cache API response**. Live official-data browser import was not exercised in that browser environment due network/navigation restrictions. All tests were performed as of 2026-11-10.

## Risks / exclusions

1. TWSE/TPEx cached historical **closing prices are not dividend/split-adjusted**; raw price signals can be materially misleading through corporate actions.
2. Costs, min fees and sell tax are user-configured; no claim that a user's broker rate exactly matches defaults. Fill prices are hypothetical and liquidity is not modeled.
3. No dealer-level order/settlement simulation, shorting, borrowing, levered instruments, real-time feeds, intraday trading, broker integration or automatic purchases.
4. Results are not real money performance; reported benchmark is a cost-free normalized buy-and-hold price comparison, not matched performance. No predictive or verified alpha claim.
5. CSV research data is not uploaded to a cloud service, and is cleared on page reload; only strategy settings are stored locally. The optional official cache feature performs read-only same-origin HTTP GET requests.
6. Official cache depends on the existing PortfolioPilot price-history workflow, and can be stale or partial. The UI shows its date and failed date count.

## Integration & licensing

Keep the v0.2 PR as draft until GitHub CI and real-device checks are verified. MIT; local-first; no paid APIs, Supabase or brokerage credentials.
## GitHub pull request

See [PilotQuant Lab PR #185](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/pull/185) (draft until quality and device checks). This is an isolated web module, not a production iOS tab.


## PortfolioPilot-native integration (v0.3 work, PR #185)

- Entry point: main app **策略 → PilotQuant 量化研究**, or **研究 → 個股總覽 → 使用 PilotQuant 回測該股**. Research watch-zone cards also deep-link the active ticker. No new top-level bottom-nav button (avoids iPhone nav crowding).
- Native React component: `src/components/quant-research-panel.tsx`. Pure math and deterministic simulation: `src/lib/quant-research.ts`; Vitest regression checks: `src/lib/quant-research.test.ts`.
- Official TWSE/TPEx public history buckets are loaded through the already-supported `src/lib/price-history-data.ts`. Generation mismatch and known failed dates block backtests; cache dates, venue and origin are displayed. Data has raw closing price only; these results are not dividend-adjusted total returns.
- Three long-only strategies: moving-average crossover, RSI threshold, closing-price channel breakout. Decisions use close[t] and never fill before close[t+1]. Fees and slippage are charged for each side; Taiwan sell tax is charged on simulated sale. 70/30 date-ordered holdout uses independent starting capital and warmed indicators (single holdout, not full walk-forward).
- Benchmarks: a fee-matched buy-and-hold comparison for each simulator period; separately, the official TWSE TAIEX **price** index is compared against the stock's **raw price** change only when both date endpoints are exact. This is not an Alpha estimate.
- Growth scenarios use a **fixed-seed five-day block bootstrap** of the latest <=252 observed daily log returns. 700 paths for 21/63/126/252 trading days yield P10/P50/P90 quantiles; these are **not calibrated confidence bands, target prices, probabilities of profit, or advice**. Extreme raw price jumps >30% in a day suspend projections until potential corporate actions are resolved.
- The enhanced native UI does not expose account credentials, place or recommend orders, or send trading history to a server. Advanced CSV/multi-stock analysis remains the static local workbench `/quant-lab/`.

### Verification

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run native:build`; GitHub Actions runs these on PRs, plus legacy PilotQuant static-smoke tests. Require CI green and physical iPhone verification before publishing.

### Known limitations

- Unadjusted prices: dividends/splits, ETF distributions, delisting survivorship and corporate events are not reconstructed. *Do not* equate price-only returns with actual account profits.
- Projected scenarios extrapolate the historical returns' statistical structure only; no forecast of sales growth, margin, macroeconomics, interest rates, valuation multiples or future news. Path quantiles do not guarantee actual future prices.
- End-of-day fill is a conservative **next-close proxy**, not a promise that an actual intraday order will be executed at that price. No intraday stop/target is simulated.
- User-entered stock selection/strategy options are view-local; existing portfolio holdings and Strategy Lab watch-zone state are not modified.
