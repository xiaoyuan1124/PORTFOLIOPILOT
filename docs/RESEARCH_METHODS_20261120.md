# Research methods and trust limits — PortfolioPilot

This change extends the **existing** Company Snapshot, ETF Research, Portfolio Risk and GitHub Actions market-data jobs. It does not add a new bottom-navigation area, broker access, cloud holdings or a paid API.

## A. Official close-only technical research

Source: the existing TWSE/TPEx `tw-price-history` dated **unadjusted daily closing prices**.

- Simple MA(N): arithmetic mean of exactly the latest N recorded valid closes, N ∈ {5,10,20,60,120,240}. Insufficient samples return null.
- RSI(14): Wilder smoothed average gains/losses using 14 changes, not 14 closes. Both average gain and loss equal zero => RSI 50, never 100 by division error.
- MACD: EMA12 − EMA26 (seed each EMA with its initial simple mean); DEA is EMA9 of MACD after nine valid MACD observations; histogram is DIF − DEA. No future close contributes to a historical result.
- MA20 slope is the difference from five observed closes earlier. Highest/lowest last 60 **closing** prices are not intraday highs/lows.
- Any conflicting duplicate date fails closed; invalid prices/dates are rejected.
- The global price-history cache itself does **not** contain OHLC, turnover, minute bars, adjusted prices or split factors. Its close-only panel therefore never generates synthetic candlesticks, volume-ratio or KD. A **separate, pre-existing Strategy Lab TWSE STOCK_DAY OHLCV cache** can supply actual OHLCV for the six issuer-supported listed symbols currently configured (2317, 2382, 2345, 2449, 3711, 3037); that optional panel reuses verified candles, weekly/monthly aggregation, (9,3,3) KD and daily 20-session volume ratio. Unsupported symbols/TPEx show unavailable, not guessed candles.
- Raw price performance excludes dividends and corporate actions. Relative TAIEX price performance must not be mistaken for total return.

### Real OHLCV for the supported TWSE Strategy Lab sample

- Day K: verified daily `[date, open, high, low, close, volumeShares]` from TWSE `STOCK_DAY`; Zod validates high >= open/close and low <= open/close, and volume units are **shares**, not lots.
- Week K: calendar Monday group, first official day's open, highest high, lowest low, last official day's close, sum of verified traded shares.
- Month K: calendar year-month group with the same real OHLCV aggregation; no fill-forward for non-trading dates.
- KD (9,3,3): rolling 9-bar RSV (if high=low, RSV=50), K = 2K_prev/3+RSV/3, D = 2D_prev/3+K/3, initial K=D=50. Only after nine bars.
- Daily volume ratio = latest officially recorded day's traded shares ÷ mean previous 20 recorded sessions' traded shares. Missing required samples => null.
- Any month marked failed by the OHLCV pipeline inhibits KD/volume signals. Source dates and any mismatch against quote cache are shown; this remains a **small curated TWSE symbol universe**, not all equities.

## B. EPS × PE user assumptions

The application does **not** yet have complete official standardized EPS / ROE / cash-flow coverage. Users must manually enter a verified TTM EPS and three scenario assumptions.

For each case:

```
scenario_EPS = user_EPS_TTM × (1 + user_expected_EPS_growth_pct / 100)
scenario_price = scenario_EPS × user_forward_PE_multiple
hypothetical_price_change_pct = (scenario_price / official_reference_close − 1) × 100
margin_of_safety_pct = (1 − official_reference_close / scenario_price) × 100
```

If EPS ≤ 0 or PE ≤ 0, the PE model is invalid. If bear/base/bull prices are not ordered, the tool asks for coherent inputs rather than secretly sorting. Values are *manual what-if sensitivities*, **not** market forecasts, P10/P50/P90, analyst revisions or realized returns. The note is saved as an existing local Journal entry only when the user chooses Save.

## C. Fee-aware read-only rebalance

The existing ETF look-through portfolio exposure engine is reused. Allowed cases: hold; trim; exit; switch to another **already held** security; or buy incrementally from explicitly additional funds.

