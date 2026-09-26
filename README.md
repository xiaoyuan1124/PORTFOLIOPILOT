# PortfolioPilot

PortfolioPilot is a **zero-cost, local-first, mobile-first investment portfolio PWA** for personal use on phones and desktop browsers.

## Current self-use build

- Responsive dashboard with desktop sidebar and mobile bottom navigation
- Add/edit/delete TW / US stocks, ETFs and cash
- Search and sort holdings
- TWD / USD portfolio valuation
- Per-holding and total unrealized return
- One-tap Taiwan closing-price refresh from a repository-cached official TWSE / TPEx dataset
- Price provenance shown per holding (source + market date)
- Official TWSE / TPEx monthly-revenue research with MoM / YoY / cumulative YoY
- Official MOPS 3-month revenue history and a real first Scanner gate (3 consecutive YoY > 20%)
- Official TWSE / TPEx 10-trading-day foreign and investment-trust net-flow gates
- Asset allocation
- Transaction / cash-flow ledger (deposit, withdrawal, buy, sell, dividend, fee)
- XIRR money-weighted return and transparent Modified Dietz TWR proxy
- **Real local daily net-worth snapshots** instead of a fabricated trend line
- Rule-based research scanner (currently clearly-labelled demo research data)
- Investment journal
- Versioned JSON full backup/import with Zod validation
- Holdings CSV import/export and downloadable template
- Dark mode
- Installable PWA shell and offline cache
- Sonner interaction feedback
- Vitest calculation/import tests
- GitHub Actions CI and GitHub Pages deployment

> Monthly revenue and Taiwan closing prices now come from official TWSE / TPEx caches. The Scanner now has three official gates: 3-month revenue growth, foreign 10D net buying, and investment-trust 10D net buying. Quarterly gross-margin improvement remains pending, so results are labelled 3/4 rather than complete candidates. Your personal portfolio calculations use only the holdings, prices, costs and FX rate you enter yourself.

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

See `docs/GITHUB_TOOL_AUDIT.md` for the GitHub/open-source review and adoption decisions, and `docs/MARKET_DATA.md` for the Taiwan quote / revenue caches.

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

CSV is intended for holdings editing/interchange. JSON is the authoritative full backup because it also includes activities, journal entries and snapshot history.

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
