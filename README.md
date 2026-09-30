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
- Held-security material-events center using official TWSE / TPEx MOPS OpenAPI disclosures, preserving company statement time, fact date, rule, subject and original description without sentiment or buy/sell labels
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

PortfolioPilot currently contains no Supabase runtime client or database migration dependency; personal portfolio state remains browser-local.

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


## V0.39 imported date integrity

- JSON/local-state validation now requires real YYYY-MM-DD calendar dates for activities, journals, snapshots, ETF composition dates and holding price as-of dates.
- Impossible dates such as 2026-02-31 and malformed date strings fail closed instead of entering sorting, performance or trust displays.
- ETF CSV date input keeps whitespace trimming compatibility before strict calendar validation.
- Regression tests cover malformed activity dates, impossible snapshot dates and invalid official price as-of dates.


## V0.40 imported activity integrity

- Activity integrity rules now apply to JSON/local-state parsing as well as the interactive form.
- Imported buy/sell rows without a security symbol fail closed.
- Legacy deposits/withdrawals deterministically discard stale symbol, quantity and trade-price fields while preserving valid external-flow time/boundary data.
- Imported dividends/fees keep an optional normalized symbol but discard stale trade quantity/price and non-applicable time fields.
- Regression tests cover both safe legacy normalization and missing trade identity rejection.


## V0.41 state identity integrity

- JSON/local-state parsing now enforces the same holding identity rule as interactive and CSV flows: market + normalized symbol + account must be unique.
- Duplicate IDs within holdings, ETF compositions, journals or activities fail closed to prevent ambiguous rendering and destructive actions.
- Duplicate ETF market + symbol identities fail closed instead of silently presenting multiple composition sources for one ETF.
- Duplicate net-worth snapshot dates fail closed so one calendar day cannot contain two competing portfolio values.
- Regression tests cover duplicate holding identity, activity IDs, snapshot dates and ETF identities.


## V0.42 holding numeric integrity

- JSON/local-state and holdings CSV imports now reject zero quantity or zero current price instead of treating missing investment data as a valid zero.
- Stock and ETF average cost must be greater than zero during import, matching the interactive holding form.
- Cash imports require a positive balance value; legacy cash average-cost fields remain tolerated because cash P/L never uses them.
- The rules now match the V0.23 interactive holding safeguards across every supported holding-entry path.
- Regression tests cover zero quantity, price, average cost and zero cash-balance imports.


## V0.43 local-first dependency cleanup

- Removed the unused Supabase browser client and dormant cloud-sync migration from the repository.
- Removed `@supabase/supabase-js` from runtime dependencies.
- No user-facing behavior changed; PortfolioPilot continues to store personal portfolio state only in browser localStorage.
- This keeps the current build aligned with the zero-cost, local-first architecture and avoids an unnecessary cloud SDK / supply-chain surface.


## V0.44 holding market / currency integrity

- JSON/local-state and holdings CSV imports now reject TW holdings marked as USD or US holdings marked as TWD, preventing accidental double conversion or missing conversion in portfolio totals.
- TWSE / TPEx price provenance can only be attached to Taiwan securities and must include an official data date.
- A price data date without a corresponding source fails closed instead of appearing trustworthy without provenance.
- Cash cannot carry stale exchange price source/date metadata.
- Regression tests cover market/currency mismatches, incomplete official provenance and stale cash provenance.


## V0.45 activity amount integrity

- JSON/local-state parsing now rejects zero-value transaction and cash-flow records, matching the interactive activity form.
- A zero-value deposit/withdrawal can no longer be counted as an external cash flow and incorrectly make Exact TWR look incomplete.
- Imported TWD activities normalize fxRate to 1, matching runtime calculation semantics and preventing meaningless stale FX values in backups.
- USD activities keep their explicitly supplied historical USD/TWD rate.
- Regression tests cover zero-amount rejection and TWD FX normalization.


## V0.46 CSV overwrite integrity

