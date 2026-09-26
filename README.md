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
- GitHub Actions CI and GitHub Pages deployment

> The current research dataset is illustrative demo data and is **not live market data or investment advice**.

## Stack

- Next.js 16
- TypeScript
- Tailwind CSS 4
- Radix Dialog
- Lucide icons
- Recharts
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

## GitHub Pages

The repository includes a Pages workflow. In GitHub, set:

**Settings → Pages → Build and deployment → Source → GitHub Actions**

Then pushing to `main` deploys the static site.

## Data / privacy

The MVP stores portfolio and journal data in the current browser's `localStorage`. No brokerage credentials are requested. Do not treat browser-local storage as a permanent backup; use the Settings export feature.

A production backend (for sync, auth, and scheduled official market data) should be added only after a dedicated backend project and data licensing are confirmed.

## Product principles

- Mobile first, desktop enhanced
- Portfolio clarity before market noise
- No automated trading
- No brokerage credentials
- No AI in the current roadmap
- Research data must identify its source and freshness before production use
