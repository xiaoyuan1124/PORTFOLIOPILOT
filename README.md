# PortfolioPilot

PortfolioPilot is a **zero-cost, local-first, mobile-first investment portfolio PWA** for personal use on phones and desktop browsers.

## Current self-use build

- Decision-cockpit dashboard with net-worth range controls, cash level, account distribution, top positions and data freshness
- Global stock/navigation search (⌘K / Ctrl+K) with direct Taiwan company research
- Multi-account holdings and cash-flow tracking with account-aware CSV import/export
- Explicit DEMO mode; new installs start empty so simulated holdings cannot masquerade as personal assets
- Responsive dashboard with desktop sidebar and mobile bottom navigation
- Add/edit/delete TW / US stocks, ETFs and cash
- Smart Taiwan holding entry: type either symbol or name, choose an official TWSE/TPEx match, and auto-fill the paired field, market, asset type, currency, latest close, industry/category and price provenance
- Search and sort holdings
- TWD / USD portfolio valuation
- Per-holding and total unrealized return
- One-tap Taiwan closing-price refresh from a repository-cached official TWSE / TPEx dataset
- Price provenance shown per holding (source + market date)
- Official TWSE / TPEx monthly-revenue research with MoM / YoY / cumulative YoY
- Official revenue sector pulse: latest-period industry median YoY, positive-growth breadth and >20% breadth, with minimum-sample and non-price-signal labels
- Official TWSE / TPEx valuation research with P/E, P/B and dividend yield, preserving source date and missing official fields
- Company Snapshot research home combining official price, valuation, revenue, margin and 10D institutional data without guessing missing values
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