- Holdings CSV now fails closed when the file itself contains duplicate market + symbol + account identities instead of silently keeping the last row.
- Before a CSV merge overwrites an existing holding with the same identity, the UI explicitly reports the number of affected positions and asks for confirmation.
- Cancelling the confirmation leaves the current portfolio unchanged.
- Successful overwrite imports clearly report how many existing positions were replaced.
- Regression tests cover duplicate rows inside a CSV and existing-position conflict counting.


## V0.47 quick inventory reconciliation

- Holdings now provide a single quick-reconciliation workflow for updating multiple positions at once from the current broker inventory.
- Stocks and ETFs can batch-correct quantity, current price and average cost without reopening each holding editor.
- Cash rows use a single balance field and remain normalized internally as 1 × balance with no unrealized P/L.
- Security identity, account, market and currency are intentionally read-only during quick reconciliation.
- If a user manually changes a current security price, stale TWSE/TPEx provenance is cleared and the price is explicitly marked manual; quantity/cost-only changes preserve official source/date.
- The entire correction is persisted atomically through the existing app-state save path, with validation failing closed on invalid or stale rows.


## V0.48 held material-events center

- Research now includes a dedicated 「持股重訊」 view that only shows official material disclosures matching currently held Taiwan securities.
- Data comes from TWSE and TPEx daily MOPS OpenAPI endpoints; no media-news scraper, AI summary or subjective importance score is used.
- The build-time updater merges daily official snapshots into a rolling 45-calendar-day local cache so the PWA can stay zero-cost and does not need a runtime market-data server.
- Each event preserves company statement date/time, fact date, disclosure rule, subject, original description, venue and direct official-source metadata.
- Holding matching is deliberately strict: only positions with known TWSE/TPEx provenance are eligible, so a short announcement cache can never be used to guess the venue of a manual holding.
- GitHub Actions refreshes and deploys the material-event cache with the existing Taiwan market-data workflow.


## V0.48.1 market refresh partial-failure hardening

- A transient MOPS quarterly-financial refresh failure no longer blocks otherwise successful Taiwan quote, revenue, material-event and benchmark refreshes from being built and deployed.
- Quarterly refresh still retries and fails closed; when all retries fail, the workflow keeps the previously committed quarterly-margin cache instead of fabricating or partially publishing new quarterly data.
- GitHub Actions emits an explicit warning and job summary whenever this fallback is used, so stale quarterly research data cannot be mistaken for a successful fresh pull.


## V0.48.2 quarterly refresh timebox

- The optional MOPS quarterly-financial refresh is capped at four minutes in the market-data workflow.
- If the official endpoint remains slow or unavailable beyond that window, the step exits into the existing V0.48.1 fallback path, preserving the last valid quarterly-margin cache and continuing with other official-data updates.
- The quarterly updater writes its cache only after a complete derivation pass, so terminating the timed step cannot publish a partially written quarterly dataset.


## V0.49 official market sector pulse

- Research → 族群脈動 now has two focused views: **市場日行情** and the existing **月營收基本面**.
- Market pulse uses official TWSE / TPEx daily closing-change fields and the latest official monthly-revenue industry classification to aggregate sector-level daily breadth.
- Each sector shows median daily change plus advancing, declining and flat company shares, with separate TWSE / TPEx source dates.
- Ex-right / ex-dividend or otherwise non-comparable official rows are excluded instead of forcing a synthetic daily return.
- At least five comparable companies are required before an industry is shown; generic / unclassified industries remain excluded.
- The held-sector filter is venue-aware, so same-code TWSE / TPEx securities cannot silently cross-match.
- Market pulse is descriptive end-of-day data only. It does not label sectors as buy/sell, score investment value or forecast future returns.


## V0.49.1 market-data writer serialization

