# PortfolioPilot

PortfolioPilot is a **zero-cost, local-first, mobile-first investment portfolio PWA** for personal use on phones and desktop browsers.

## Current self-use build

- Decision-cockpit dashboard with net-worth range controls, cash level, account distribution, top positions and data freshness
- Global stock/ETF/navigation search (⌘K / Ctrl+K) with direct official Taiwan security research
- Multi-account holdings and cash-flow tracking with account-aware CSV import/export
- Explicit DEMO mode; new installs start empty so simulated holdings cannot masquerade as personal assets
- Responsive dashboard with desktop sidebar and mobile bottom navigation
- Add/edit/delete TW / US stocks, ETFs and cash
- Smart Taiwan holding entry: type either symbol or name, choose an official TWSE/TPEx match, and auto-fill the paired field, market, asset type, currency, latest close, industry/category and price provenance
- Search and sort holdings, clear filters in one tap, and jump directly from a Taiwan holding card into its official research snapshot
- TWD / USD portfolio valuation
- Per-holding and total unrealized return
- One-tap Taiwan official closing-price refresh with stale-cache protection
- Lightweight TWSE / TPEx quote-only refresh retries after Taiwan market close, with transient network retry/backoff; refreshed quotes are built and deployed to Pages in the same workflow
- Full Taiwan market-data refresh also retries transient official-source network failures
- TWSE listed-stock closes prefer the official date-specific MI_INDEX daily-close table; the laggier STOCK_DAY_ALL feed remains fallback-only
- Price provenance shown per holding (source + market date)
- Official TWSE / TPEx monthly-revenue research with MoM / YoY / cumulative YoY
- Official revenue sector pulse: latest-period industry median YoY, positive-growth breadth and >20% breadth, with minimum-sample and non-price-signal labels
- Official TWSE / TPEx valuation research with P/E, P/B and dividend yield, preserving source date and missing official fields
- Company Snapshot research home combining official price, valuation, revenue, margin and 10D institutional data without guessing missing values; quote-only ETFs are supported with company-only metrics explicitly marked not applicable
- Official MOPS 3-month revenue history and a real first Scanner gate (3 consecutive YoY > 20%)
- Official TWSE / TPEx 10-trading-day foreign and investment-trust net-flow gates
- Official MOPS single-quarter gross-margin history with strict three-quarter improvement gate
- Official Scanner states: pass / fail / insufficient / not applicable, with expandable source/date/value details
- Asset allocation
- Local ETF look-through: direct holdings + imported ETF-implied company exposure, with source/date provenance and unresolved-weight tracking
- Portfolio Risk: company / sector / TW-US market exposure, cash and unresolved ETF shares, Top 5 / Top 3 concentration, and resolved-company HHI
- Transaction / cash-flow ledger (deposit, withdrawal, buy, sell, dividend, fee)
- XIRR money-weighted return, event-boundary Exact TWR when complete, and transparent Modified Dietz TWR proxy fallback
- Official TAIEX Total Return benchmark comparison with explicit actual trading-date alignment
- **Real local daily net-worth snapshots** instead of a fabricated trend line
- Four-gate Official Scanner using only official/non-demo Taiwan market data
- Investment journal
- Versioned JSON full backup/import with Zod validation (v4 adds account + DEMO/personal metadata; v1-v3 remain readable)
- Holdings CSV import/export and downloadable template
- ETF composition CSV import/export with strict weight validation and no automatic normalization
- Dark mode
- Installable PWA shell and offline cache
- Sonner interaction feedback
- Vitest calculation/import tests
- GitHub Actions CI and GitHub Pages deployment

> Taiwan closing prices, monthly revenue, institutional flows, and quarterly gross-margin inputs now come from official TWSE / TPEx / MOPS sources. The Scanner evaluates all four intended gates and marks special statement families such as financial/insurance as not applicable instead of forcing a general-industry gross-margin formula. Your personal portfolio calculations use only the holdings, prices, costs and FX rate you enter yourself.

## Zero-cost mode

The default product requires:

