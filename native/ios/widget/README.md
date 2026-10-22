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

## Data sharing contract — opt-in only

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

**Privacy:** the containing App now has `PortfolioWidgetSyncPlugin` registered through `PortfolioWidgetBridgeViewController`. Native opt-in is stored separately as `portfolio-widget-enabled-v1` (default: false) in the same App Group. The widget checks this flag every time it reads the local snapshot; the native writer also requires it. On revoke the writer marks the flag false, removes `portfolio-widget-snapshot-v1`, and asks WidgetKit to reload both kinds. Only a minimized snapshot is passed; never holdings quantities, account labels, average cost, activity history, trade ledger, or journal text. Demo mode and a fresh empty install display the safe empty state. Snapshot values are from local portfolio calculations and official daily closing-price cache, **not live quotes**. The example JSON above is only a contract illustration.

**iPhone controls:** Native App → 我的 → iPhone 主畫面小工具 → 允許小工具顯示摘要. Confirm the explicit privacy dialog. Switch off with `關閉並清除小工具資料`. The iPhone main home screen may be visible to other people: even with `.privacySensitive()` the small widget can reveal a meaningful personal financial summary while device is unlocked. The Lock Screen widgets are not enabled in this milestone.

**Native bridge build:** During `npm run native:ios:add`, `install-ios-widget.mjs` injects both App-target `.swift` files, changes the generated SceneDelegate and storyboard to instantiate the custom Capacitor view controller, registers both Swift sources in the PBX App target, and preserves the existing host + widget App Groups entitlements. A bad/unsigned App Group provisioning environment fails closed rather than pretending sync succeeded. Confirm a signed install on a real device before treating the feature as released.

**Safeguards:** all widget writes are guarded twice (JS + native preference); invalid/ambiguous/future market dates are omitted, not estimated; native decodes and validates the JSON contract and bounds its size; WidgetKit refreshes are only requests, not guaranteed immediate reloads.

## Build and signing

`npm run native:ios:add` creates a fresh Capacitor SPM project and deterministically installs the widget target and host embed phase. `npm run native:ios:verify` verifies those artifacts. Run the macOS Native iOS Smoke Gate before merging. Never manually edit generated `ios/` as the source of truth.

Before TestFlight/App Store: the owning Apple Developer Team must register **both** bundle IDs and the matching App Group capability/provisioning profiles. An unsigned simulator build does not prove signing or real-iPhone readiness. If required provisioning is missing, signed upload must fail closed. The existing manual TestFlight confirmation gate remains intact.
