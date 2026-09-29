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
