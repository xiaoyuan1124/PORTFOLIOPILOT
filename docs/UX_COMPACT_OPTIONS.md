# PortfolioPilot mobile UX — reduced-scroll design directions

This study responds to live user feedback: pages take too many swipes and the PilotQuant entry/top can appear visually obscured after swapping inner tabs. Design for **immediate understanding**, **progressive disclosure**, and a **clear path to details**; never delete important research evidence.

## A. Focus Dashboard (recommended for Home)
First screen: total assets, period change, cash %, one trend, one actionable data-quality alert. Below the fold: two links "看持股" and "市場研究". Secondary charts and daily explanatory prose live in collapsible panels or separate details screens. Ideal for a one-glance portfolio status.

## B. Task Tabs (implemented for PilotQuant)
Small title → stock/market search → strategy/capital → four out-of-sample metrics → one graph. Three mutually exclusive subviews: 回測摘要 / 未來情境 / 交易明細. Full 70/30 details, market benchmarks, data provenance and fee controls are **preserved** in expandable disclosures. Inner-tab navigation resets scroll to the top after the content swap. Short labels and two-column controls are intended for 375–430px mobile.

## C. Two-Pane Research (recommended for tablet/desktop)
At >= 1024px: fixed-width sticky left panel for ticker/strategy/config; right pane for graph, metrics and drilldowns. On phone: collapses to B with an optional bottom sheet for parameters. Useful for repetitive comparisons, but consuming the entire phone viewport with the configuration rail would be counterproductive.

## Acceptance metrics (target, not yet confirmed by product analytics)
- Stock research: first relevant result appears in roughly the first viewport after the app header.
- No first load of 18 KPI cells, two charts, complete trade log and a long description on a single phone page.
- Tap target >= 44px where practical; no top content overlaps the sticky app header, notch or safe area.
- Both 375 and 430px iPhone widths and landscape pass layout checks, with accessible labels and persistent stock context.
- Do not conceal source / risk details irretrievably: disclosures and task tab are reversible and keyboard accessible.

## Implemented scope (PR after this document)
- Strategy Lab `觀察價與舊策略 ↔ PilotQuant` resets scroll when swapping.
- PilotQuant mobile page: one-screen compact entry and summary; 3 result subviews; default collapsed advanced settings and full report.
- Chart and simulation formulas unchanged; trading, stored holdings and data-provenance validation remain unchanged.
- Existing desktop/mobile theme modes, GitHub Pages and Capacitor share this React view.
- Future sitewide A/C should be adopted **after** actual user review of the three patterns, not silently forced throughout the app.


## Systemwide task-first audit (Nov 11, 2026)