The user must enter a complete manual cost model (buy and sell commission %, min buy and sell fees in TWD, sell transaction tax %, cross-currency markup %) or leave it fully blank to produce a visibly **gross-only** result.

```
sell_commission = max(min_sell_TWD, sale_reference_value_TWD × sell_commission_pct/100)
sale_net = sale_reference_value_TWD − sell_commission − sale_value×sell_tax_pct/100 − applicable_fx_markup
buy_cash_required(shares) = shares×unit_reference_value_TWD
                          + max(min_buy_TWD, shares×unit_reference_value_TWD×buy_commission_pct/100)
                          + applicable_fx_markup
shares_bought = greatest integer count within available assumed net cash, or 0
```

- Never assume all portfolios must reserve defensive cash. Leftover simulated cash stays explicit.
- All values are hypothetical and read-only; actual holdings, cash balances, ledgers and portfolio TWR/XIRR remain unchanged.
- USD settlement cash from an unswitched US sale remains USD (shown with TWD reference value); cross-currency scenarios use the locally supplied USD/TWD reference and optional manual markup. Broker execution may follow different currency, financing, settlement and minimum-ticket rules.
- Fee assumptions are **not** a claim about published KGI rates, personal negotiated discounts, after-hours fills, multiple split orders or actual taxes. Those require official broker-rule verification and settings.
- Corporate actions, price jumps, suspended stocks and slippage are not modelled.

## D. ETF shared-constituent overlap

For two differing securities keyed by `market:symbol`:

```
confirmed_known_overlap_pct = Σ min(known_weight_A_security, known_weight_B_security)
unknown_A_pct = max(0, 100 − Σ known_weight_A)
unknown_B_pct = max(0, 100 − Σ known_weight_B)
```

This is a **lower bound** of directly confirmed shared holdings, not complete portfolio correlation or actual full overlap when either composition is incomplete. Duplicates, negative weights and >100% total coverage are rejected. Composition as-of dates remain visible and are not assumed synchronized. ETF manager, tracking fee, distribution policy and tax treatment need separate verified issuer data.

## E. Foreign and investment-trust rolling institutional flows

Existing official sources are TWSE `T86` and TPEx `dailyTrade`; each dataset is specific to exchange, code and actual reported date. The existing pipeline already proves ten valid daily reports and publishes 10D aggregates. This extension:

1. Extracts those **already verified** daily rows, merging into a versioned rolling archive of up to 60 distinct actual official sessions. It does not request a paid or unlicensed endpoint.
2. Publishes compact `tw-institutional-rolling.json` for the UI, with raw days archived separately in `tw-institutional-history.json` (public only; no portfolio or account data).
3. Calculates 5D/10D from the latest ten confirmed official reports. For 20D/60D, demands the official TWSE price-index trading-day calendar cover the same last date and **every** required official session be present in the archive. Missing session => null, not carry-forward.
4. Separately requires each company's official day to be recorded; suspensions or missing rows are not silently counted as zero. Distinct listed/OTC same-number securities are not combined.
5. **Important initial rollout:** 20D/60D cannot appear on deployment day without the required real archives. They become available only through later valid daily refreshes and verified date alignment. The short history is truthful, not instant 60-day backfill.

Figures count shares bought minus sold by foreign/investment-trust investors. They are **net trading flows**, *not* holdings inventory, cost basis, deposit money, daily intraday signals or proven smart-money predictions. Proprietary-dealer and 60-day holding-percentage history remains out of scope. No alerts are treated as buy/sell instructions.

## Validation, safety and rollout

`npm run lint`, `npm run typecheck`, `npm test`, `node --test scripts/lib/institutional-rolling.check.mjs`, `npm run build`, `npm run native:build`, iPhone viewport smoke, and unsigned iOS simulator archive must pass on exact feature branch head.

Do **not** merge this stacked PR before its base PR #194 and existing outstanding #191/#193 are reconciled. Scheduled updates only execute on `main` after merge; native iOS installed builds need another signed TestFlight build. Local private user data must not be sent into public cache, and GitHub Actions does not guarantee minute-accurate scheduling.
