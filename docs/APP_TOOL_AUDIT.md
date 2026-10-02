# PortfolioPilot App Tool Audit

Snapshot: 2026-10-02

This audit is for the Capacitor 8 App track. The decision rule is: add a dependency only when it closes a demonstrated App gap, stays compatible with the zero-backend/local-first product, and can pass the existing Web + Native gates.

## Existing stack

| Tool | Web / PWA | Capacitor iOS | Android later | Native replacement | Main limitation / review impact | Cost | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Next.js 16 static export | Yes | Yes, bundled static output | Yes | No | Server-only Next features are unavailable by design | $0 | Keep |
| React 19 / TypeScript | Yes | Yes | Yes | No | None specific to App Store | $0 | Keep |
| Tailwind CSS 4 | Yes | Yes | Yes | No | CSS only | $0 | Keep |
| Recharts 3 | Yes | Yes, SVG in WebView | Yes | No evidence yet | Touch density and very large datasets still require real-device testing | $0 | Keep |
| Radix Dialog | Yes | Yes | Yes | No | Must keep focus/keyboard behavior usable in WebView | $0 | Keep |
| lucide-react | Yes | Yes | Yes | No | SVG icon rendering only | $0 | Keep |
| sonner | Yes | Yes | Yes | No | Web toast; native replacement is not required | $0 | Keep |
| zod | Yes | Yes | Yes | No | Pure JS validation | $0 | Keep |
| papaparse | Yes | Yes | Yes | No | Parsing is fine; picker/export transport is a separate concern | $0 | Keep |
| clsx / tailwind-merge | Yes | Yes | Yes | No | Pure JS/CSS utility | $0 | Keep |
| Vitest / ESLint | Build-time | Build-time | Build-time | No | Not shipped as runtime capability | $0 | Keep |
| Capacitor 8 / @capacitor/app | N/A bridge | Yes | Yes | Already native bridge | Requires platform-specific validation | $0 | Keep |
| @capacitor/local-notifications 8.3.1 | Native feature hidden on Web | Yes | Yes | Already native | Permission UX must remain explicit | $0, no backend | Keep; V0.83.1 |
| Service Worker | Yes | No longer registered in Native | N/A in Native | Native bundle/offline behavior replaces it | Native registration was unnecessary | $0 | PWA only |
| LocalStorage | Yes | Session/cache only after V0.83.2 | Session/cache only | Preferences for Native durability | Mobile OS may clear WebView storage | $0 | Replace as sole Native durable store |
| GitHub Actions | CI | Builds/tests iOS shell | Can add Android gate later | No | macOS minutes are the only practical CI resource concern | existing plan | Keep |
| GitHub Pages | Yes | Not Native runtime | Not Native runtime | No | PWA delivery only | $0 | Keep |

Safe Area is already implemented with `env(safe-area-inset-*)` and `viewport-fit=cover`. Dark mode already follows stored preference/system preference. Native foreground lifecycle is already bridged through `@capacitor/app`.

Browser JSON/CSV import currently uses `<input type="file">`; export uses Blob + `<a download>`. Do not replace these until real-device validation proves a Native limitation. Parsing itself stays PapaParse.

## Candidate repositories

Stars are a point-in-time GitHub snapshot and can change.

| Candidate | Snapshot | License / archive | Capacitor 8 / platforms | Backend / commercial constraint | PortfolioPilot decision |
| --- | --- | --- | --- | --- | --- |
| ionic-team/capacitor-plugins | ~680 stars; active 2026 | MIT packages; not archived | Official Capacitor 8 plugins, iOS/Android/Web depending plugin | None | A: use official plugins first |
| @capacitor/preferences | 8.0.1 | MIT; official | core >=8; iOS UserDefaults, Android SharedPreferences, PWA LocalStorage fallback | None; Apple PrivacyInfo reason CA92.1 required | A: add now; V0.83.2 |
| @capacitor/local-notifications | 8.3.1 | MIT; official, not archived | core >=8; iOS/Android; Web does not provide equivalent native delivery | No server required for local notifications | A/B: foundation already added; Smart Alerts later |
| ionic-team/capacitor-assets | official 3.0.5 | MIT; not archived | iOS/Android/PWA asset generation | None | A: integrated in V0.83.4 as a build-time tool |
| capacitor-community/sqlite | ~663 stars; 8.1.1 | MIT; not archived | Capacitor 8; iOS/Android/Web adapter | No backend; higher migration/complexity cost | D: defer until state/query volume justifies a DB |
| ionic-team/capacitor-privacy-screen | official | MIT; not archived | Native iOS/Android only; core >=8 | None | A: added in V0.83.3 |
| capacitor-community/privacy-screen | ~103 stars | MIT; maintenance/legacy path | Older community implementation | None | E: do not add; official plugin supersedes it |
| aparajita/capacitor-biometric-auth | ~226 stars; v10.0.0 | MIT; not archived | Capacitor 8, iOS/Android, SPM; Web simulation | Face ID requires NSFaceIDUsageDescription | D: add only with an explicit App Lock feature |
| RevenueCat/purchases-capacitor | ~233 stars; v13.7.0 | MIT SDK; not archived | core >=8; iOS/Android | Uses RevenueCat service and App Store / Play billing | C: evaluate when Plus/Pro IAP begins |
| tradingview/lightweight-charts | ~17.4k stars; v5.2.1 | Apache-2.0 + NOTICE attribution requirement | Web canvas works in WebView | No backend, but public TradingView attribution/link required | D: do not replace Recharts without measured need |
| Cap-go/capacitor-file-picker | ~6 stars; v8.2.0 | MPL-2.0; not archived | Capacitor 8; iOS 15+, Android API 24+, Web | No backend | D: only if real Native picker failure is reproduced |

## A–E execution order

**A — now:** official Local Notifications (V0.83.1), official Preferences (V0.83.2), official Privacy Screen (V0.83.3), and Capacitor Assets (V0.83.4 build tooling) are integrated.

**B — Smart Alerts phase:** build the rule model and local scheduling on top of the existing Local Notifications foundation. Price-threshold alerts cannot be promised as reliable background monitoring without a reliable background data-refresh design; do not add a backend just to claim that feature.

**C — paid subscription phase:** RevenueCat is a valid Capacitor 8 option, but only when Plus/Pro entitlements and App Store/Play billing are actually implemented. Do not add it as an idle dependency.

**D — defer:** SQLite, biometric auth, secure storage, Cap-go File Picker, Filesystem/Share replacement, and Lightweight Charts. Each has a plausible future use, but no current defect justifies adding the dependency now. Official Filesystem/Share should be preferred if native export/share testing later proves the browser path insufficient.

**E — replace / retire:** Native-only reliance on WebView LocalStorage is replaced by Preferences durability; Service Worker stays PWA-only; do not adopt the maintenance-mode community privacy-screen plugin when the official Ionic plugin exists.

## App Store-specific notes

- Preferences requires an iOS privacy manifest entry for `NSPrivacyAccessedAPICategoryUserDefaults` with approved reason `CA92.1`.
- Filesystem, if later added, brings its own required-reason API declaration and should enter through a dedicated audited slice.
- Face ID requires a human-readable `NSFaceIDUsageDescription`.
- IAP/subscriptions should not be wired until the paid entitlement model is defined and can be tested end-to-end.
- No current dependency introduces a paid market-data API, broker credential flow, AI service, or cloud account requirement.
