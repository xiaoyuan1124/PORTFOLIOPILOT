# PortfolioPilot V0.83 App Readiness

V0.83 starts the native packaging track without replacing the existing GitHub Pages PWA.

## Architecture

- Web UI: existing Next.js static export
- Native runtime: Capacitor 8
- Native web directory: `out`
- iOS bundle identifier: `com.sy1124.portfoliopilot`
- Data model: Local-first, unchanged
- Backend: none
- Paid API: none
- GitHub Pages deployment: remains supported

## Build modes

### GitHub Pages

`npm run build`

GitHub Actions keeps the existing `/PORTFOLIOPILOT` base path.

### Native static bundle

`npm run native:build`

The native build explicitly removes the GitHub Pages base path so assets resolve from the local Capacitor bundle.

### Create the iOS shell

On macOS with Xcode installed:

`npm run native:ios:add`

Capacitor 8 uses Swift Package Manager by default; the command keeps SPM explicit for reproducibility.

After the iOS project exists:

`npm run native:sync`

Then:

`npm run native:ios:open`

## Lifecycle

The native runtime bridge maps Capacitor foreground events into PortfolioPilot's existing resume-revalidation mechanism. This keeps official market history and benchmark views from remaining stale after the native app has been backgrounded.

## V0.83.1 Native Notification Foundation

The first native-only product capability uses the official `@capacitor/local-notifications` plugin.

- Web / GitHub Pages never requests notification permission.
- Native permission is requested only after an explicit user action in Settings.
- Test notifications are local-only and require no backend or paid service.
- Notification payloads carry a PortfolioPilot deep link that can open a specific TWSE/TPEx stock or ETF research page.
- Android test notifications explicitly avoid exact alarms, so V0.83.1 does not request exact-alarm privileges.
- The service worker remains a PWA concern and is not registered inside the Capacitor native shell.

Smart Alert rules, recurring schedules, subscriptions, and remote push are deliberately deferred.

## V0.83.2 Native Storage Durability

Capacitor Native now adds the official `@capacitor/preferences` plugin as a durable recovery layer for the portfolio state.

- GitHub Pages / PWA keeps the existing LocalStorage behavior.
- Native startup checks Preferences before presenting portfolio data.
- Existing valid WebView LocalStorage data is migrated into Preferences on first Native launch.
- Native and WebView copies carry a monotonic revision so an interrupted async write cannot let an older Preferences copy overwrite a newer local session copy.
- If WebView storage is cleared but Preferences survives, the Native copy restores the validated PortfolioPilot state.
- Invalid Native payloads are preserved through the existing recovery-backup path before any replacement.
- A Preferences write failure is surfaced as a durability warning without pretending that all local writes failed.
- SQLite remains deferred because the current portfolio state is a lightweight JSON document without complex local queries or high write volume.

The generated iOS shell also receives `PrivacyInfo.xcprivacy` with
`NSPrivacyAccessedAPICategoryUserDefaults` / `CA92.1`, as required for Preferences usage.
The Native iOS smoke gate validates that manifest and its Xcode resources entry before compiling.

## Non-goals for V0.83 foundation

- No subscription / IAP yet
- No paid market-data provider
- No broker login or trading
- No AI API
- No cloud account system
- No SQLite/database migration; Web/PWA continues to use LocalStorage

## Platform requirement

Capacitor 8 can be configured from Windows, but compiling and validating the iOS target requires macOS, Xcode, and Xcode Command Line Tools.