- The full Taiwan market-data workflow and the lightweight closing-quote workflow now share one writer concurrency group, so only one cache-writing job can run at a time.
- Both writer workflows explicitly check out the latest `main` branch when execution begins instead of writing from a stale trigger SHA.
- This prevents simultaneous quote-cache commits from racing into non-fast-forward pushes while keeping the lightweight after-close refresh schedule intact.
- Data commits made with the workflow token remain non-recursive, so serialization does not create an Actions loop.


## V0.50 daily portfolio drivers

- Overview now answers “今天我的資產為什麼變動？” with a dedicated daily-drivers card.
- Taiwan holding impact is estimated from official TWSE / TPEx comparable closing-price changes multiplied by the currently held quantity; it is explicitly labeled an estimate rather than exact trade-level attribution.
- Positive and negative holding contributors are separated so users can see which current positions pushed or dragged the portfolio estimate.
- External deposits and withdrawals for the current local date are shown separately from investment movement, preserving the distinction between net-worth change and investment return.
- Today’s official held-security material-event count and the strongest / weakest held-sector daily breadth context are shown alongside the holding contribution estimate.
- Venue ambiguity, non-comparable quote rows and mixed official quote dates fail closed. Older-date holdings are excluded from the daily total rather than silently mixed across trading dates.
- The card tolerates partial research-source failure: missing material-event or revenue context does not hide a valid official quote contribution estimate.


## V0.51 target allocation and drift

- Portfolio now includes a **配置目標** tab for defining a personal target allocation and comparing it with the current portfolio.
- Targets are asset-based rather than account-based: the same stock / ETF held across multiple broker accounts is aggregated into one target bucket.
- TWD and USD cash are tracked as separate target buckets.
- The first target edit starts from the current allocation as a neutral baseline; users can then change percentages to their own plan.
- Saved targets must total 100%, reject duplicate keys and are included in local storage plus version-5 JSON backups.
- Legacy local state and version-1 through version-4 backups migrate with an empty target set.
- Drift is shown in percentage points as current allocation minus the user’s own target. The UI does not convert drift into buy, sell or rebalance instructions.
- Targets for assets no longer held can remain visible at 0% current allocation, while currently held but untargeted assets appear with a 0% target so hidden exposure cannot disappear from the comparison.


## V0.52 dividend center

- Portfolio now includes a **股息** tab that summarizes only dividend activities already recorded by the user and dated no later than today.
- The center shows current-year, trailing-12-month, current-month and lifetime recorded dividend income in TWD equivalent.
- USD dividend records use each activity’s saved historical FX rate rather than the current USD/TWD rate.
- A rolling 12-month chart, per-symbol totals and annual totals are derived from actual recorded cash receipts.
- Future-dated dividend records are excluded from received-income totals and surfaced as excluded records instead of being treated as expected income.
- Dividend records without a symbol remain included in total cash received but are grouped under **未指定** rather than guessed against a holding.
- The center intentionally does not forecast future dividend dates, amounts or yields from historical patterns. Future forecast work will remain separate from actual received-income accounting.


## V0.53 Taiwan broker inventory CSV adapter

- Settings now includes a dedicated **台灣券商庫存 CSV** import path for current holdings / inventory exports, separate from PortfolioPilot's own canonical CSV format.
- The adapter recognizes common Chinese and English header aliases for security code, held quantity, average cost, account and venue.
- Only security code, held quantity and average cost are required from the broker file. Security name, stock / ETF type, industry, current closing price, price source and as-of date are resolved from PortfolioPilot's bundled TWSE / TPEx official-data catalog.
- A file-level fallback account is required; if the CSV includes an account field, the row-level account wins.
- Explicit 上市／上櫃 or TWSE／TPEx venue hints are supported. Same-code cross-venue ambiguity fails closed when no venue hint is supplied.
- Unknown securities, invalid numbers, duplicate inventory identities and transaction-style files without average cost are rejected atomically; no partial import is written.
- Existing holding merge protection remains in force: matching market + symbol + account rows require explicit overwrite confirmation.
- This adapter intentionally imports current inventory only. It does not infer transaction history, realized P/L, cash flows or trade chronology from broker statements.


