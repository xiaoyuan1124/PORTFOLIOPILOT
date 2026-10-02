# PortfolioPilot Native Device Validation

Status baseline: V0.84.0

This checklist separates CI evidence from physical-device evidence. A successful Simulator compile is not a claim that touch, file transport, privacy overlays, or OS permission UX has passed on a real phone.

## Already covered by CI

- Next.js / GitHub Pages static build
- Native static export without the GitHub Pages base path
- Capacitor iOS shell generation with Swift Package Manager
- Capacitor plugin sync
- iOS PrivacyInfo.xcprivacy validation for Preferences
- Swift Package dependency resolution
- unsigned generic iOS Simulator compile
- unsigned Release .xcarchive generation and archived bundle metadata verification
- TypeScript, ESLint, Vitest
- pure native deep-link parsing
- durable-storage envelope validation
- privacy preference default / explicit-disable rules

## Required iPhone acceptance before App Store submission

1. Launch from a clean install and confirm the Native bundle opens without a network connection.
2. Confirm safe-area spacing on a notched / Dynamic Island device in portrait.
3. Open Overview, Portfolio, and Research charts. Drag, tap, scroll, and rotate the device; confirm Recharts never traps page scrolling or drops taps.
4. Background the app, open the iOS App Switcher, and confirm PortfolioPilot content is obscured while Native privacy protection is enabled.
5. Disable Native privacy protection in Settings, repeat the App Switcher check, then re-enable it and relaunch the app to confirm the preference persists.
6. Request notification permission only from the explicit Settings action. Schedule the test notification and tap it; confirm it opens the intended stock/ETF research page or notification settings fallback.
7. Export the full JSON backup. Confirm a usable file/share destination appears and the exported JSON can be opened outside PortfolioPilot.
8. Re-import that JSON backup and confirm schema validation, overwrite confirmation, holdings, transactions, ETF compositions, notes, and snapshots survive.
9. Export holdings CSV and historical-trade audit CSV. Confirm the files can be opened in Files / Numbers / Excel-compatible apps.
10. Import holdings, broker inventory, and historical-trade CSV from Files. Confirm cancel, malformed file, duplicate rows, and successful imports all behave without partial writes.
11. Force-quit and reopen after edits. Confirm portfolio state survives and the Native Preferences durability copy restores data if WebView LocalStorage is intentionally cleared in a development build.
12. Toggle dark mode, force-quit, relaunch, and confirm the visual preference remains correct.
13. Leave the app backgrounded for more than 60 seconds, return, and confirm the existing market-data freshness/revalidation path runs without losing navigation state.
14. Test airplane mode with previously loaded data. Core portfolio, notes, calculations, and bundled data should remain usable; unavailable fresh data must fail gracefully.

## Android acceptance when the Android shell is added

- Repeat the storage, notification, deep-link, offline, dark-mode, chart, and file transport checks.
- With Native privacy protection enabled, confirm screenshots and screen recording are blocked because the official plugin applies Android FLAG_SECURE.
- Disable privacy protection and confirm screenshots work again.
- Confirm Android notification channels and inexact scheduling behave without requesting exact-alarm permission.

## Deferred until evidence requires replacement

Browser `<input type="file">` remains the import mechanism and Blob + `<a download>` remains the export mechanism. Do not add Filesystem, Share, or a third-party file picker until physical-device testing reproduces a concrete failure or unacceptable UX.
