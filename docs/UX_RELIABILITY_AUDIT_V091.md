# PortfolioPilot V0.91 UX / reliability audit (2026-10-08)

This audit describes the **existing** UI and specific next actions. It is not a replacement product plan. PortfolioPilot remains mobile-first, Local-first, zero backend, zero paid APIs, no AI, no brokerage login or trading automation; TWSE and TPEx closing prices must retain independent official dates and fail-closed behavior.

## Implemented in PR #140

- Manual holdings refresh returns an **inline, dismissible status panel** instead of stacking multiple Sonner toasts over the iPhone status bar.
- Status distinguishes no-change, partial update, unavailable official data, and a failed local save; it never reports unsupported ETF constituents as a successful update.
- For held Taiwan ETFs, displays unsupported symbols and official issuer fetch failures separately, plus Taiwan-local ETF cache generation time; links to ETF look-through / manual CSV import.
- PWA Service Worker data fallbacks carry an explicit offline marker; manual refresh displays offline/stale status and **does not overwrite** local holdings or ETF constituents with offline fallback bytes.
- Cache is applied to the latest local portfolio state if users edit holdings while fetches are in flight; concurrent refresh taps are ignored.
- Mobile holdings actions: **Add position** primary/full-width, **Sync data** and **Quick correction** secondary; search spans full width, account and sort occupy one row.
- Portfolio and Research secondary navigation have >=44px touch targets and expose selected state to accessibility APIs.
- Existing exact TWR, Modified Dietz labeling, no-auto-order, PWA, app identity, market refresh schedules, and notification implementation remain untouched.

## Button hierarchy and page structure

| Area | First screen / primary action | Secondary actions | Advanced / destructive actions |
|---|---|---|---|
| Bottom navigation | Home / Portfolio / Research / My, keep four persistent icons | Header search, mode indicator, theme | No critical action as an unlabeled icon |
| Home | Net worth, official data status/date, one CTA to add/inspect holdings | Day drivers, exposure, watchlist summary | Detailed analytics below first screen |
| Portfolio > Overview > Holdings | Portfolio amount, **Add position** | Sync official closing cache, quick correction | Search, account/sort, each holding's research/edit/delete |
| Portfolio > Overview > ETF look-through | Known vs unresolved coverage, source dates | CSV import/export | Never infer missing holdings or hide unresolved exposure |
| Portfolio > Overview > Risk | Largest exposures and coverage before details | Drill into company/sector | Alerts are attention notices, not buy/sell scores |
| Portfolio > Activity | Trades/cash flows as primary | Dividend ledger, imports | Reversals / corrections should be explicit |
| Portfolio > Performance | Returns and their data sufficiency first | Report, CSV, Markdown, print | Distinguish Exact TWR, TWR Proxy and XIRR |
| Portfolio > Planning | Allocation targets | Drift explanation | Changes to targets must not place orders |
| Research > Security | Stock/ETF symbol lookup | Stock snapshot / ETF deep analysis | Source links and date visible on all derived results |
| Research > Market | Market information + publication date | Material events, sector, revenue, valuation | Avoid unsourced intraday data |
| Research > Strategy | Watchlist | Configurable Scanner and official-data limitations | No trading call-to-action |
| Research > Notes | Local journal | Exports | No off-device sync without explicit opt-in |
| My | Backup/export and data integrity first | Native privacy and notifications | Restore/reset gated by warnings |

Small-screen principles: one clearly colored primary CTA per context; secondary actions visually subdued; keep short labels, >=44px touch targets, visible current section, status summaries outside overlays, dangerous actions labeled and confirmed, horizontal secondary nav scrollable. Do not move risk/coverage details ahead of the main task.

## Prioritized next features / quality gates

| Priority | Candidate | Specific acceptance criteria | Guardrails |
|---|---|---|---|
| P0 | iPhone visual regression pass | Real iPhone screenshots at standard text and Large Text: toast/status bar, bottom nav, modal keyboard, landscape and long warning text | Native simulator CI alone does not prove layout |
| P0 | Offline/stale-cache transparency | Offline fallback labeling and no-write behavior implemented; next: real-device online/offline regression and explicit TWSE/TPEx generatedAt visibility | No unauthorized live quote |
| P0 | Local data restore drill | Test backup -> reset test instance -> restore -> verify holdings, watchlist, activities, ETF compositions, TWR boundaries | Never upload portfolios to CI/servers |
| P1 | ETF support diagnostics | Compare issuer-source map to held symbols; show coverage and last success per fund; add authorized official issuer connectors only when proven reliable | No guessed constituents; latest cache currently includes 00935 and 009816 |
| P1 | ETF composition-change notices | Diff verified dated issuer snapshots and show added/removed/weight changes | App-open/foreground evaluation only, no 24/7 claims |
| P1 | Per-market quote integrity checks | Detect stale or inconsistent TWSE vs TPEx dates and avoid cross-market overwrites; deterministic tests for gaps and holidays | Fail closed |
| P1 | Allocation drilldown | Link each concentration notice to affected direct stock and ETF look-through components | Unknown ETF coverage remains unknown |
| P1 | Financial history import audit | Preview CSV rows, fees and cash flow mappings before commit; reversible batch changes | Local-only |
| P2 | Report readability / print QA | Print 1-page summary before appendices, overflow-free long Chinese names, coverage/return definitions in footnotes | No remote PDF service |
| P2 | Scanner reproducibility | Show rule configuration, official data observation date, missing gates, exportable result provenance | Not a predictive or advisory score |
| P2 | Accessibility navigation audit | VoiceOver labels, focus flow, 200% text, contrast, min tap target; selected-state semantics | Preserve dark/light consistency |
| P2 | Native reminder acceptance | Confirm permission, deny/re-enable, once/day dedupe, click deep links, monthly schedule in real iPhone | Native local-notifications only |

## Known limitations

The ETF source list in the current repository cache includes 009816 with status `ok`; a user seeing 'unsupported' may be viewing an older cached asset. Confirm the cache **timestamp actually loaded in the client** before diagnosing issuer coverage. Quote refresh and ETF constituent coverage are separate operations, so neither should silently imply the other succeeded. The app has not yet been verified end-to-end on the user's physical iPhone for this UI change.

## Release gate

Exact-head lint, typecheck, deterministic tests, Web export and native Web bundle must pass. If native packaging files or Capacitor contracts change, rerun the iOS Smoke Gate. Re-read latest main for data commits before squash-merge; verify post-merge main CI and GitHub Pages; keep TestFlight signing keys untouched.
