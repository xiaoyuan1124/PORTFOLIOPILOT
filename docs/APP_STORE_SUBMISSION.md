# PortfolioPilot App Store Submission Checklist

Baseline version: 0.84.1
Bundle ID: `com.sy1124.portfoliopilot`

This file distinguishes repository/CI evidence from Apple Developer and App Store Connect actions that cannot be completed by source code alone.

## Repository-controlled and gated

- [x] Unique bundle identifier is fixed in Capacitor and iOS packaging metadata.
- [x] Marketing version and build number have a repository source of truth.
- [x] App display name is configured reproducibly.
- [x] Native AppIcon and splash resources are generated from repository-owned source art.
- [x] App Store 1024 icon entry is verified during CI.
- [x] Preferences required-reason privacy manifest is included in the Xcode resources build phase.
- [x] Public privacy-policy page exists at `/privacy/`.
- [x] Public support page exists at `/support/`.
- [x] Settings exposes privacy and support links inside the app.
- [x] Xcode / iOS SDK floor is checked against the current App Store upload minimum used by this release line.
- [x] Debug iOS Simulator build is gated.
- [x] unsigned Release `.xcarchive` generation and archived app metadata verification are gated.
- [x] Local Notifications, Preferences, and Privacy Screen native plugins compile through Swift Package Manager.
- [x] No broker credentials, automatic trading, cloud account, AI API, advertising SDK, or analytics SDK is included.

## Required before signed distribution

- [ ] Run the physical-iPhone checklist in `docs/NATIVE_DEVICE_VALIDATION.md`.
- [ ] Confirm AppIcon and launch appearance on a real current iPhone in light and dark system appearances.
- [ ] Confirm JSON/CSV export and import behavior through the real iOS Files/share surfaces.
- [ ] Confirm local notification permission, delivery, and notification-tap deep link on a real device.
- [ ] Confirm the privacy screen obscures portfolio data in the real iOS App Switcher.
- [ ] Choose signing Team and provisioning profile under the Apple Developer account.
- [ ] Increment `buildNumber` in `native/app-store.json` before uploading another build with the same marketing version.
- [ ] Create/select the matching App Store Connect app record before the first upload.
- [ ] Confirm an explicit App ID matching `com.sy1124.portfoliopilot` exists in the Apple Developer account.
- [ ] Configure automatic signing in Xcode or create an App Store Connect provisioning profile tied to the matching App ID and an Apple Distribution certificate.
- [ ] Produce a signed Release Archive and validate it in Xcode Organizer.
- [x] Guarded manual GitHub Actions path for signed archive + App Store Connect upload is implemented.
- [ ] Configure the four required GitHub Secrets listed in `docs/TESTFLIGHT_UPLOAD.md`.
- [ ] Run the guarded TestFlight workflow successfully from `main`.
- [ ] Confirm Apple accepts and processes the uploaded exact Version/Build.
- [ ] Run TestFlight acceptance against the uploaded build, not a development shell.

## App Store Connect metadata still required

- [ ] Create/select the App Store Connect app record for `com.sy1124.portfoliopilot`.
- [ ] Set app name, subtitle, primary language, primary category, SKU, and availability.
- [ ] Set Privacy Policy URL to `https://xiaoyuan1124.github.io/PORTFOLIOPILOT/privacy/`.
- [ ] Set Support URL to `https://xiaoyuan1124.github.io/PORTFOLIOPILOT/support/`.
- [ ] Complete the current age-rating questionnaire.
- [ ] Complete App Privacy answers from the final shipping binary and every third-party SDK actually included.
- [ ] Confirm export-compliance questions for the final binary.
- [ ] Add final App Store description, keywords, promotional text where applicable, and review notes.
- [ ] Capture required screenshots from the final UI on supported display classes.
- [ ] Confirm copyright / content-rights declarations and any financial-content disclaimers needed for the chosen distribution regions.
- [ ] Review pricing and territories. IAP is intentionally absent from 0.83.4.
- [ ] Submit only after all links are public and functional.

## Current privacy declaration preparation

The current product architecture is local-first and has no PortfolioPilot-operated account server, analytics SDK, advertising SDK, broker connection, AI service, or cloud portfolio sync. User-entered portfolio data stays on the device.

The app does request public static app/market resources over the network. Hosting/network providers can receive ordinary connection metadata under their own policies. App Store Connect privacy answers must be reviewed again immediately before submission so they reflect the final binary and current third-party behavior; this checklist does not substitute for the App Store Connect questionnaire.

## Apple requirement references checked for this baseline

- Apple Upcoming Requirements: App Store uploads require Xcode 26+ and the iOS 26 SDK+ as of April 28, 2026.
- Apple App Review Guideline 5.1.1: all apps need an easily accessible privacy policy link both in App Store Connect metadata and inside the app.
- Apple App Store Connect Help: a Privacy Policy URL is required for iOS apps, and App Privacy data-handling answers are required for App Store distribution.
- Apple Xcode app-icon documentation: an App Store iOS icon uses the 1024-point AppIcon source, with system-generated smaller variants where applicable.
- Apple bundle documentation: `CFBundleShortVersionString` uses three period-separated integers; `CFBundleVersion` identifies each build iteration.
