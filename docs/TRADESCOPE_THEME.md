# TradeScope-inspired third appearance — PortfolioPilot

## User story
Keep the original **淺色** (warm parchment) and **深色** (forest) modes untouched. Add a selectable **TradeScope** mode based on the supplied dark trading dashboard screenshot. The third mode is a color system, not an import of the source application's brand, logo, layout or code.

## Visual tokens

| Element | Color |
|---|---|
| Main canvas | `#0b0e0c` |
| Sidebar | `#080b0a` |
| Analytics card | `#111514` |
| Raised surface | `#181c19` |
| Hairline borders | `#292d28` |
| Navigation / emphasis gold | `#d1a75e` |
| Gains / good statuses | `#32cb95` |
| Losses / negative statuses | `#ed727c` |
| Primary text | `#e5e8e1` |
| Secondary text | `#9b9e94` |

These are approximate thematic colors sampled/derived from the supplied visual reference, not claimed to be an exact copy of a third-party design system.

## UX
- Header top-right icon cycles: **淺色 → 深色 → TradeScope → 淺色**.
- **我的 → 外觀主題** exposes three tappable preview swatches for direct selection.
- Accessible labels, focus rings, `aria-pressed` choices and `aria-current` navigation state.
- On every change, the existing `portfoliopilot:theme` localStorage key is updated to `light`, `dark`, or `tradescope`. The two original stored values still work and the previously supported system preference fallback remains unchanged.
- No AppState schema, holdings, cloud API, Supabase, WidgetKit metadata, or brokerage order code changes.

## Implementation
- `src/lib/app-theme.ts`: immutable mode labels, swatches, legacy preference parsing and theme cycling.
- `src/components/app-shell.tsx`: state application, persistence, topbar shortcut, accessible nav current-page semantics.
- `src/components/settings.tsx`: direct selector in the existing Settings tab.
- `src/components/ui.tsx`: semantic styling hooks for cards, primary buttons, badges, modals and disclosures.
- `src/app/globals.css`: scoped `html.theme-tradescope` colors. The third theme also adds `.dark` so existing dark contrast utilities continue to work without rewriting every component.

## Verification
- `src/lib/app-theme.test.ts`: old value migration, complete three-way cycle and class-state tests.
- `scripts/mobile-layout-smoke.mjs`: all existing portfolio research/CSV interactions plus theme switch/cycle, persisted reload, computed background checks and captures on 375/390/430 px iPhones and 844 px landscape.
- Release only when GitHub CI (lint, typecheck, unit tests, static and native builds) and mobile-layout browser checks pass. A physically signed App Store/TestFlight build remains a separate deployment gate.