- GitHub repository
- GitHub Pages
- browser localStorage

It does **not** require:

- paid database
- paid market API
- AI API
- brokerage credentials
- App Store account

A previously prepared Supabase integration remains in source for possible future use but is **not enabled in the self-use UI** and no PortfolioPilot Supabase project is required.

## Stack

- Next.js 16
- TypeScript
- Tailwind CSS 4
- Radix Dialog
- Lucide
- Recharts
- Zod
- Papa Parse
- Sonner
- Vitest

See `docs/GITHUB_TOOL_AUDIT.md` for the GitHub/open-source review and adoption decisions, `docs/MARKET_DATA.md` for the Taiwan market caches, `docs/QUARTERLY_GROSS_MARGIN_GATE.md` for the official single-quarter gross-margin methodology, `docs/ETF_LOOKTHROUGH.md` for ETF composition provenance and exposure calculation, `docs/PORTFOLIO_RISK.md` for concentration methodology and coverage boundaries, `docs/EXACT_TWR.md` for event-boundary performance methodology, `docs/BENCHMARK.md` for official benchmark source and alignment rules, `docs/VALUATION_DATA.md` for valuation cache provenance and trust rules, `docs/COMPANY_SNAPSHOT.md` for cross-cache company research join and display rules, and `docs/REVENUE_SECTOR_PULSE.md` for the sector aggregation methodology. See `docs/SMART_HOLDING_ENTRY.md` for Taiwan holding autofill behavior and trust boundaries.

## Local development

```bash
npm install
npm run dev
```

Quality gate:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## GitHub Pages

Set:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Then pushing to `main` deploys the static site.

## Data safety

