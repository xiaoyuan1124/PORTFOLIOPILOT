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
