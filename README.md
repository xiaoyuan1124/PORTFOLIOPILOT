# PortfolioPilot

PortfolioPilot is a **mobile-first investment portfolio and research PWA** built for phones and desktop browsers.

## Current MVP

- Responsive dashboard with desktop sidebar and mobile bottom navigation
- Local portfolio management with add/edit/delete holdings
- TWD / USD portfolio valuation
- Asset allocation and net-worth charts
- Taiwan-stock research cards using clearly labelled demo data
- Rule-based scanner (no AI)
- Investment journal
- JSON export/import
- Dark mode
- Installable PWA shell and offline cache
- Optional Supabase email/password login and manual cross-device sync
- Row Level Security migration for user-owned cloud data
- GitHub Actions CI and GitHub Pages deployment

> The current research dataset is illustrative demo data and is **not live market data or investment advice**.

## Stack

- Next.js 16
- TypeScript
- Tailwind CSS 4
- Radix Dialog
- Lucide icons
- Recharts
- Supabase JS (optional cloud sync)
- Static export for GitHub Pages

## Local development

```bash
npm install
npm run dev
```

Quality gate:

```bash
npm run lint
npm run typecheck
npm run build
```

## Cloud sync

PortfolioPilot remains fully usable without a backend. To enable cross-device sync, create a **dedicated PortfolioPilot Supabase project**, apply:

```
supabase/migrations/202609270001_initial_user_sync.sql
```

and configure:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

See `docs/CLOUD_SYNC.md`.

Never put a Supabase secret or service-role key in the frontend.

## GitHub Pages

The repository includes a Pages workflow. In GitHub, set:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Then pushing to `main` deploys the static site.

For cloud sync, the two **publishable** Supabase environment variables must be available at build time. If that is inconvenient with Pages, Vercel can be used later without changing the product UI.

## Data / privacy

The base MVP stores portfolio and journal data in the current browser's `localStorage`. Cloud sync is manual and opt-in so another device never silently overwrites local investment records.

No brokerage credentials are requested.

## Product principles

- Mobile first, desktop enhanced
- Portfolio clarity before market noise
- Local-first with explicit cloud sync
- No automated trading
- No brokerage credentials
- No AI in the current roadmap
- Research data must identify its source and freshness before production use
