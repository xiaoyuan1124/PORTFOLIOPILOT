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

## Non-goals for V0.83 foundation

- No subscription / IAP yet
- No paid market-data provider
- No broker login or trading
- No AI API
- No cloud account system
- No changes to the LocalStorage portfolio model

## Platform requirement

Capacitor 8 can be configured from Windows, but compiling and validating the iOS target requires macOS, Xcode, and Xcode Command Line Tools.