Use these established sources as design rules, not as claims about individual PortfolioPilot users:
- NN/g [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/): frequent decisions above advanced controls; clearly labeled next layer, no arbitrary multilayer nesting.
- NN/g [Information Scent](https://www.nngroup.com/articles/information-scent/): use task-specific labels that tell people what follows.
- Apple [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars): navigation stays in top-level tabs; actions belong within their respective screens.
- Apple [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars): avoid duplicated actions in every card.
- Baymard [Homepage and category UX (2026)](https://baymard.com/research-articles/ecommerce-navigation-best-practice): avoid overwhelming people with too many categories; evidence comes from ecommerce and is applied by analogy here, **not** asserted as PortfolioPilot user-study results.

| Priority | Must remain discoverable | Location |
|---|---|---|
| P0 | Warnings about storage integrity, stale or mismatched quotes, known unavailable source data | Above any disclosure where the affected task occurs |
| P1 | Assets, cash, gain/loss, largest concentration, day's price impact / material events | Home first-screen candidate |
| P2 | Holding selection, ticker research, backtest, one-click JSON export | Main navigation or directly labeled control |
| P3 | Technical indicators, historical strategy explanations, individual trade audit, sector/account breakdown | Single-level task disclosure or research tab |
| P4 | CSV templates/import batches, privacy/support links, device settings, irreversible resets | Settings section clearly labeled by consequence |

### Specific duplicated or overly prominent controls

| Before | After | Rationale |
|---|---|---|
| New-user home displayed three large tutorial cards ahead of the add-holding action | One compact `先建立第一筆持股` card with immediate `新增持股` button; full three-step help behind disclosure | P1 primary task comes before P3 onboarding explanation |
| Home three large buttons pointing to Research, Strategy Lab and Portfolio (also in 5-item global nav) | Removed, global nav remains | Saves visual height without losing a destination |
| Daily Drivers links to Research and Portfolio (also in main nav) | Removed; two high-value data signals remain in short summary | Avoid repeating navigation twice |
| Strategy Lab full RSI/KD/volume/fee controls before stock list | One summary `策略參數與延伸工具` | Primary task is scanning watched stocks, not tuning every period |
| Six watch cards with all six indicators, three justifications and edit controls expanded | Price, watch thresholds, source date, signal status, one `回測` button; full evidence and editing available per stock on demand | Keep risk/data gaps in view; make the list scannable |
| Four layers of default PilotQuant output on one page | `回測摘要 | 未來情境 | 交易明細` with deferred full report | Mutual exclusion by task |
| Settings had duplicate full JSON export entry | One prominent `匯出完整 JSON 備份` control, imports in named disclosure | Reduce ambiguity while keeping safety-first backup reachable |
| CSV template next to two primary import/export actions | `CSV 格式說明與下載範本` within stock CSV section | Template is a low-frequency helper, not a primary workflow |
| Low-frequency device tools and irreversible reset visible by default | Explicit `裝置功能、隱私與支援` and `危險操作：清空或重設資料` disclosures | Risky operations should not share the same visual weight as everyday research |
| Research internal navigation labeled `策略` while main nav also had `策略` | Internal label renamed `選股` (watchlist + Scanner) | Reduces misleading navigation scent without removing search functionality |

### Validation protocol, no fabricated time estimates

The Playwright read-only audit `scripts/ux-space-audit.mjs` compares the currently deployed public app to the proposed local PR preview at 390×844 and 375×812 in fresh isolated browser contexts. It writes measured document height, content height, count of visible buttons, buttons appearing on the first viewport, saved pixels, saved percentage and saved screenfuls to `mobile-artifacts/ux-space-metrics.json`. If data modes differ, the baseline is unavailable or a browser cannot load a section, **no percentage is reported**. These are screen-space measurements, not measured human task-completion times.

Candidate task path targets (navigation steps, not seconds):
- Check net worth and data health: zero internal navigation after landing on Home.
- View an observed stock's price and signal: one global Strategy tab; expand only if detailed evidence is needed.
- View first result of individual backtest: Strategy tab → PilotQuant; results are the default view without additional expansion.
- Export portable backup: Settings tab → prominent `匯出完整 JSON 備份` button (two taps).
- Import broker CSV: Settings tab → `資料匯入／匯出與 CSV 工具` → `選擇券商 CSV` (three taps); this low-frequency task intentionally costs one disclosure tap to save everyday visual space.

**A tap count does not equate to completion seconds.** Reliable human time-to-find requires task study with timed participants; this CI test only measures layout and interaction mechanics.

### Other changes
- Home prioritizes exposure and current quote coverage, while account/sector/top-five details move to a secondary panel.
- Daily impact and important-company events stay prominent; contribution chart, external cash flows, sector breakdown and methodology are grouped.
- Integrity alerts stay above disclosures: storage recovery remains visible; integrity detail automatically starts open when there are material warning categories.
- All storage and backtesting algorithms remain untouched; only navigation/presentation and labels changed.


## First reproducible page-height observations

GitHub Actions **Mobile UI Layout Smoke #102**, run ID [42860742822](https://github.com/xiaoyuan1124/PORTFOLIOPILOT/actions/runs/42860742822), completed its comparative Playwright measurement stage after the layout smoke failed on an ambiguous nested-summary selector. These are *real measured values* from the public main baseline versus the proposed preview, with fresh isolated browser contexts and consistent content mode, not manual pixel estimates.

| Screen | Viewport | Baseline height | Proposed height | Saved px | Saved % | Buttons before → after |
|---|---:|---:|---:|---:|---:|---:|
| Home | 390×844 | 4,403 | 2,388 | 2,015 | 45.8% | 20 → 15 |
| Strategy watchlist | 390×844 | 7,400 | 2,052 | 5,348 | 72.3% | 21 → 15 |
| PilotQuant | 390×844 | 3,670 | 1,330 | 2,340 | 63.8% | 14 → 13 |
| Settings | 390×844 | 4,313 | 1,141 | 3,172 | 73.5% | 20 → 11 |
| Home | 375×812 | 4,403 | 2,388 | 2,015 | 45.8% | 20 → 15 |
| Strategy watchlist | 375×812 | 7,400 | 2,052 | 5,348 | 72.3% | 21 → 15 |
| PilotQuant | 375×812 | 3,690 | 1,330 | 2,360 | 64.0% | 14 → 13 |
| Settings | 375×812 | 4,337 | 1,141 | 3,196 | 73.7% | 20 → 11 |

Comparisons are **default-collapsed page heights** and capture **visible button counts**, not number of all underlying interactive controls, not backend response speed, and not seconds saved. In 390px testing the total of four page lengths shrank from 19,786 to 6,911 px (12,875 px). Individual expanded details retain the original content and can lengthen the page on demand. The smoke failure was in the **test locator** (nested target editor summary matched twice), subsequently corrected; a clean end-to-end run must still pass before main merge.
