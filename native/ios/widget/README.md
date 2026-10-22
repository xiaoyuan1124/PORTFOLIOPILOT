# PortfolioPilot WidgetKit Foundation

**Scope:** native iOS WidgetKit extension generated into the Capacitor SPM Xcode shell. This does not change the GitHub Pages site or upload user holdings.

- Host bundle ID: `com.sy1124.portfoliopilot`.
- Widget bundle ID: `com.sy1124.portfoliopilot.widgets`.
- Shared App Group: `group.com.sy1124.portfoliopilot`.
- Group UserDefaults key: `portfolio-widget-snapshot-v1`, UTF-8 JSON **string**.
- Target minimum: iOS 17; host remains at its existing minimum.
- Two home-screen widgets: small portfolio summary and medium watchlist.
- Snapshot refresh: the widget reads only the last local snapshot; WidgetKit may throttle reloads. **Never live quotes.**
- Click: `portfoliopilot://portfolio?tab=risk`, routed by the existing native deep-link handler.

## Future data contract — not populated yet

```json
{
  "version": 1,
  "enabled": true,
  "isDemo": false,
  "generatedAt": "2026-10-22T10:00:00.000Z",
  "totalTwd": 0,
  "gainPct": null,
  "quoteDate": null,
  "watchlist": [
    {
      "symbol": "2330",
      "name": "台積電",
      "close": 0,
      "changePct": null,
      "date": "2026-10-22"
    }
  ]
}
```

**Important:** no containing-App producer is enabled in this foundation milestone. Without an explicit opt-in and validated shared snapshot, the widgets show privacy-preserving empty states. Xcode previews are not tied to personal holdings. Future implementation must separately add a Capacitor native bridge, only write minimized permitted fields after user opt-in, clear the snapshot when the user disables sharing, and call `WidgetCenter.shared.reloadAllTimelines()` after a verified write or clear. Keep real amounts off the Lock Screen by default. The sample JSON is a contract example, **not a market quote or demo user holding**.

## Build and signing

`npm run native:ios:add` creates a fresh Capacitor SPM project and deterministically installs the widget target and host embed phase. `npm run native:ios:verify` verifies those artifacts. Run the macOS Native iOS Smoke Gate before merging. Never manually edit generated `ios/` as the source of truth.

Before TestFlight/App Store: the owning Apple Developer Team must register **both** bundle IDs and the matching App Group capability/provisioning profiles. An unsigned simulator build does not prove signing or real-iPhone readiness. If required provisioning is missing, signed upload must fail closed. The existing manual TestFlight confirmation gate remains intact.