Portfolio data is stored in the current browser. Daily snapshots are updated automatically once per local calendar day (and updated when today's holdings change).

Before changing phones, clearing browser data, or making a large import, use:

**我的 → 完整備份 → 匯出 JSON**

CSV is intended for holdings and ETF-composition interchange. JSON is the authoritative full backup because it also includes ETF source data, activities, journal entries and snapshot history.

## Product principles

- useful for the owner before monetization
- zero-cost first
- mobile first, desktop enhanced
- local/private data ownership
- explicit backup before cloud sync
- no automated trading
- no brokerage passwords
- no AI in the current roadmap
- market data must identify source, timestamp and usage rights before becoming production data


## V0.19 stability / UX pass

- Activity and TWR-boundary dialogs persist before closing, matching the holding-form mobile safety fix.
- Official Taiwan price updates never regress a holding to an older dated quote and preserve TWSE/TPEx venue identity when known.
- A cache fetched today may legitimately point to an earlier trading date on a weekday market holiday.
- PWA market-data cache keys are canonicalized so cache-busting query strings do not grow Cache Storage without bound.
- USD/TWD editing is atomic: users can clear/type freely and commit only on blur or Enter.
- Journal delete actions require confirmation and save/delete actions provide feedback.


## V0.20 search / research UX pass

- Global search uses the same official-security catalog as smart holding entry, so Taiwan ETFs are discoverable before they are held.
- Quote-only non-equity instruments such as warrants are excluded from smart holding/global security search.
- ETF research keeps official close/source/date while leaving company revenue, margin and company Scanner fields explicitly not applicable.
- TWSE source links accept the newer `TWSE MI_INDEX` provenance name instead of disappearing because of an exact-name mismatch.


## V0.20.1 market refresh hardening

- Quarterly MOPS requests alternate between the current and legacy official MOPS hosts when transient network failures occur.
- Quarterly refresh retries transient failures up to six attempts with backoff.
- The updater requests only the six most recent completed calendar quarters instead of scanning two full years, reducing unnecessary traffic while preserving enough cumulative periods to derive the latest three single-quarter gross margins.


## V0.21 mobile / research UX pass

- Research holding identity is market-aware: TWSE and TPEx securities with the same code are no longer both marked held when the venue is known.
- Global search avoids duplicating a held security in both the “my holdings” and official-results sections.
- Held-security research routing preserves the known TWSE/TPEx venue and fails closed when a legacy holding is ambiguous.
- Mobile dialogs use the full dynamic viewport, respect iPhone safe-area padding, contain overscroll, and keep the title/close control sticky while long forms scroll.
- Empty personal home now presents a three-step onboarding path: add a holding, confirm personal fields, then update/research.


## V0.22 data safety / trust UX

- Invalid localStorage is preserved into a separate raw recovery backup before the app falls back to an empty safe state.
- If browser storage cannot safely preserve or write data, new mutations fail closed instead of pretending they were saved.
- Settings exposes recovery-backup export and explicit cleanup controls.
- The global shell surfaces a clear recovery/storage warning instead of silently hiding the problem.
- Home now reports Taiwan official-price coverage across all Taiwan investments, including manual/unknown holdings and mixed price dates, rather than showing only the newest date.


## V0.23 holding input integrity

- New holdings require a positive quantity and current price.
- Stock/ETF holdings require a positive real average cost so unrealized P/L cannot be fabricated from a zero-cost placeholder.
- Manual add/edit uses the same market + symbol + account identity rule as CSV import, preventing accidental double-counting inside one account.
- Duplicate detection keeps the add dialog open and points the user to the existing position instead of silently adding another row.
- If a user finishes typing an exact Taiwan symbol/name before official lookup data finishes loading, the form now applies the exact match as soon as the catalog arrives.


## V0.24 refresh / search feedback

- Taiwan quote refresh counts only holdings whose price/provenance/date actually changed.
- A matched holding that is already current now reports “already latest” instead of pretending it was updated.
- Refresh feedback shows TWSE and TPEx official dates separately so one market cannot hide another market's older date.
- Global search distinguishes official-data load failures from genuine no-result searches and provides an inline retry action.


## V0.25 manual US holding flow

- New US holdings can keep symbol and name simultaneously; manual typing no longer clears the opposite field.
- Switching an officially populated Taiwan holding to the US market clears the Taiwan official price, sector and provenance before saving.
- Editing an existing holding's symbol clears stale price/provenance so an old security price cannot remain attached to a new symbol.
- The form explicitly explains that US quote/name data remains manual in the zero-cost build.


## V0.26 cash P/L and recovery finalization

- Cash holdings contribute their current value as both value and cost basis, so cash never creates fake unrealized gains or losses.
- Portfolio unrealized P/L and gain percentage therefore reflect investment positions rather than idle cash.
- Clearing a local-data recovery backup now first writes the currently visible valid state as the new primary baseline, preventing the old invalid primary payload from recreating the warning on the next launch.


## V0.27 performance date integrity

- New transaction/cash-flow entries cannot use a future date.
- Current net contributions and dividend-minus-fee summaries ignore future-dated records from older backups or imported data.
- The performance page warns when future records exist instead of silently including them in today's metrics.
- XIRR and Exact TWR remain valuation-date bounded, so all major performance summaries now use a consistent current-date boundary.


## V0.28 snapshot zero-state integrity

- A brand-new empty portfolio still avoids creating meaningless zero-value daily snapshots.
- Once snapshot history exists, removing the final holding writes today's portfolio value as zero instead of leaving the pre-delete value behind.
- Today's snapshot is replaced in-place, preserving earlier history while keeping the current timeline consistent with the current portfolio.


## V0.29 persistence-confirmed UX

- App-level state mutations now return whether localStorage persistence actually succeeded.
- Holdings, Taiwan quote updates, activities, TWR boundaries, ETF composition changes, journal entries, JSON/CSV imports, FX changes and reset/demo actions only show success after persistence succeeds.
- Forms and dialogs stay open when persistence fails, so unsaved user input is not silently discarded.
- Journal fields are cleared only after a successful save.
- Theme changes remain usable even when browser storage is unavailable; the UI warns that the preference could not be remembered instead of throwing.


## V0.30 local-date consistency

- Investment journal entries use the device's local calendar date instead of UTC, preventing after-midnight entries from being recorded as the previous day.
- Recovery, JSON backup, holdings CSV and ETF composition export filenames use the same local-date convention.
- Local date formatting is covered by calculation tests.


## V0.31 Taiwan holding identity editing

- Official TWSE / TPEx symbol-name lookup now works while editing existing Taiwan holdings, not only when adding a new one.
- Changing a security identity clears stale price, sector and provenance until the new identity is confirmed.
- If the official catalog is unavailable or has no match, the form provides a real manual-entry mode where symbol and name can coexist.
- Manual mode can retry the official catalog or return to official search in one tap.
- Switching a holding to cash clears exchange price provenance; changing any manual symbol, including US holdings, clears stale security metadata.


## V0.32 cash balance entry

- Cash holdings now use a dedicated mobile-friendly flow: account + currency + current balance.
- Users no longer need to invent a cash symbol/name or understand quantity, market price and average-cost fields for cash.
- Cash is normalized internally to quantity 1 × balance, with the same balance as cost basis, so it never creates unrealized P/L.
- TWD cash maps to the Taiwan/TWD bucket and USD cash maps to the US/USD bucket for existing portfolio calculations.
- Editing legacy cash positions first preserves quantity × price as the full balance before normalizing to the simpler format.
- Changing cash currency clears the old numeric balance so a TWD amount cannot silently become the same number of USD.


## V0.33 cash card UX

- Cash holdings render as balances rather than stock positions.
- Cash cards show native-currency balance, TWD-converted value and total-asset weight.
- Quantity, ticker and percentage-gain fields are hidden for cash, and the card explicitly states that unrealized P/L is not calculated.
- Legacy cash positions display their full quantity × price balance even before the user opens the simplified editor.


## V0.34 performance snapshot integrity

- Current TWR Proxy ignores future-dated snapshots, matching the existing future-activity protection.
- Benchmark comparison receives only snapshots dated on or before the current local valuation date.
- Performance shows how many future snapshots were excluded instead of silently letting them affect today's return.
- Performance completeness counts only snapshots currently eligible for today's metrics.
- Activity filters now distinguish a genuinely empty ledger from an empty filtered result and offer one-tap filter clearing.


## V0.35 research partial-failure resilience

- Company Snapshot treats official quotes + latest monthly revenue as core data, while valuation, revenue history, institutional flow and quarterly-margin caches may fail independently.
- Optional research cache failures no longer blank the entire company page; available official sections remain visible and unavailable gates fail closed as insufficient.
- Scanner also tolerates individual revenue-history, institutional or quarterly cache failures and keeps unaffected gates usable.
- Reload preserves already loaded optional data when one source temporarily fails.
- A requested research security is never silently replaced by a different company when the requested key is unavailable.


## V0.36 venue-aware research holdings

- Research "held" identity now uses TWSE/TPEx + security code rather than code alone.
- Known exchange provenance never marks a same-code security on the other market as held.
- Holdings without exchange provenance resolve automatically only when the official research dataset contains exactly one venue for that code; ambiguous same-code cases fail closed.
- Company Snapshot, monthly revenue, official valuation and Scanner now share the same venue-aware held logic.


## V0.37 activity type integrity

- Switching activity type clears fields that no longer apply, preventing hidden trade values from leaking into deposits, withdrawals, dividends or fees.
- Save-time normalization enforces the same rules even if stale UI state exists.
- Deposits/withdrawals store no security symbol, quantity or trade price.
- Dividends/fees may keep a symbol but never keep trade quantity/price.
- Buy/sell entries require a security symbol.
- Legacy external-flow rows with stale quantity/price no longer render those stock-trade fields in the activity card.


## V0.38 overview future-snapshot integrity

- Home overview now excludes snapshots dated after the device-local current date before calculating recent daily change, period change, or chart trends.
- Future-dated snapshots remain preserved in local data; they are ignored rather than deleted.
- The overview surfaces how many future snapshots were excluded and the local cutoff date.
- Shared snapshot filtering is covered by regression tests so a future import cannot silently distort current net-worth movement.