## V0.54 managed trade → inventory integration

- New buy / sell entries can now be linked directly to an existing non-cash holding. V0.54 treats the current holdings at upgrade time as the inventory baseline; legacy trade rows remain historical-only and are never replayed into inventory.
- Managed trades are forward-only from the current day in the UI, preventing historical backfill from being double-counted against an inventory state that already reflects those past trades.
- Buys update quantity and weighted-average cost. Explicit fees and transaction taxes are included in acquisition basis.
- Sells reduce quantity using average-cost accounting, preserve the remaining average cost, and store realized P/L after fees and transaction taxes. Fully sold positions are removed from current holdings.
- The holding's current market price and TWSE / TPEx provenance are not replaced by the trade execution price.
- Each managed trade stores a before / after holding snapshot plus fee, tax, realized P/L and accounting method in backup V6.
- Deleting the latest managed trade attempts an exact inventory rollback. Rollback fails closed if a later managed trade exists for the same holding or the current holding was manually edited / reconciled after the trade.
- Managed USD trades preserve the transaction FX rate for realized-P/L TWD conversion.
- The activity ledger now labels inventory-applied trades and surfaces cumulative realized P/L from V0.54 managed sells.


## V0.55 corporate share adjustments

- The activity ledger now supports **股數調整** as a non-cash corporate action for proportional share changes such as stock splits, reverse splits and stock-dividend-style share increases.
- Users select an existing holding and enter a share ratio: 2 means 1-for-2 split, 0.2 means 5-for-1 reverse split, and 1.1 means a 10% share increase.
- Quantity is multiplied by the ratio while average cost is divided by the same ratio, preserving total cost basis.
- Current market price and TWSE / TPEx price provenance remain untouched; the event only adjusts inventory quantity and cost basis.
- Corporate actions are forward-only from the current day, matching the V0.54 inventory baseline model and avoiding historical double application.
- Each event stores before / after holding snapshots in backup V7 and can be exactly rolled back when it is the latest linked inventory event for that holding.
- Rollback fails closed if a later linked trade / corporate action exists or the holding has been manually edited / reconciled.
- Corporate actions carry zero cash amount and remain separate from deposits, withdrawals, dividends and fees.
- Cash subscriptions, rights offerings and other actions involving additional cash are intentionally not treated as simple share adjustments; they should be recorded with their actual cash / trade flows instead of being guessed.


## V0.56 cash-account linkage

- New forward-only ledger events now update explicit cash holdings instead of leaving cash and activity history as parallel records.
- Managed buys atomically update the selected security and subtract gross cost + fees + taxes from a same-currency cash holding. Insufficient cash fails closed before any state is written.
- Managed sells atomically reduce the security holding and add net proceeds after fees / taxes to the selected same-currency cash holding.
- New deposits, withdrawals, dividends and standalone fees also update a selected cash holding. Withdrawals and fees cannot create negative cash.
- If an event reduces a cash balance exactly to zero, the zero-value cash holding is removed while the event retains a full before / after snapshot so rollback can restore it.
- Every new cash-linked event stores the cash holding ID, before / after snapshot, signed cash delta and reason in backup V8.
- Trade rollback now validates both the security snapshot and linked cash snapshot. It fails closed if either side drifted or a later linked event touched the same security or cash account.
- Cash-only event rollback likewise requires the event to be the latest linked event for that cash holding and refuses to overwrite later manual reconciliation.
- USD cash-linked events preserve the saved historical FX rate; TWD events normalize FX to 1.
- Deposits / withdrawals remain the only activity types allowed to carry Exact TWR pre-flow boundaries.
- Legacy V0.55-and-earlier activities are not replayed into cash. V0.56 uses the current cash holdings as the migration baseline to prevent double-counting old transactions.
- The UI requires an existing cash holding rather than inventing a starting balance. Users can create TWD / USD cash from the Holdings page before recording new cash-linked events.
