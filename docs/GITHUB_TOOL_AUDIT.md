# GitHub Tool Audit — PortfolioPilot

Date: 2026-09-29

Goal: build the most useful **zero-cost, local-first web/PWA version** of PortfolioPilot before paying for any backend, market-data service, AI service, or app-store distribution.

This audit is about reusable engineering ideas and permissively licensed libraries. It does **not** authorize copying product code whose license would change PortfolioPilot's obligations.

## 2026-09-29 usability-tool review

The AssetMetra comparison triggered a second pass focused on navigation, mobile interaction, search and dense portfolio views.

| Project | License | Current status | Decision |
| --- | --- | --- | --- |
| dip/cmdk | MIT | public, not archived | useful command-menu reference; **not added** because existing Radix Dialog can provide the current command/search surface without another runtime dependency |
| kentcdodds/match-sorter | MIT | public, not archived | strong fuzzy-search candidate; **not added yet** because symbol/name/industry search is small enough for a deterministic in-repo scorer |
| TanStack/table | MIT | public, active | keep as the preferred future desktop research-grid tool; current mobile-first card flows do not need a data-grid dependency |
| emilkowalski/vaul | MIT | public, not archived | drawer interaction is useful, but current Radix bottom-sheet dialog already covers the required mobile forms; avoid duplicate modal stacks |

The decision is intentionally conservative: a GitHub tool is valuable only when it removes meaningful complexity. PortfolioPilot should not add a package merely because a competitor has a similar interaction.

## Adopt now

| Project | License | What is useful | PortfolioPilot decision |
| --- | --- | --- | --- |
| shadcn-ui/ui | MIT | open-code component patterns and visual consistency | keep as design reference; current components remain owned in-repo |
| radix-ui/primitives | MIT | accessible dialog/popover primitives | already used for dialogs |
| lucide-icons/lucide | ISC/MIT-derived icons | consistent icon system | already used |
| recharts/recharts | MIT | responsive React/SVG charts | already used for net-worth chart |
| colinhacks/zod | MIT | runtime validation of untrusted imports | **adopted** for JSON/CSV validation |
| mholt/PapaParse | MIT | reliable browser CSV parse/unparse | **adopted** for holdings CSV import/export |
| emilkowalski/sonner | MIT | compact interaction feedback | **adopted** for save/import/export feedback |
| vitest-dev/vitest | MIT | fast TypeScript unit tests | **adopted** for portfolio and import/export logic |

## Strong candidates when needed

| Project | License | Why it matters | Trigger to adopt |
| --- | --- | --- | --- |
| dexie/Dexie.js | Apache-2.0 | IndexedDB wrapper for larger local-first datasets | when transactions, price history, or thousands of snapshots outgrow simple localStorage |
| TanStack/table | MIT | headless sort/filter/group data grids | when research/holdings tables become large on desktop |
| TanStack/query | MIT | network fetch caching, refetch and async state | when real TWSE/TPEx/MOPS data is connected |
| serwist/serwist | MIT | advanced PWA caching/service-worker strategies | when current lightweight service worker becomes insufficient |
| microsoft/playwright | Apache-2.0 | Chromium/Firefox/WebKit end-to-end tests | once the public Pages URL is stable enough for browser regression tests |
| tradingview/lightweight-charts | Apache-2.0 | fast interactive financial charts | when PortfolioPilot has real OHLC/time-series data |
| react-hook-form/react-hook-form | MIT | scalable form state and validation integrations | when transaction/account forms become complex |

## Deliberately not adopted now

**Vaul** is MIT but its repository currently states that it is unmaintained. PortfolioPilot already has a working Radix-based mobile/modal interaction layer, so adding an unmaintained drawer dependency does not improve the zero-cost MVP enough.

**Ghostfolio** and **Wealthfolio** are both AGPL-3.0. Their public product ideas are useful references: local/private data ownership, import/export, PWA/mobile-first, performance analytics, goals, allocation, transactions, multiple accounts, and risk analysis. PortfolioPilot should **study the product concepts only** and not copy their source into this codebase.

**Portfolio Performance** is Eclipse Public License 1.0. It is useful as a feature benchmark for serious portfolio accounting, but there is no need to copy its implementation.

## Product lessons extracted from the open-source ecosystem

The recurring successful pattern is not “show more stock data.” It is:

1. local/private ownership of financial records;
2. reliable import/export before cloud sync;
3. performance history based on stored snapshots or transactions;
4. clear allocation/risk views;
5. mobile-first daily checks with a denser desktop view;
6. market data as a replaceable adapter rather than business logic;
7. testing around calculations and imports because silent financial-data errors are worse than visual bugs.

## Zero-cost architecture decision

For the self-use stage:

```text
GitHub
  ↓
GitHub Pages
  ↓
Next.js static PWA
  ↓
localStorage
  ├─ holdings
  ├─ notes
  ├─ exchange rate
  └─ daily net-worth snapshots
  ↓
JSON full backup
CSV holdings import/export
```

No paid database, paid market API, AI API, brokerage connection, or subscription system is required.

## Next tool adoption order

1. Finish local-first usability and daily snapshot history.
2. Add transaction/cash-flow ledger.
3. Add true performance calculations (TWR / XIRR).
4. Move only the large historical datasets to Dexie/IndexedDB.
5. Add official/free market-data adapters.
6. Add TanStack Query only after network data exists.
7. Add Lightweight Charts only after real time-series data exists.
8. Add Playwright E2E tests when the deployed URL is stable.

This order keeps the product useful and maintainable without paying for infrastructure.
